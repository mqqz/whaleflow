import { useEffect, useMemo, useRef, useState } from "react";

export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "error";

export interface LiveTransaction {
  id: string;
  hash: string;
  from: string;
  to: string;
  amount: string;
  type: "inflow" | "outflow";
  fee: string;
  block: number;
  timestamp: string;
  timestampMs: number;
  channel: "wallet" | "market";
}

interface UseLiveTransactionsOptions {
  network: string;
  token: string;
  minAmount: number;
  maxTransactions: number;
  whaleOnly: boolean;
  paused: boolean;
  flushIntervalMs: number;
}

interface StreamConfig {
  kind: "bitcoin" | "evm" | "binance";
  urls: string[];
  onOpenPayloads: string[];
  mapper: (raw: unknown) => LiveTransaction[];
  feeUnit?: string;
}

const MAX_BACKOFF_MS = 15000;
const MAX_QUEUE_SIZE = 200;
const WHALE_THRESHOLD = 100;
const WEI_PER_ETH = 1_000_000_000_000_000_000n;
const MAX_INFLIGHT_EVM_REQUESTS = 10;
const EVM_REQUEST_INTERVAL_MS = 120;
const BTC_DOMINANT_PARTICIPANTS = 2;
const BTC_COSPEND_PAIR_REPEAT_THRESHOLD = 2;
const BTC_COSPEND_WINDOW_PAIR_EVENTS = 4000;

const tokenToSymbol: Record<string, string> = {
  btc: "btcusdt",
  eth: "ethusdt",
  sol: "solusdt",
  bnb: "bnbusdt",
  xrp: "xrpusdt",
};

const evmNetworkConfig: Record<string, { urls: string[]; feeUnit: string }> = {
  ethereum: {
    urls: ["wss://ethereum-rpc.publicnode.com", "wss://eth-mainnet.g.alchemy.com/v2/demo"],
    feeUnit: "ETH",
  },
  bsc: {
    urls: ["wss://bsc-rpc.publicnode.com"],
    feeUnit: "BNB",
  },
  polygon: {
    urls: ["wss://polygon-bor-rpc.publicnode.com", "wss://polygon-mainnet.g.alchemy.com/v2/demo"],
    feeUnit: "MATIC",
  },
  arbitrum: {
    urls: ["wss://arbitrum-one-rpc.publicnode.com", "wss://arb-mainnet.g.alchemy.com/v2/demo"],
    feeUnit: "ETH",
  },
};

