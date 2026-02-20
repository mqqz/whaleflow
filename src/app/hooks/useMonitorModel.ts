import { useMemo, useState } from "react";
import { useExchangeAnalytics } from "./useExchangeAnalytics";
import { EdgePoint, FlowPoint, selectTopEdges } from "../services/analyticsData";
import { LiveTransaction } from "./useLiveTransactions";

export type MonitorFeedMode = "live" | "top24h";

export interface MonitorEdgeFeedRow {
  id: string;
  timeLabel: string;
  src: string;
  dst: string;
  srcLabel: string;
  dstLabel: string;
  valueEth: number;
  txCount: number;
}

interface UseMonitorModelOptions {
  token: string;
  liveTransactions: LiveTransaction[];
  maxVisible: number;
}

interface UseMonitorModelResult {
  flowSeries: FlowPoint[];
  flowLoading: boolean;
  flowError: string | null;
  feedMode: MonitorFeedMode;
  setFeedMode: (mode: MonitorFeedMode) => void;
  feedTitle: string;
  feedSubtitle: string;
  edgeRows: MonitorEdgeFeedRow[];
  edgePoints24h: EdgePoint[];
  asOfLabel: string;
  insight: {
    signal: string;
    narrative: string;
    hasStats: boolean;
    netFlow: string;
    deltaPct: string;
    symbol: "▲" | "▼" | "■";
    trend: "positive" | "negative" | "neutral";
  };
  top24hAvailable: boolean;
}

const formatAsOf = (ts: number | null) =>
  ts === null
    ? "unknown"
    : new Date(ts).toLocaleString([], {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

export function useMonitorModel({
  token,
  liveTransactions,
  maxVisible,
}: UseMonitorModelOptions): UseMonitorModelResult {
  const { data, loading, error } = useExchangeAnalytics();
  const [feedMode, setFeedMode] = useState<MonitorFeedMode>("live");
  const isEth = token.toLowerCase() === "eth";
  const LIVE_BUCKET_MS = 5 * 60 * 1000;

  const liveFlowSeries = useMemo<FlowPoint[]>(() => {
    if (!isEth) {
      return [];
    }
    const byBucket = new Map<number, FlowPoint>();
    for (const tx of liveTransactions) {
      if (tx.channel !== "wallet") {
        continue;
      }
      const amount = Number.parseFloat(tx.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        continue;
      }
      const bucketTs = Math.floor(tx.timestampMs / LIVE_BUCKET_MS) * LIVE_BUCKET_MS;
      const current = byBucket.get(bucketTs) ?? {
        ts: bucketTs,
        inflow: 0,
        outflow: 0,
        net: 0,
      };
      if (tx.type === "inflow") {
        current.inflow += amount;
      } else {
        current.outflow += amount;
      }
      current.net = current.outflow - current.inflow;
      byBucket.set(bucketTs, current);
    }
    return [...byBucket.values()].sort((a, b) => a.ts - b.ts);
  }, [isEth, liveTransactions, LIVE_BUCKET_MS]);

  const flowSeries = useMemo(() => {
    if (!isEth) {
      return [] as FlowPoint[];
    }
    if (feedMode === "live") {
      return liveFlowSeries;
    }
    return data?.flowSeries ?? [];
  }, [data, feedMode, isEth, liveFlowSeries]);

  const asOfLabel = useMemo(() => formatAsOf(data?.asOf ?? null), [data?.asOf]);

  const edgeRows = useMemo<MonitorEdgeFeedRow[]>(() => {
    if (!data) {
      return [];
    }
    return selectTopEdges(data, maxVisible).map((edge, idx) => ({
      id: `${edge.src}:${edge.dst}:${idx}`,
      timeLabel: asOfLabel,
      src: edge.src,
      dst: edge.dst,
      srcLabel: edge.srcLabel,
      dstLabel: edge.dstLabel,
      valueEth: edge.valueEth,
      txCount: edge.txCount,
    }));
  }, [asOfLabel, data, maxVisible]);

  const edgePoints24h = useMemo(() => data?.edges24h ?? [], [data?.edges24h]);

  const feedTitle = feedMode === "live" ? "Live Transactions" : "Top Exchange Transfers (24H)";
  const feedSubtitle =
    feedMode === "live" ? "Streaming via RPC/WebSocket" : `Snapshot as of ${asOfLabel}`;

  const insight = useMemo(() => {
    if (flowSeries.length < 8) {
      return {
        signal: "Insufficient Data",
        narrative: "Flow history is too short for a directional read.",
        hasStats: false,
        netFlow: "n/a",
        deltaPct: "n/a",
        symbol: "■" as const,
        trend: "neutral" as const,
      };
    }
    const recent = flowSeries.slice(-3).reduce((sum, point) => sum + point.net, 0);
    const prev = flowSeries.slice(-6, -3).reduce((sum, point) => sum + point.net, 0);
    const direction =
      recent >= 0
        ? "Net outflows accelerated, suggesting short-term accumulation bias."
        : "Net inflows accelerated, signaling short-term sell-side pressure.";
    const signal = recent >= 0 ? "Accumulation Bias" : "Distribution Pressure";
    const strength =
      Math.abs(prev) < 1e-9 ? "n/a" : `${(((recent - prev) / Math.abs(prev)) * 100).toFixed(1)}%`;
    return {
      signal,
      narrative: direction,
      hasStats: true,
      netFlow: recent.toFixed(1),
      deltaPct: strength,
      symbol: recent >= 0 ? ("▲" as const) : ("▼" as const),
      trend: recent >= 0 ? ("positive" as const) : ("negative" as const),
    };
  }, [flowSeries]);

  return {
    flowSeries,
    flowLoading: feedMode === "top24h" ? loading : false,
    flowError: feedMode === "top24h" ? error : null,
    feedMode,
    setFeedMode,
    feedTitle,
    feedSubtitle,
    edgeRows,
    edgePoints24h,
    asOfLabel,
    insight,
    top24hAvailable: isEth,
  };
}
