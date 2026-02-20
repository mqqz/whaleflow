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

interface ManifestDataset {
  id: string;
  file: string;
}

interface DatasetsManifest {
  datasets?: ManifestDataset[];
}

interface DuneEnvelope<T> {
  execution_ended_at?: string;
  result?: {
    rows?: T[];
  };
}

interface FlowRowRaw {
  bucket_ts?: string;
  exchange_inflow_eth?: number;
  exchange_outflow_eth?: number;
  net_flow_eth?: number;
}

interface CexRowRaw {
  bucket_ts?: string;
  cex_name?: string;
  inflow_eth?: number;
  outflow_eth?: number;
  net_flow_eth?: number;
}

interface EdgeRowRaw {
  src?: string;
  dst?: string;
  src_label?: string;
  dst_label?: string;
  total_value_eth?: number;
  tx_count?: number;
}

const DATASET_IDS = {
  flow: "exchange_flow_7d_hourly",
  byCex: "exchange_netflow_by_cex_7d_hourly",
  edges: "exchange_network_edges_24h",
} as const;

let cachePromise: Promise<ExchangeAnalyticsData> | null = null;
const APP_BASE_URL = import.meta.env.BASE_URL || "/";

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const toTimestampMs = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

async function fetchJson<T>(path: string): Promise<T> {
  const resp = await fetch(path, { cache: "no-store" });
  if (!resp.ok) {
    throw new Error(`Failed to load ${path}: ${resp.status}`);
  }
  return (await resp.json()) as T;
}

function withBaseUrl(path: string) {
  const base = APP_BASE_URL.endsWith("/") ? APP_BASE_URL : `${APP_BASE_URL}/`;
  const normalized = path.startsWith("/") ? path.slice(1) : path;
  return `${base}${normalized}`;
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
    const srcRows = walletToEdges.get(edge.src) ?? [];
    srcRows.push(edge);
    walletToEdges.set(edge.src, srcRows);

    if (edge.dst !== edge.src) {
      const dstRows = walletToEdges.get(edge.dst) ?? [];
      dstRows.push(edge);
      walletToEdges.set(edge.dst, dstRows);
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

function normalizeFlowRows(rows: FlowRowRaw[] | undefined): FlowPoint[] {
  const out: FlowPoint[] = [];
  for (const row of rows ?? []) {
    const ts = toTimestampMs(row.bucket_ts);
    if (ts === null) {
      continue;
    }
    out.push({
      ts,
      inflow: toNumber(row.exchange_inflow_eth),
      outflow: toNumber(row.exchange_outflow_eth),
      net: toNumber(row.net_flow_eth),
    });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

function normalizeCexRows(rows: CexRowRaw[] | undefined): CexFlowPoint[] {
  const out: CexFlowPoint[] = [];
  for (const row of rows ?? []) {
    const ts = toTimestampMs(row.bucket_ts);
    const cex = typeof row.cex_name === "string" ? row.cex_name.trim() : "";
    if (ts === null || cex.length === 0) {
      continue;
    }
    out.push({
      ts,
      cex,
      inflow: toNumber(row.inflow_eth),
      outflow: toNumber(row.outflow_eth),
      net: toNumber(row.net_flow_eth),
    });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

function normalizeEdgeRows(rows: EdgeRowRaw[] | undefined): EdgePoint[] {
  const out: EdgePoint[] = [];
  for (const row of rows ?? []) {
    const src = typeof row.src === "string" ? row.src : "";
    const dst = typeof row.dst === "string" ? row.dst : "";
    if (src.length === 0 || dst.length === 0) {
      continue;
    }
    out.push({
      src,
      dst,
      srcLabel: typeof row.src_label === "string" ? row.src_label : "unlabeled",
      dstLabel: typeof row.dst_label === "string" ? row.dst_label : "unlabeled",
      valueEth: toNumber(row.total_value_eth),
      txCount: Math.max(0, Math.round(toNumber(row.tx_count))),
    });
  }
  return out.sort((a, b) => b.valueEth - a.valueEth);
}

function findDatasetPath(manifest: DatasetsManifest, datasetId: string, fallback: string) {
  const found = (manifest.datasets ?? []).find((dataset) => dataset.id === datasetId)?.file;
  return typeof found === "string" && found.length > 0 ? found : fallback;
}

export async function loadExchangeAnalyticsData(): Promise<ExchangeAnalyticsData> {
  if (cachePromise) {
    return cachePromise;
  }

  cachePromise = (async () => {
    const manifest = await fetchJson<DatasetsManifest>(withBaseUrl("data/datasets.json"));
    const flowPath = findDatasetPath(
      manifest,
      DATASET_IDS.flow,
      "/data/exchange_flow_7d_hourly.json",
    );
    const byCexPath = findDatasetPath(
      manifest,
      DATASET_IDS.byCex,
      "/data/exchange_netflow_by_cex_7d_hourly.json",
    );
    const edgesPath = findDatasetPath(
      manifest,
      DATASET_IDS.edges,
      "/data/exchange_network_edges_24h.json",
    );

    const [flowRaw, byCexRaw, edgesRaw] = await Promise.all([
      fetchJson<DuneEnvelope<FlowRowRaw>>(withBaseUrl(flowPath)),
      fetchJson<DuneEnvelope<CexRowRaw>>(withBaseUrl(byCexPath)),
      fetchJson<DuneEnvelope<EdgeRowRaw>>(withBaseUrl(edgesPath)),
    ]);

    const flowSeries = normalizeFlowRows(flowRaw.result?.rows);
    const byCexSeries = normalizeCexRows(byCexRaw.result?.rows);
    const edges24h = normalizeEdgeRows(edgesRaw.result?.rows);

    const executionTimes = [
      flowRaw.execution_ended_at,
      byCexRaw.execution_ended_at,
      edgesRaw.execution_ended_at,
    ]
      .map((value) => toTimestampMs(value))
      .filter((value): value is number => value !== null);

    const asOf = executionTimes.length > 0 ? Math.max(...executionTimes) : null;

    return {
      flowSeries,
      byCexSeries,
      edges24h,
      asOf,
      flowByHour: indexFlowByHour(flowSeries),
      cexToPoints: indexCexPoints(byCexSeries),
      walletToEdges: indexWalletEdges(edges24h),
    };
  })();

  return cachePromise;
}

export const selectFlowWindow = (
  data: ExchangeAnalyticsData,
  rangeMs: number,
  nowMs = Date.now(),
) => {
  const start = nowMs - rangeMs;
  return data.flowSeries.filter((point) => point.ts >= start);
};

export const selectTopEdges = (data: ExchangeAnalyticsData, limit: number) =>
  data.edges24h.slice(0, Math.max(0, limit));

export const selectWalletEdges = (data: ExchangeAnalyticsData, wallet: string) =>
  data.walletToEdges.get(wallet) ?? [];
