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
  onOpenPayload: string | null;
  mapper: (raw: unknown) => LiveTransaction | null;
  feeUnit?: string;
}

const MAX_BACKOFF_MS = 15000;
const MAX_QUEUE_SIZE = 200;
const WHALE_THRESHOLD = 100;
const WEI_PER_ETH = 1_000_000_000_000_000_000n;
const MAX_INFLIGHT_EVM_REQUESTS = 8;
const EVM_REQUEST_INTERVAL_MS = 200;

const tokenToSymbol: Record<string, string> = {
  btc: "btcusdt",
  eth: "ethusdt",
  sol: "solusdt",
  bnb: "bnbusdt",
  xrp: "xrpusdt",
};

const evmNetworkConfig: Record<string, { urls: string[]; feeUnit: string }> = {
  ethereum: {
    urls: [
      "wss://ethereum-rpc.publicnode.com",
      "wss://eth-mainnet.g.alchemy.com/v2/demo",
    ],
    feeUnit: "ETH",
  },
  bsc: {
    urls: ["wss://bsc-rpc.publicnode.com"],
    feeUnit: "BNB",
  },
  polygon: {
    urls: [
      "wss://polygon-bor-rpc.publicnode.com",
      "wss://polygon-mainnet.g.alchemy.com/v2/demo",
    ],
    feeUnit: "MATIC",
  },
  arbitrum: {
    urls: [
      "wss://arbitrum-one-rpc.publicnode.com",
      "wss://arb-mainnet.g.alchemy.com/v2/demo",
    ],
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

const mapBinanceTrade = (raw: unknown): LiveTransaction | null => {
  if (!raw || typeof raw !== "object") {
    return null;
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
    return null;
  }

  const quantity = Number.parseFloat(trade.q);

  if (!Number.isFinite(quantity)) {
    return null;
  }

  const side = trade.m ? "outflow" : "inflow";

  return {
    id: `${trade.s}-${trade.a}`,
    hash: `${trade.s}-${trade.a}`,
    from: trade.m ? "Aggressive Seller" : "Passive Seller",
    to: trade.m ? "Passive Buyer" : "Aggressive Buyer",
    amount: quantity.toFixed(quantity < 1 ? 4 : 2),
    type: side,
    fee: "n/a",
    block: trade.l,
    timestamp: formatClock(trade.T),
  };
};

const mapBitcoinTx = (raw: unknown): LiveTransaction | null => {
  if (!raw || typeof raw !== "object") {
    return null;
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
    return null;
  }

  const tx = envelope.x;
  const outputs = Array.isArray(tx.out) ? tx.out : [];
  const inputs = Array.isArray(tx.inputs) ? tx.inputs : [];

  const inputSatoshis = inputs.reduce((sum, input) => {
    const value = input?.prev_out?.value;
    return sum + (typeof value === "number" ? value : 0);
  }, 0);

  const outputSatoshis = outputs.reduce((sum, output) => {
    const value = output?.value;
    return sum + (typeof value === "number" ? value : 0);
  }, 0);

  if (typeof tx.hash !== "string" || typeof tx.time !== "number") {
    return null;
  }

  const btcAmount = outputSatoshis / 100_000_000;
  const feeBtc = Math.max(inputSatoshis - outputSatoshis, 0) / 100_000_000;
  const fromAddress = inputs[0]?.prev_out?.addr;
  const toAddress = outputs[0]?.addr;

  return {
    id: tx.hash,
    hash: `${tx.hash.slice(0, 10)}...${tx.hash.slice(-6)}`,
    from: shortAddress(fromAddress),
    to: shortAddress(toAddress),
    amount: btcAmount.toFixed(btcAmount < 1 ? 4 : 2),
    type: btcAmount >= 1 ? "inflow" : "outflow",
    fee: `${feeBtc.toFixed(6)} BTC`,
    block: 0,
    timestamp: formatClock(tx.time * 1000),
  };
};

const mapEvmTx = (rawTx: unknown, feeUnit: string): LiveTransaction | null => {
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
  const block = blockNum ? Number(blockNum) : 0;

  return {
    id: tx.hash,
    hash: `${tx.hash.slice(0, 10)}...${tx.hash.slice(-6)}`,
    from: shortAddress(tx.from),
    to: shortAddress(tx.to ?? undefined),
    amount: formatWei(valueWei, 4),
    type: valueWei > 0n ? "inflow" : "outflow",
    fee: `${formatWei(feeWei, 6)} ${feeUnit}`,
    block,
    timestamp: formatClock(Date.now()),
  };
};

const getStreamConfig = (network: string, token: string): StreamConfig => {
  if (network === "bitcoin") {
    return {
      kind: "bitcoin",
      urls: ["wss://ws.blockchain.info/inv"],
      onOpenPayload: JSON.stringify({ op: "unconfirmed_sub" }),
      mapper: mapBitcoinTx,
    };
  }

  const evmConfig = evmNetworkConfig[network];
  if (evmConfig) {
    return {
      kind: "evm",
      urls: evmConfig.urls,
      onOpenPayload: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "eth_subscribe",
        params: ["newPendingTransactions"],
      }),
      mapper: (raw) => mapEvmTx(raw, evmConfig.feeUnit),
      feeUnit: evmConfig.feeUnit,
    };
  }

  const symbol = tokenToSymbol[token] ?? "ethusdt";
  return {
    kind: "binance",
    urls: [`wss://stream.binance.com:9443/ws/${symbol}@aggTrade`],
    onOpenPayload: null,
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
  const pendingRpcIdsRef = useRef(new Set<number>());
  const lastEvmRequestAtRef = useRef(0);

  const controlsRef = useRef({
    minAmount: 0,
    maxTransactions: 20,
    whaleOnly: false,
    paused: false,
  });

  const stream = useMemo(() => getStreamConfig(network, token), [network, token]);

  const passesAmountFilters = (tx: LiveTransaction, controls: {
    minAmount: number;
    whaleOnly: boolean;
  }) => {
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
    queueRef.current = queueRef.current.filter((tx) =>
      passesAmountFilters(tx, immediateControls),
    );
    setTransactions((prev) =>
      prev
        .filter((tx) => passesAmountFilters(tx, immediateControls))
        .slice(0, maxTransactions),
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

    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    attemptsRef.current = 0;
    endpointIndexRef.current = 0;
    nextRpcIdRef.current = 10_000;
    pendingRpcIdsRef.current.clear();
    lastEvmRequestAtRef.current = 0;
    queueRef.current = [];
    setTransactions([]);

    const enqueueIfPassesFilters = (mapped: LiveTransaction | null) => {
      if (!mapped) {
        return;
      }

      const amount = Number.parseFloat(mapped.amount);
      const controls = controlsRef.current;

      if (!Number.isFinite(amount) || controls.paused) {
        return;
      }

      if (amount < controls.minAmount) {
        return;
      }

      if (controls.whaleOnly && amount < WHALE_THRESHOLD) {
        return;
      }

      queueRef.current.push(mapped);
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

        if (stream.onOpenPayload) {
          ws.send(stream.onOpenPayload);
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

            if (typeof result === "string") {
              const now = Date.now();
              const inflight = pendingRpcIdsRef.current.size;
              if (
                inflight < MAX_INFLIGHT_EVM_REQUESTS &&
                now - lastEvmRequestAtRef.current >= EVM_REQUEST_INTERVAL_MS
              ) {
                const rpcId = nextRpcIdRef.current;
                nextRpcIdRef.current += 1;
                pendingRpcIdsRef.current.add(rpcId);
                lastEvmRequestAtRef.current = now;
                ws.send(
                  JSON.stringify({
                    id: rpcId,
                    jsonrpc: "2.0",
                    method: "eth_getTransactionByHash",
                    params: [result],
                  }),
                );
              }
              return;
            }

            if (result && typeof result === "object") {
              const maybeHash = (result as { hash?: unknown }).hash;
              const maybeFrom = (result as { from?: unknown }).from;

              if (typeof maybeHash === "string" && typeof maybeFrom !== "string") {
                const now = Date.now();
                const inflight = pendingRpcIdsRef.current.size;
                if (
                  inflight < MAX_INFLIGHT_EVM_REQUESTS &&
                  now - lastEvmRequestAtRef.current >= EVM_REQUEST_INTERVAL_MS
                ) {
                  const rpcId = nextRpcIdRef.current;
                  nextRpcIdRef.current += 1;
                  pendingRpcIdsRef.current.add(rpcId);
                  lastEvmRequestAtRef.current = now;
                  ws.send(
                    JSON.stringify({
                      id: rpcId,
                      jsonrpc: "2.0",
                      method: "eth_getTransactionByHash",
                      params: [maybeHash],
                    }),
                  );
                }
                return;
              }
            }

            enqueueIfPassesFilters(stream.mapper(result));
            return;
          }

          if (typeof envelope.id === "number" && pendingRpcIdsRef.current.has(envelope.id)) {
            pendingRpcIdsRef.current.delete(envelope.id);
            enqueueIfPassesFilters(stream.mapper(envelope.result));
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
      pendingRpcIdsRef.current.clear();

      if (wsRef.current && wsRef.current.readyState < WebSocket.CLOSING) {
        wsRef.current.close();
      }

      wsRef.current = null;
    };
  }, [stream]);

  return { transactions, status };
}
