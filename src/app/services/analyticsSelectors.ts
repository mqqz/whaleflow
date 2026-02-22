import type {
  ExchangeFlowPoint,
  FlowTier,
  TierExchangeEdge,
  TierExchangeFlowPoint,
} from "../types/analytics";

const HOUR_MS = 60 * 60 * 1000;

export const selectLastNHours = <T extends { bucket_ts: Date }>(
  series: T[],
  hours: number,
): T[] => {
  if (series.length === 0 || hours <= 0) {
    return [];
  }
  const endTs = series[series.length - 1]?.bucket_ts.getTime() ?? Date.now();
  const startTs = endTs - hours * HOUR_MS;
  return series.filter((point) => point.bucket_ts.getTime() >= startTs);
};

export const selectTier = (series: TierExchangeFlowPoint[], tier: FlowTier) =>
  series.filter((point) => point.tier === tier);

export const selectTopEdges = (edges: TierExchangeEdge[], n: number, tierFilter?: string) => {
  const filtered =
    tierFilter && tierFilter.trim().length > 0
      ? edges.filter((edge) => edge.tier === tierFilter.toLowerCase())
      : edges;
  return filtered.slice(0, Math.max(0, n));
};

export const computeWhaleOverlay = (
  exchangeFlow: ExchangeFlowPoint[],
  tierFlow: TierExchangeFlowPoint[],
) => {
  const whaleByTs = new Map<number, number>();
  for (const point of tierFlow) {
    if (point.tier !== "whale") {
      continue;
    }
    whaleByTs.set(point.bucket_ts.getTime(), point.tier_exchange_net_flow_eth);
  }

  return exchangeFlow.map((point) => {
    const ts = point.bucket_ts.getTime();
    return {
      bucket_ts: point.bucket_ts,
      net_flow_eth: point.net_flow_eth,
      whale_net_flow_eth: whaleByTs.get(ts) ?? 0,
    };
  });
};

export const formatAsOf = () => {
  const now = new Date();
  const dailyAsOfUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0),
  );
  return `${dailyAsOfUtc.toLocaleString([], {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })} UTC`;
};