const formatClock = (timestampMs: number): string =>
  new Date(timestampMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const shortAddress = (address: string | undefined): string => {
  if (!address) {
    return "unknown";
  }

  if (address.length <= 12) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const parseHexBigInt = (value: unknown): bigint | null => {
  if (typeof value !== "string") {
    return null;
  }

  try {
    return BigInt(value);
  } catch {
    return null;
  }
};

const formatWei = (wei: bigint, fractionDigits: number): string => {
  const whole = wei / WEI_PER_ETH;
  const fraction = wei % WEI_PER_ETH;
  const fractionRaw = fraction
    .toString()
    .padStart(18, "0")
    .slice(0, fractionDigits)
    .replace(/0+$/, "");

  return fractionRaw.length > 0 ? `${whole.toString()}.${fractionRaw}` : whole.toString();
};

const mapBinanceTrade = (raw: unknown): LiveTransaction[] => {
  if (!raw || typeof raw !== "object") {
    return [];
  }

  const trade = raw as {
    a?: number;
    s?: string;
    q?: string;
    m?: boolean;
    l?: number;
    T?: number;
  };

  if (
    typeof trade.a !== "number" ||
    typeof trade.s !== "string" ||
    typeof trade.q !== "string" ||
    typeof trade.m !== "boolean" ||
    typeof trade.l !== "number" ||
    typeof trade.T !== "number"
  ) {
    return [];
  }

  const quantity = Number.parseFloat(trade.q);

  if (!Number.isFinite(quantity)) {
    return [];
  }

  const side = trade.m ? "outflow" : "inflow";

  return [
    {
      id: `${trade.s}-${trade.a}`,
      hash: `${trade.s}-${trade.a}`,
      from: trade.m ? "Aggressive Seller" : "Passive Seller",
      to: trade.m ? "Passive Buyer" : "Aggressive Buyer",
      amount: quantity.toFixed(quantity < 1 ? 4 : 2),
      type: side,
      fee: "n/a",
      block: trade.l,
      timestamp: formatClock(trade.T),
      timestampMs: trade.T,
      channel: "market",
    },
  ];
};

const createBitcoinMapper = () => {
  const pairCounts = new Map<string, number>();
  const pairHistory: string[] = [];
  const parent = new Map<string, string>();
  const clusterSize = new Map<string, number>();

  const ensureNode = (address: string) => {
    if (!parent.has(address)) {
      parent.set(address, address);
      clusterSize.set(address, 1);
    }
  };

  const find = (address: string): string => {
    ensureNode(address);
    const immediateParent = parent.get(address)!;
    if (immediateParent === address) {
      return address;
    }
    const root = find(immediateParent);
    parent.set(address, root);
    return root;
  };

  const union = (a: string, b: string) => {
    let rootA = find(a);
    let rootB = find(b);
    if (rootA === rootB) {
      return;
    }
    const sizeA = clusterSize.get(rootA) ?? 1;
    const sizeB = clusterSize.get(rootB) ?? 1;
    if (sizeB > sizeA) {
      [rootA, rootB] = [rootB, rootA];
    }
    parent.set(rootB, rootA);
    clusterSize.set(rootA, (clusterSize.get(rootA) ?? 1) + (clusterSize.get(rootB) ?? 1));
    clusterSize.delete(rootB);
  };

  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  const formatInputEntity = (address: string): string => {
    const root = find(address);
    const size = clusterSize.get(root) ?? 1;
    if (size <= 1) {
      return shortAddress(address);
    }
    return `entity:${root.slice(0, 6)}(${size})`;
  };

  return (raw: unknown): LiveTransaction[] => {
    if (!raw || typeof raw !== "object") {
      return [];
    }

    const envelope = raw as {
      op?: string;
      x?: {
        hash?: string;
        time?: number;
        inputs?: Array<{ prev_out?: { addr?: string; value?: number } }>;
        out?: Array<{ addr?: string; value?: number }>;
      };
    };

    if (envelope.op !== "utx" || !envelope.x) {
      return [];
    }

    const tx = envelope.x;
    if (typeof tx.hash !== "string" || typeof tx.time !== "number") {
      return [];
    }

    const inputs = (Array.isArray(tx.inputs) ? tx.inputs : [])
      .map((input) => {
        const addr = input?.prev_out?.addr;
        const value = input?.prev_out?.value;
        if (typeof addr !== "string" || typeof value !== "number" || value <= 0) {
          return null;
        }
        return { addr, value };
      })
      .filter((input): input is { addr: string; value: number } => input !== null);

    const outputs = (Array.isArray(tx.out) ? tx.out : [])
      .map((output) => {
        const addr = output?.addr;
        const value = output?.value;
        if (typeof addr !== "string" || typeof value !== "number" || value <= 0) {
          return null;
        }
        return { addr, value };
      })
      .filter((output): output is { addr: string; value: number } => output !== null);

    if (inputs.length === 0 || outputs.length === 0) {
      return [];
    }

    const uniqueInputAddresses = [...new Set(inputs.map((input) => input.addr))];
    for (let i = 0; i < uniqueInputAddresses.length; i += 1) {
      for (let j = i + 1; j < uniqueInputAddresses.length; j += 1) {
        const key = pairKey(uniqueInputAddresses[i]!, uniqueInputAddresses[j]!);
        const next = (pairCounts.get(key) ?? 0) + 1;
        pairCounts.set(key, next);
        pairHistory.push(key);
        if (pairHistory.length > BTC_COSPEND_WINDOW_PAIR_EVENTS) {
          const staleKey = pairHistory.shift();
          if (staleKey) {
            const staleCount = pairCounts.get(staleKey) ?? 0;
            if (staleCount <= 1) {
              pairCounts.delete(staleKey);
            } else {
              pairCounts.set(staleKey, staleCount - 1);
            }
          }
        }
        if (next >= BTC_COSPEND_PAIR_REPEAT_THRESHOLD) {
          union(uniqueInputAddresses[i]!, uniqueInputAddresses[j]!);
        }
      }
    }

    const dominantInputs = [...inputs]
      .sort((a, b) => b.value - a.value)
      .slice(0, BTC_DOMINANT_PARTICIPANTS);
    const dominantOutputs = [...outputs]
      .sort((a, b) => b.value - a.value)
      .slice(0, BTC_DOMINANT_PARTICIPANTS);

    const inputSatoshis = inputs.reduce((sum, input) => sum + input.value, 0);
    const outputSatoshis = outputs.reduce((sum, output) => sum + output.value, 0);
    const feeBtc = Math.max(inputSatoshis - outputSatoshis, 0) / 100_000_000;

    const edges: LiveTransaction[] = [];
    let edgeIndex = 0;

    for (const input of dominantInputs) {
      for (const output of dominantOutputs) {
        const edgeSatoshis = Math.min(input.value, output.value);
        const edgeBtc = edgeSatoshis / 100_000_000;
        if (edgeBtc <= 0) {
          continue;
        }
        edges.push({
          id: `${tx.hash}:${edgeIndex}`,
          hash: `${tx.hash.slice(0, 10)}...${tx.hash.slice(-6)}`,
          from: formatInputEntity(input.addr),
          to: shortAddress(output.addr),
          amount: edgeBtc.toFixed(edgeBtc < 1 ? 4 : 2),
          type: edgeBtc >= 1 ? "inflow" : "outflow",
          fee: `${feeBtc.toFixed(6)} BTC`,
          block: 0,
          timestamp: formatClock(tx.time * 1000),
          timestampMs: tx.time * 1000,
          channel: "wallet",
        });
        edgeIndex += 1;
      }
    }

    return edges;
  };
};

const mapEvmTx = (
  rawTx: unknown,
  feeUnit: string,
  blockOverride?: number,
  timestampMsOverride?: number,
): LiveTransaction | null => {
  if (!rawTx || typeof rawTx !== "object") {
    return null;
  }

  const tx = rawTx as {
    hash?: string;
    from?: string;
    to?: string | null;
    value?: string;
    gas?: string;
    gasPrice?: string;
    maxFeePerGas?: string;
    blockNumber?: string | null;
  };

  if (typeof tx.hash !== "string" || typeof tx.from !== "string") {
    return null;
  }

  const valueWei = parseHexBigInt(tx.value) ?? 0n;
  const gasLimit = parseHexBigInt(tx.gas) ?? 0n;
  const gasPriceWei = parseHexBigInt(tx.maxFeePerGas) ?? parseHexBigInt(tx.gasPrice) ?? 0n;
  const feeWei = gasLimit * gasPriceWei;

  const blockNum = parseHexBigInt(tx.blockNumber);
  const block = blockNum ? Number(blockNum) : (blockOverride ?? 0);

  return {
    id: tx.hash,
    hash: `${tx.hash.slice(0, 10)}...${tx.hash.slice(-6)}`,
    from: shortAddress(tx.from),
    to: shortAddress(tx.to ?? undefined),
    amount: formatWei(valueWei, 4),
    type: valueWei > 0n ? "inflow" : "outflow",
    fee: `${formatWei(feeWei, 6)} ${feeUnit}`,
    block,
    timestamp: formatClock(timestampMsOverride ?? Date.now()),
    timestampMs: timestampMsOverride ?? Date.now(),
    channel: "wallet",
  };
};

const getStreamConfig = (network: string, token: string): StreamConfig => {
  if (network === "bitcoin") {
    return {
      kind: "bitcoin",
      urls: ["wss://ws.blockchain.info/inv"],
      onOpenPayloads: [JSON.stringify({ op: "unconfirmed_sub" })],
      mapper: createBitcoinMapper(),
    };
  }

  const evmConfig = evmNetworkConfig[network];
  if (evmConfig) {
    return {
      kind: "evm",
      urls: evmConfig.urls,
      onOpenPayloads: [
        JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "eth_subscribe",
          params: ["newHeads"],
        }),
      ],
      mapper: (raw) => {
        const mapped = mapEvmTx(raw, evmConfig.feeUnit);
        return mapped ? [mapped] : [];
      },
      feeUnit: evmConfig.feeUnit,
    };
  }

  const symbol = tokenToSymbol[token] ?? "ethusdt";
  return {
    kind: "binance",
    urls: [`wss://stream.binance.com:9443/ws/${symbol}@aggTrade`],
    onOpenPayloads: [],
    mapper: mapBinanceTrade,
  };
};

