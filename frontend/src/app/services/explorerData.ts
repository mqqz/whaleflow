import { LiveTransaction } from "../hooks/useLiveTransactions";

interface FetchExplorerWalletDataOptions {
  network: string;
  address: string;
  maxTransactions?: number;
}

export interface ExplorerWalletData {
  transactions: LiveTransaction[];
  balance: number | null;
  source: string;
}

const WEI_PER_ETH = 1_000_000_000_000_000_000n;

const evmRpcByNetwork: Record<string, string | undefined> = {
  ethereum: "https://ethereum-rpc.publicnode.com",
  bitcoin: undefined,
};

const feeSymbolByNetwork: Record<string, string> = {
  ethereum: "ETH",
  bitcoin: "BTC",
};

const normalizeWallet = (value: string) => value.trim().toLowerCase();

const shortTime = (timestampMs: number) =>
  new Date(timestampMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const hexToBigInt = (value: string | null | undefined) => {
  if (!value || typeof value !== "string") return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
};

const weiToNumber = (wei: bigint) => {
  const whole = wei / WEI_PER_ETH;
  const fraction = wei % WEI_PER_ETH;
  const fractionText = fraction.toString().padStart(18, "0").slice(0, 6);
  return Number.parseFloat(`${whole.toString()}.${fractionText}`);
};

interface RpcEnvelope<T> {
  result?: T;
  error?: { message?: string };
}

async function rpcCall<T>(
  url: string,
  id: number,
  method: string,
  params: unknown[],
): Promise<T | null> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }),
  });
  if (!resp.ok) {
    return null;
  }
  const json = (await resp.json()) as RpcEnvelope<T>;
  if (json.error) {
    return null;
  }
  return json.result ?? null;
}

interface EvmTx {
  hash?: string;
  from?: string;
  to?: string;
  value?: string;
  blockNumber?: string;
  gasPrice?: string;
  gas?: string;
}

interface EvmBlock {
  number?: string;
  timestamp?: string;
  transactions?: EvmTx[];
}

async function fetchEvmWalletData(
  network: string,
  address: string,
  maxTransactions: number,
): Promise<ExplorerWalletData | null> {
  const rpcUrl = evmRpcByNetwork[network];
  if (!rpcUrl) {
    return null;
  }

  const normalized = normalizeWallet(address);
  const latestHex = await rpcCall<string>(rpcUrl, 1, "eth_blockNumber", []);
  const balanceHex = await rpcCall<string>(rpcUrl, 2, "eth_getBalance", [address, "latest"]);

  if (!latestHex) {
    return null;
  }

  const latestBlock = Number.parseInt(latestHex, 16);
  if (!Number.isFinite(latestBlock) || latestBlock <= 0) {
    return null;
  }

  const windowSize = Math.max(80, Math.min(260, maxTransactions * 2));
  const startBlock = Math.max(0, latestBlock - windowSize);

  const blockNumbers = [];
  for (let n = latestBlock; n >= startBlock; n -= 1) {
    blockNumbers.push(n);
  }

  const blocks: EvmBlock[] = [];
  for (let i = 0; i < blockNumbers.length; i += 12) {
    const chunk = blockNumbers.slice(i, i + 12);
    const results = await Promise.all(
      chunk.map((blockNo, idx) =>
        rpcCall<EvmBlock>(rpcUrl, 10_000 + i + idx, "eth_getBlockByNumber", [
          `0x${blockNo.toString(16)}`,
          true,
        ]),
      ),
    );
    for (const block of results) {
      if (block) {
        blocks.push(block);
      }
    }
  }

  const txs: LiveTransaction[] = [];
  for (const block of blocks) {
    const txList = Array.isArray(block.transactions) ? block.transactions : [];
    const blockTimestamp = hexToBigInt(block.timestamp);
    const timestampMs = Number((blockTimestamp ?? 0n) * 1000n);
    for (const tx of txList) {
      const from = tx.from ?? "unknown";
      const to = tx.to ?? "unknown";
      if (normalizeWallet(from) !== normalized && normalizeWallet(to) !== normalized) {
        continue;
      }
      const valueWei = hexToBigInt(tx.value ?? "0x0") ?? 0n;
      if (valueWei <= 0n) {
        continue;
      }

      const amount = weiToNumber(valueWei);
      const gasPrice = hexToBigInt(tx.gasPrice ?? "0x0") ?? 0n;
      const gas = hexToBigInt(tx.gas ?? "0x0") ?? 0n;
      const fee = weiToNumber(gasPrice * gas);

      txs.push({
        id: tx.hash ?? `${from}-${to}-${timestampMs}`,
        hash: tx.hash ?? "unknown",
        from,
        to,
        amount: amount.toFixed(amount < 1 ? 4 : 2),
        type: normalizeWallet(to) === normalized ? "inflow" : "outflow",
        fee: `${fee.toFixed(6)} ${feeSymbolByNetwork[network] ?? "ETH"}`,
        block: Number.parseInt(tx.blockNumber ?? block.number ?? "0x0", 16),
        timestamp: shortTime(timestampMs),
        timestampMs,
        channel: "wallet",
      });
    }
  }

  txs.sort((a, b) => b.timestampMs - a.timestampMs);

  const balance = balanceHex ? weiToNumber(hexToBigInt(balanceHex) ?? 0n) : null;
  return {
    transactions: txs.slice(0, maxTransactions),
    balance,
    source: "PublicNode RPC",
  };
}

