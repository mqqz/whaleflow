import { fetchCsv, toSafeDate, toSafeNumber } from "./csv";
import type {
  ExchangeFlowPoint,
  FlowTier,
  TierExchangeEdge,
  TierExchangeFlowPoint,
} from "../types/analytics";

const BASE = "https://storage.googleapis.com/whaleflow";
const ALLOWED_TIERS: readonly FlowTier[] = ["shrimp", "dolphin", "shark", "whale"];

export const URLS = {
  exchangeFlowHourly: `${BASE}/agg_exchange_flow_hourly`,
  tierEdges24h: `${BASE}/agg_tier_exchange_edges_24h`,
  tierFlowHourly: `${BASE}/agg_tier_exchange_flow_hourly`,
} as const;

export interface FlowPoint {
  ts: number;
  inflow: number;
  outflow: number;
  net: number;
}

export interface CexFlowPoint {
  ts: number;
  cex: string;
  inflow: number;
  outflow: number;
  net: number;
}

export interface EdgePoint {
  src: string;
  dst: string;
  srcLabel: string;
  dstLabel: string;
  valueEth: number;
  txCount: number;
}

export interface ExchangeAnalyticsData {
  flowSeries: FlowPoint[];
  byCexSeries: CexFlowPoint[];
  edges24h: EdgePoint[];
  asOf: number | null;
  flowByHour: Map<number, FlowPoint>;
  cexToPoints: Map<string, CexFlowPoint[]>;
  walletToEdges: Map<string, EdgePoint[]>;
}

let exchangeFlowPromise: Promise<ExchangeFlowPoint[]> | null = null;
let tierEdgesPromise: Promise<TierExchangeEdge[]> | null = null;
let tierFlowPromise: Promise<TierExchangeFlowPoint[]> | null = null;
let compatibilityPromise: Promise<ExchangeAnalyticsData> | null = null;

const normalizeNode = (value: string) => value.trim().toLowerCase();

const parseStrictTier = (rawTier: unknown, rowIndex: number): FlowTier => {
  const normalized = String(rawTier ?? "")
    .trim()
    .toLowerCase();
  if (ALLOWED_TIERS.includes(normalized as FlowTier)) {
    return normalized as FlowTier;
  }
  throw new Error(`Invalid tier '${rawTier ?? ""}' at row ${rowIndex + 1}.`);
};

const parseTierLike = (rawTier: unknown) =>
  String(rawTier ?? "")
    .trim()
    .toLowerCase();

const parseNodeType = (value: unknown, field: "src_type" | "dst_type", rowIndex: number) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "tier" || normalized === "exchange") {
    return normalized;
  }
  throw new Error(`Invalid ${field} '${value ?? ""}' at row ${rowIndex + 1}.`);
};

export async function loadExchangeFlowHourly(): Promise<ExchangeFlowPoint[]> {
  if (exchangeFlowPromise) {
    return exchangeFlowPromise;
  }
  exchangeFlowPromise = fetchCsv<ExchangeFlowPoint>(URLS.exchangeFlowHourly, (row, rowIndex) => {
    const bucketTs = toSafeDate(row.bucket_ts, "bucket_ts", rowIndex);
    return {
      bucket_ts: bucketTs,
      exchange_inflow_eth: toSafeNumber(row.exchange_inflow_eth, "exchange_inflow_eth", rowIndex),
      exchange_outflow_eth: toSafeNumber(
        row.exchange_outflow_eth,
        "exchange_outflow_eth",
        rowIndex,
      ),
      net_flow_eth: toSafeNumber(row.net_flow_eth, "net_flow_eth", rowIndex),
    };
  }).then((rows) => rows.sort((a, b) => a.bucket_ts.getTime() - b.bucket_ts.getTime()));
  return exchangeFlowPromise;
}

export async function loadTierExchangeFlowHourly(): Promise<TierExchangeFlowPoint[]> {
  if (tierFlowPromise) {
    return tierFlowPromise;
  }
  tierFlowPromise = fetchCsv<TierExchangeFlowPoint>(URLS.tierFlowHourly, (row, rowIndex) => {
    const bucketTs = toSafeDate(row.bucket_ts, "bucket_ts", rowIndex);
    const tier = parseStrictTier(row.tier, rowIndex);
    return {
      bucket_ts: bucketTs,
      tier,
      tier_exchange_inflow_eth: toSafeNumber(
        row.tier_exchange_inflow_eth,
        "tier_exchange_inflow_eth",
        rowIndex,
      ),
      tier_exchange_outflow_eth: toSafeNumber(
        row.tier_exchange_outflow_eth,
        "tier_exchange_outflow_eth",
        rowIndex,
      ),
      tier_exchange_net_flow_eth: toSafeNumber(
        row.tier_exchange_net_flow_eth,
        "tier_exchange_net_flow_eth",
        rowIndex,
      ),
    };
  }).then((rows) => rows.sort((a, b) => a.bucket_ts.getTime() - b.bucket_ts.getTime()));
  return tierFlowPromise;
}