export function useLiveTransactions({
  network,
  token,
  minAmount,
  maxTransactions,
  whaleOnly,
  paused,
  flushIntervalMs,
}: UseLiveTransactionsOptions) {
  const [transactions, setTransactions] = useState<LiveTransaction[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const flushIntervalRef = useRef<number | null>(null);
  const queueRef = useRef<LiveTransaction[]>([]);
  const attemptsRef = useRef(0);
  const endpointIndexRef = useRef(0);
  const nextRpcIdRef = useRef(10_000);
  const pendingRpcRequestsRef = useRef(new Map<number, "blockByHash">());
  const lastEvmRequestAtRef = useRef(0);

  const controlsRef = useRef({
    minAmount: 0,
    maxTransactions: 20,
    whaleOnly: false,
    paused: false,
  });

  const stream = useMemo(() => getStreamConfig(network, token), [network, token]);

  const passesAmountFilters = (
    tx: LiveTransaction,
    controls: {
      minAmount: number;
      whaleOnly: boolean;
    },
  ) => {
    const amount = Number.parseFloat(tx.amount);
    if (!Number.isFinite(amount)) {
      return false;
    }
    if (amount < controls.minAmount) {
      return false;
    }
    if (controls.whaleOnly && amount < WHALE_THRESHOLD) {
      return false;
    }
    return true;
  };

  useEffect(() => {
    controlsRef.current = {
      minAmount,
      maxTransactions,
      whaleOnly,
      paused,
    };

    const immediateControls = {
      minAmount,
      whaleOnly,
    };

    // Apply new filter settings immediately to already buffered and visible rows.
    queueRef.current = queueRef.current.filter((tx) => passesAmountFilters(tx, immediateControls));
    setTransactions((prev) =>
      prev.filter((tx) => passesAmountFilters(tx, immediateControls)).slice(0, maxTransactions),
    );
  }, [minAmount, maxTransactions, whaleOnly, paused]);

  useEffect(() => {
    setTransactions((prev) => prev.slice(0, maxTransactions));
  }, [maxTransactions]);

  useEffect(() => {
    if (flushIntervalRef.current !== null) {
      window.clearInterval(flushIntervalRef.current);
      flushIntervalRef.current = null;
    }

    flushIntervalRef.current = window.setInterval(() => {
      if (controlsRef.current.paused) {
        return;
      }

      const next = queueRef.current.shift();
      if (!next) {
        return;
      }

      setTransactions((prev) => {
        if (prev.some((tx) => tx.id === next.id)) {
          return prev;
        }

        return [next, ...prev].slice(0, controlsRef.current.maxTransactions);
      });
    }, flushIntervalMs);

    return () => {
      if (flushIntervalRef.current !== null) {
        window.clearInterval(flushIntervalRef.current);
        flushIntervalRef.current = null;
      }
    };
  }, [flushIntervalMs]);

  useEffect(() => {
    let disposed = false;
    const pendingRpcRequests = pendingRpcRequestsRef.current;

    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    attemptsRef.current = 0;
    endpointIndexRef.current = 0;
    nextRpcIdRef.current = 10_000;
    pendingRpcRequests.clear();
    lastEvmRequestAtRef.current = 0;
    queueRef.current = [];
    setTransactions([]);

    const enqueueIfPassesFilters = (mapped: LiveTransaction[]) => {
      const controls = controlsRef.current;
      if (controls.paused) {
        return;
      }

      const accepted = mapped.filter((tx) => {
        const amount = Number.parseFloat(tx.amount);
        if (!Number.isFinite(amount)) {
          return false;
        }
        if (amount < controls.minAmount) {
          return false;
        }
        if (controls.whaleOnly && amount < WHALE_THRESHOLD) {
          return false;
        }
        return true;
      });

      if (accepted.length === 0) {
        return;
      }

      queueRef.current.push(...accepted);
      if (queueRef.current.length > MAX_QUEUE_SIZE) {
        queueRef.current = queueRef.current.slice(-MAX_QUEUE_SIZE);
      }
    };

    const connect = () => {
      if (disposed) {
        return;
      }

      setStatus(attemptsRef.current === 0 ? "connecting" : "reconnecting");

      const targetUrl =
        stream.urls[endpointIndexRef.current % stream.urls.length] ?? stream.urls[0];
      const ws = new WebSocket(targetUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        attemptsRef.current = 0;
        setStatus("live");

        for (const payload of stream.onOpenPayloads) {
          ws.send(payload);
        }
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (stream.kind !== "evm") {
            enqueueIfPassesFilters(stream.mapper(payload));
            return;
          }

          const envelope = payload as {
            method?: string;
            params?: { result?: unknown };
            id?: number;
            result?: unknown;
          };

          if (envelope.method === "eth_subscription") {
            const result = envelope.params?.result;

            const headerHash =
              result && typeof result === "object"
                ? (result as { hash?: unknown }).hash
                : undefined;

            if (typeof headerHash === "string") {
              const now = Date.now();
              const inflight = pendingRpcRequests.size;
              if (
                inflight < MAX_INFLIGHT_EVM_REQUESTS &&
                now - lastEvmRequestAtRef.current >= EVM_REQUEST_INTERVAL_MS
              ) {
                const rpcId = nextRpcIdRef.current;
                nextRpcIdRef.current += 1;
                pendingRpcRequests.set(rpcId, "blockByHash");
                lastEvmRequestAtRef.current = now;
                ws.send(
                  JSON.stringify({
                    id: rpcId,
                    jsonrpc: "2.0",
                    method: "eth_getBlockByHash",
                    params: [headerHash, true],
                  }),
                );
              }
              return;
            }

            enqueueIfPassesFilters(stream.mapper(result));
            return;
          }

          if (typeof envelope.id === "number" && pendingRpcRequests.has(envelope.id)) {
            const requestKind = pendingRpcRequests.get(envelope.id);
            pendingRpcRequests.delete(envelope.id);

            if (
              requestKind === "blockByHash" &&
              envelope.result &&
              typeof envelope.result === "object"
            ) {
              const block = envelope.result as {
                number?: unknown;
                timestamp?: unknown;
                transactions?: unknown;
              };

              const blockNumberRaw = parseHexBigInt(block.number);
              const blockNumber = blockNumberRaw ? Number(blockNumberRaw) : 0;
              const blockTimestampRaw = parseHexBigInt(block.timestamp);
              const blockTimestampMs = blockTimestampRaw
                ? Number(blockTimestampRaw) * 1000
                : Date.now();
              const txs = Array.isArray(block.transactions) ? block.transactions : [];

              const mapped = txs
                .map((tx) => mapEvmTx(tx, stream.feeUnit ?? "ETH", blockNumber, blockTimestampMs))
                .filter((tx): tx is LiveTransaction => tx !== null);

              enqueueIfPassesFilters(mapped);
            }
          }
        } catch {
          // Ignore malformed websocket payloads.
        }
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        if (disposed) {
          return;
        }

        if (attemptsRef.current >= 2) {
          setStatus("error");
        }

        const backoffMs = Math.min(1000 * 2 ** attemptsRef.current, MAX_BACKOFF_MS);
        attemptsRef.current += 1;
        endpointIndexRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(connect, backoffMs);
      };
    };

    connect();

    return () => {
      disposed = true;

      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      queueRef.current = [];
      pendingRpcRequests.clear();

      if (wsRef.current && wsRef.current.readyState < WebSocket.CLOSING) {
        wsRef.current.close();
      }

      wsRef.current = null;
    };
  }, [stream]);

  return { transactions, status };
}