interface MempoolAddress {
  chain_stats?: {
    funded_txo_sum?: number;
    spent_txo_sum?: number;
  };
  mempool_stats?: {
    funded_txo_sum?: number;
    spent_txo_sum?: number;
  };
}

interface MempoolTx {
  txid?: string;
  fee?: number;
  status?: {
    block_height?: number;
    block_time?: number;
  };
  vin?: Array<{ prevout?: { scriptpubkey_address?: string; value?: number } }>;
  vout?: Array<{ scriptpubkey_address?: string; value?: number }>;
}

async function fetchBitcoinWalletData(
  address: string,
  maxTransactions: number,
): Promise<ExplorerWalletData | null> {
  const base = "https://mempool.space/api";
  const [addressResp, txResp] = await Promise.all([
    fetch(`${base}/address/${address}`),
    fetch(`${base}/address/${address}/txs`),
  ]);
  if (!addressResp.ok || !txResp.ok) {
    return null;
  }

  const addressJson = (await addressResp.json()) as MempoolAddress;
  const txJson = (await txResp.json()) as MempoolTx[];
  const txList = Array.isArray(txJson) ? txJson.slice(0, maxTransactions) : [];
  const normalized = normalizeWallet(address);

  const txs: LiveTransaction[] = txList
    .map((tx, index) => {
      const inputs = Array.isArray(tx.vin) ? tx.vin : [];
      const outputs = Array.isArray(tx.vout) ? tx.vout : [];

      const sentFromWallet = inputs
        .filter(
          (input) => normalizeWallet(input.prevout?.scriptpubkey_address ?? "") === normalized,
        )
        .reduce((sum, input) => sum + (input.prevout?.value ?? 0), 0);
      const receivedToWallet = outputs
        .filter((output) => normalizeWallet(output.scriptpubkey_address ?? "") === normalized)
        .reduce((sum, output) => sum + (output.value ?? 0), 0);

      const net = receivedToWallet - sentFromWallet;
      const amountSats = Math.abs(net);
      if (amountSats <= 0) {
        return null;
      }

      const incoming = net >= 0;
      const from =
        inputs.find(
          (input) => normalizeWallet(input.prevout?.scriptpubkey_address ?? "") !== normalized,
        )?.prevout?.scriptpubkey_address ?? "unknown";
      const to =
        outputs.find((output) => normalizeWallet(output.scriptpubkey_address ?? "") !== normalized)
          ?.scriptpubkey_address ?? address;
      const timestampMs = (tx.status?.block_time ?? Math.floor(Date.now() / 1000)) * 1000;

      return {
        id: `${tx.txid ?? "txid"}-${index}`,
        hash: tx.txid ?? "unknown",
        from: incoming ? from : address,
        to: incoming ? address : to,
        amount: (amountSats / 100_000_000).toFixed(8),
        type: incoming ? "inflow" : "outflow",
        fee: `${((tx.fee ?? 0) / 100_000_000).toFixed(8)} BTC`,
        block: tx.status?.block_height ?? 0,
        timestamp: shortTime(timestampMs),
        timestampMs,
        channel: "wallet",
      } as LiveTransaction;
    })
    .filter((tx): tx is LiveTransaction => tx !== null)
    .sort((a, b) => b.timestampMs - a.timestampMs);

  const chainFunded = addressJson.chain_stats?.funded_txo_sum ?? 0;
  const chainSpent = addressJson.chain_stats?.spent_txo_sum ?? 0;
  const mempoolFunded = addressJson.mempool_stats?.funded_txo_sum ?? 0;
  const mempoolSpent = addressJson.mempool_stats?.spent_txo_sum ?? 0;
  const balanceSats = chainFunded - chainSpent + mempoolFunded - mempoolSpent;

  return {
    transactions: txs,
    balance: balanceSats / 100_000_000,
    source: "mempool.space",
  };
}

export async function fetchExplorerWalletData({
  network,
  address,
  maxTransactions = 250,
}: FetchExplorerWalletDataOptions): Promise<ExplorerWalletData> {
  const trimmedAddress = address.trim();
  if (!trimmedAddress) {
    return { transactions: [], balance: null, source: "Unavailable" };
  }

  if (network === "bitcoin") {
    const btc = await fetchBitcoinWalletData(trimmedAddress, maxTransactions);
    if (btc) {
      return btc;
    }
    return { transactions: [], balance: null, source: "Unavailable" };
  }

  const evm = await fetchEvmWalletData(network, trimmedAddress, maxTransactions);
  if (evm) {
    return evm;
  }

  return {
    transactions: [],
    balance: null,
    source: "Unavailable",
  };
}