export async function loadTierExchangeEdges24h(): Promise<TierExchangeEdge[]> {
  if (tierEdgesPromise) {
    return tierEdgesPromise;
  }
  tierEdgesPromise = fetchCsv<TierExchangeEdge>(URLS.tierEdges24h, (row, rowIndex) => {
    const srcNode = String(row.src_node ?? "").trim();
    const dstNode = String(row.dst_node ?? "").trim();
    if (!srcNode || !dstNode) {
      throw new Error(`Missing src_node or dst_node at row ${rowIndex + 1}.`);
    }
    return {
      src_node: srcNode,
      dst_node: dstNode,
      src_type: parseNodeType(row.src_type, "src_type", rowIndex),
      dst_type: parseNodeType(row.dst_type, "dst_type", rowIndex),
      tier: parseTierLike(row.tier),
      cex_name: String(row.cex_name ?? "").trim(),
      total_value_eth: toSafeNumber(row.total_value_eth, "total_value_eth", rowIndex),
      tx_count: Math.max(0, Math.round(toSafeNumber(row.tx_count, "tx_count", rowIndex))),
    };
  }).then((rows) => rows.sort((a, b) => b.total_value_eth - a.total_value_eth));
  return tierEdgesPromise;
}

function indexFlowByHour(series: FlowPoint[]) {
  const byHour = new Map<number, FlowPoint>();
  for (const point of series) {
    byHour.set(point.ts, point);
  }
  return byHour;
}

function indexCexPoints(series: CexFlowPoint[]) {
  const cexToPoints = new Map<string, CexFlowPoint[]>();
  for (const point of series) {
    const rows = cexToPoints.get(point.cex) ?? [];
    rows.push(point);
    cexToPoints.set(point.cex, rows);
  }
  for (const [cex, rows] of cexToPoints) {
    cexToPoints.set(
      cex,
      rows.sort((a, b) => a.ts - b.ts),
    );
  }
  return cexToPoints;
}

function indexWalletEdges(edges: EdgePoint[]) {
  const walletToEdges = new Map<string, EdgePoint[]>();
  for (const edge of edges) {
    const src = normalizeNode(edge.src);
    const dst = normalizeNode(edge.dst);

    const srcRows = walletToEdges.get(src) ?? [];
    srcRows.push(edge);
    walletToEdges.set(src, srcRows);

    if (dst !== src) {
      const dstRows = walletToEdges.get(dst) ?? [];
      dstRows.push(edge);
      walletToEdges.set(dst, dstRows);
    }
  }

  for (const [wallet, rows] of walletToEdges) {
    walletToEdges.set(
      wallet,
      rows.sort((a, b) => b.valueEth - a.valueEth),
    );
  }

  return walletToEdges;
}

const pickNodeLabel = (node: string, type: "tier" | "exchange", tier: string, cex: string) => {
  if (type === "tier") {
    return tier || node;
  }
  return cex || node;
};

export async function loadExchangeAnalyticsData(): Promise<ExchangeAnalyticsData> {
  if (compatibilityPromise) {
    return compatibilityPromise;
  }

  compatibilityPromise = Promise.all([
    loadExchangeFlowHourly(),
    loadTierExchangeFlowHourly(),
    loadTierExchangeEdges24h(),
  ]).then(([exchangeFlow, tierFlow, tierEdges]) => {
    const flowSeries = exchangeFlow.map((point) => ({
      ts: point.bucket_ts.getTime(),
      inflow: point.exchange_inflow_eth,
      outflow: point.exchange_outflow_eth,
      net: point.net_flow_eth,
    }));

    const byCexSeries = tierFlow.map((point) => ({
      ts: point.bucket_ts.getTime(),
      cex: point.tier,
      inflow: point.tier_exchange_inflow_eth,
      outflow: point.tier_exchange_outflow_eth,
      net: point.tier_exchange_net_flow_eth,
    }));

    const edges24h = tierEdges.map((edge) => ({
      src: edge.src_node,
      dst: edge.dst_node,
      srcLabel:
        pickNodeLabel(edge.src_node, edge.src_type, edge.tier, edge.cex_name) || "unlabeled",
      dstLabel:
        pickNodeLabel(edge.dst_node, edge.dst_type, edge.tier, edge.cex_name) || "unlabeled",
      valueEth: edge.total_value_eth,
      txCount: edge.tx_count,
    }));

    const allTs = [
      ...exchangeFlow.map((point) => point.bucket_ts.getTime()),
      ...tierFlow.map((point) => point.bucket_ts.getTime()),
    ].filter((ts) => Number.isFinite(ts));

    const asOf = allTs.length > 0 ? Math.max(...allTs) : null;

    return {
      flowSeries,
      byCexSeries,
      edges24h,
      asOf,
      flowByHour: indexFlowByHour(flowSeries),
      cexToPoints: indexCexPoints(byCexSeries),
      walletToEdges: indexWalletEdges(edges24h),
    };
  });

  return compatibilityPromise;
}

export const selectTopEdges = (data: ExchangeAnalyticsData, limit: number) =>
  data.edges24h.slice(0, Math.max(0, limit));

export const selectWalletEdges = (data: ExchangeAnalyticsData, wallet: string) =>
  data.walletToEdges.get(normalizeNode(wallet)) ?? [];
