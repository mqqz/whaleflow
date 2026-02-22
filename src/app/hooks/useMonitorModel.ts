import { useMemo, useState } from "react";
import { useAnalyticsData } from "./useAnalyticsData";
import { formatAsOf, selectTopEdges } from "../services/analyticsSelectors";
import { LiveTransaction } from "./useLiveTransactions";
import type { EdgePoint, FlowPoint } from "../services/analyticsData";

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

const normalizeNode = (value: string) => value.replace(/^tier:/, "").replace(/^cex:/, "");

export function useMonitorModel({
  token,
  liveTransactions,
  maxVisible,
}: UseMonitorModelOptions): UseMonitorModelResult {
  const { exchangeFlow, tierEdges, loading, error } = useAnalyticsData();
  const [feedMode, setFeedMode] = useState<MonitorFeedMode>("live");
  const isEth = token.toLowerCase() === "eth";

  const liveFlowSeries = useMemo<FlowPoint[]>(() => {
    if (!isEth) {
      return [];
    }
    const points: FlowPoint[] = [];
    // `liveTransactions` is newest-first; chart needs oldest-first for left-to-right time movement.
    const chronological = [...liveTransactions].sort((a, b) => a.timestampMs - b.timestampMs);
    let lastTs = 0;

    for (const tx of chronological) {
      if (tx.channel !== "wallet") {
        continue;
      }
      const amount = Number.parseFloat(tx.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        continue;
      }
      const fromIsExchange = Boolean(tx.fromLabel);
      const toIsExchange = Boolean(tx.toLabel);
      if (fromIsExchange === toIsExchange) {
        continue;
      }

      // Keep timestamps strictly increasing so every accepted point advances right on the x-axis.
      const ts = tx.timestampMs <= lastTs ? lastTs + 1 : tx.timestampMs;
      lastTs = ts;

      let inflow = 0;
      let outflow = 0;
      if (toIsExchange) {
        inflow = amount;
      } else {
        outflow = amount;
      }
      points.push({
        ts,
        inflow,
        outflow,
        net: outflow - inflow,
      });
    }

    return points;
  }, [isEth, liveTransactions]);

  const top24hFlowSeries = useMemo<FlowPoint[]>(() => {
    return exchangeFlow.map((point) => ({
      ts: point.bucket_ts.getTime(),
      inflow: point.exchange_inflow_eth,
      outflow: point.exchange_outflow_eth,
      net: point.net_flow_eth,
    }));
  }, [exchangeFlow]);

  const flowSeries = useMemo(() => {
    if (!isEth) {
      return [] as FlowPoint[];
    }
    if (feedMode === "live") {
      return liveFlowSeries;
    }
    return top24hFlowSeries;
  }, [feedMode, isEth, liveFlowSeries, top24hFlowSeries]);

  const asOfLabel = useMemo(() => formatAsOf(), []);

  const edgePoints24h = useMemo<EdgePoint[]>(() => {
    return tierEdges.map((edge) => {
      const srcLabel = edge.src_type === "exchange" ? edge.cex_name || "exchange" : edge.tier;
      const dstLabel = edge.dst_type === "exchange" ? edge.cex_name || "exchange" : edge.tier;
      return {
        src: normalizeNode(edge.src_node),
        dst: normalizeNode(edge.dst_node),
        srcLabel: srcLabel || "unlabeled",
        dstLabel: dstLabel || "unlabeled",
        valueEth: edge.total_value_eth,
        txCount: edge.tx_count,
      };
    });
  }, [tierEdges]);

  const edgeRows = useMemo<MonitorEdgeFeedRow[]>(() => {
    return selectTopEdges(tierEdges, maxVisible).map((edge, idx) => ({
      id: `${edge.src_node}:${edge.dst_node}:${idx}`,
      timeLabel: asOfLabel,
      src: normalizeNode(edge.src_node),
      dst: normalizeNode(edge.dst_node),
      srcLabel:
        (edge.src_type === "exchange" ? edge.cex_name || "exchange" : edge.tier) || "unlabeled",
      dstLabel:
        (edge.dst_type === "exchange" ? edge.cex_name || "exchange" : edge.tier) || "unlabeled",
      valueEth: edge.total_value_eth,
      txCount: edge.tx_count,
    }));
  }, [asOfLabel, maxVisible, tierEdges]);

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
