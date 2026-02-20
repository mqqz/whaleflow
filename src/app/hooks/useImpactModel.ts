import { useEffect, useMemo, useState } from "react";
import { LiveTransaction } from "./useLiveTransactions";
import { useExchangeAnalytics } from "./useExchangeAnalytics";
import { CexFlowPoint, FlowPoint } from "../services/analyticsData";
import { CandleInterval, PriceCandle, fetchPriceCandlesWithFallback } from "../services/marketData";

export type ImpactRange = "24h" | "7d";
export type ImpactLagHours = 0 | 1 | 3;

export interface ImpactFlowPricePoint {
  ts: number;
  inflow: number;
  outflow: number;
  net: number;
  shiftedNet: number;
  price: number | null;
  priceIndex: number | null;
}

export interface ImpactCexSeries {
  cex: string;
  points: FlowPoint[];
}

interface ImpactKpi {
  value: number | null;
  pct: number | null;
}

interface UseImpactModelOptions {
  token: string;
  transactions: LiveTransaction[];
}

interface UseImpactModelResult {
  range: ImpactRange;
  setRange: (value: ImpactRange) => void;
  lagHours: ImpactLagHours;
  setLagHours: (value: ImpactLagHours) => void;
  whaleThresholdEth: number;
  flowPriceSeries: ImpactFlowPricePoint[];
  byCexSeries: ImpactCexSeries[];
  cumulativeSeries: Array<{ ts: number; cumulative: number }>;
  kpis: {
    netFlow1h: ImpactKpi;
    whaleVolume1h: ImpactKpi;
    rollingVol24h: ImpactKpi;
    flowReturnCorr24h: ImpactKpi;
    flowZScore: ImpactKpi;
  };
  insight: {
    summary: string;
    detail: string;
  };
  loading: boolean;
  error: string | null;
  priceSource: string;
}

const RANGE_MS: Record<ImpactRange, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

const PRICE_INTERVAL: Record<ImpactRange, CandleInterval> = {
  "24h": "5m",
  "7d": "5m",
};

const HOUR_MS = 60 * 60 * 1000;
const WHALE_THRESHOLD_ETH = 500;

const toPctChange = (current: number | null, previous: number | null) => {
  if (current === null || previous === null) {
    return null;
  }
  if (Math.abs(previous) < 1e-9) {
    return null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
};

const stdDev = (values: number[]) => {
  if (values.length < 2) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(variance, 0));
};

const correlation = (x: number[], y: number[]) => {
  if (x.length < 3 || y.length < 3 || x.length !== y.length) {
    return null;
  }
  const meanX = x.reduce((sum, value) => sum + value, 0) / x.length;
  const meanY = y.reduce((sum, value) => sum + value, 0) / y.length;
  let numerator = 0;
  let sumX = 0;
  let sumY = 0;
  for (let idx = 0; idx < x.length; idx += 1) {
    const dx = x[idx]! - meanX;
    const dy = y[idx]! - meanY;
    numerator += dx * dy;
    sumX += dx * dx;
    sumY += dy * dy;
  }
  const denominator = Math.sqrt(sumX) * Math.sqrt(sumY);
  if (denominator === 0) {
    return null;
  }
  return numerator / denominator;
};

const erf = (x: number) => {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * absX);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-absX * absX);
  return sign * y;
};

const normalCdf = (z: number) => 0.5 * (1 + erf(z / Math.sqrt(2)));

const floorHour = (ts: number) => Math.floor(ts / HOUR_MS) * HOUR_MS;

const aggregateCandlesHourly = (candles: PriceCandle[], startTs: number) => {
  const byHour = new Map<number, number>();
  for (const candle of candles) {
    if (candle.ts < startTs) {
      continue;
    }
    byHour.set(floorHour(candle.ts), candle.close);
  }
  return byHour;
};

const movementLabel = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) {
    return "stable";
  }
  if (value > 0) {
    return "strengthening";
  }
  if (value < 0) {
    return "weakening";
  }
  return "stable";
};

export function useImpactModel({
  token,
  transactions,
}: UseImpactModelOptions): UseImpactModelResult {
  const { data, loading: analyticsLoading, error: analyticsError } = useExchangeAnalytics();
  const [range, setRange] = useState<ImpactRange>("24h");
  const [lagHours, setLagHours] = useState<ImpactLagHours>(0);
  const [candles, setCandles] = useState<PriceCandle[]>([]);
  const [priceSource, setPriceSource] = useState("Unavailable");
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setPriceLoading(true);
    setPriceError(null);
    fetchPriceCandlesWithFallback({
      token,
      rangeMs: RANGE_MS[range],
      interval: PRICE_INTERVAL[range],
    })
      .then((result) => {
        if (!active) {
          return;
        }
        setCandles(result.candles);
        setPriceSource(result.source);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setCandles([]);
        setPriceSource("Unavailable");
        setPriceError("Price feed unavailable");
      })
      .finally(() => {
        if (active) {
          setPriceLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [range, token]);

  const nowMs = Date.now();
  const startTs = nowMs - RANGE_MS[range];

  const flowWindow = useMemo(() => {
    return (data?.flowSeries ?? []).filter((point) => point.ts >= startTs);
  }, [data?.flowSeries, startTs]);

  const flowPriceSeries = useMemo<ImpactFlowPricePoint[]>(() => {
    const priceByHour = aggregateCandlesHourly(candles, startTs);
    const lagMs = lagHours * HOUR_MS;
    const out = flowWindow.map((point) => {
      const laggedPoint = flowWindow.find((candidate) => candidate.ts === point.ts - lagMs);
      return {
        ts: point.ts,
        inflow: point.inflow,
        outflow: point.outflow,
        net: point.net,
        shiftedNet: laggedPoint?.net ?? point.net,
        price: priceByHour.get(point.ts) ?? null,
        priceIndex: null,
      };
    });

    const basePrice = out.find((point) => point.price !== null)?.price ?? null;
    for (const point of out) {
      point.priceIndex =
        basePrice && point.price !== null && basePrice > 0 ? (point.price / basePrice) * 100 : null;
    }

    return out;
  }, [candles, flowWindow, lagHours, startTs]);

  const byCexSeries = useMemo<ImpactCexSeries[]>(() => {
    const series = (data?.byCexSeries ?? []).filter((point) => point.ts >= startTs);
    const byCex = new Map<string, CexFlowPoint[]>();
    for (const point of series) {
      const rows = byCex.get(point.cex) ?? [];
      rows.push(point);
      byCex.set(point.cex, rows);
    }

    const ranked = [...byCex.entries()]
      .map(([cex, points]) => ({
        cex,
        points,
        score: points.reduce((sum, point) => sum + Math.abs(point.net), 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return ranked.map((entry) => ({
      cex: entry.cex,
      points: entry.points
        .map((point) => ({
          ts: point.ts,
          inflow: point.inflow,
          outflow: point.outflow,
          net: point.net,
        }))
        .sort((a, b) => a.ts - b.ts),
    }));
  }, [data?.byCexSeries, startTs]);

  const cumulativeSeries = useMemo(() => {
    let running = 0;
    return flowWindow.map((point) => {
      running += point.net;
      return { ts: point.ts, cumulative: running };
    });
  }, [flowWindow]);

  const kpis = useMemo(() => {
    const lastPoint = flowWindow.at(-1) ?? null;
    const prevPoint = flowWindow.length > 1 ? flowWindow[flowWindow.length - 2] : null;

    const txInWindow = transactions.filter((tx) => tx.channel === "wallet");
    const lastHourStart = nowMs - HOUR_MS;
    const prevHourStart = nowMs - 2 * HOUR_MS;

    const whaleSum = (minTs: number, maxTs: number) =>
      txInWindow
        .filter((tx) => tx.timestampMs >= minTs && tx.timestampMs < maxTs)
        .reduce((sum, tx) => {
          const amount = Number.parseFloat(tx.amount);
          if (!Number.isFinite(amount) || amount < WHALE_THRESHOLD_ETH) {
            return sum;
          }
          return sum + amount;
        }, 0);

    const whaleCurrent = whaleSum(lastHourStart, nowMs);
    const whalePrev = whaleSum(prevHourStart, lastHourStart);

    const pricePoints = flowPriceSeries.filter((point) => point.price !== null) as Array<
      ImpactFlowPricePoint & { price: number }
    >;
    const returns: Array<{ ts: number; ret: number }> = [];
    for (let idx = 1; idx < pricePoints.length; idx += 1) {
      const prev = pricePoints[idx - 1]!.price;
      const current = pricePoints[idx]!.price;
      const ret = prev > 0 ? (current - prev) / prev : 0;
      returns.push({ ts: pricePoints[idx]!.ts, ret });
    }

    const recentReturns = returns.slice(-24).map((item) => item.ret);
    const prevReturns = returns.slice(-48, -24).map((item) => item.ret);
    const rollingVol = stdDev(recentReturns) * 100;
    const rollingVolPrev = stdDev(prevReturns) * 100;

    const retByTs = new Map<number, number>();
    for (const row of returns) {
      retByTs.set(row.ts, row.ret);
    }
    const corrWindow = flowPriceSeries
      .slice(-24)
      .filter((point) => retByTs.has(point.ts))
      .map((point) => ({ net: point.net, ret: retByTs.get(point.ts)! }));
    const prevCorrWindow = flowPriceSeries
      .slice(-48, -24)
      .filter((point) => retByTs.has(point.ts))
      .map((point) => ({ net: point.net, ret: retByTs.get(point.ts)! }));

    const corrCurrent = correlation(
      corrWindow.map((row) => row.net),
      corrWindow.map((row) => row.ret),
    );
    const corrPrev = correlation(
      prevCorrWindow.map((row) => row.net),
      prevCorrWindow.map((row) => row.ret),
    );

    const baseline = flowWindow.slice(-168).map((point) => point.net);
    const mean =
      baseline.length > 0 ? baseline.reduce((sum, value) => sum + value, 0) / baseline.length : 0;
    const sigma = stdDev(baseline);
    const z = lastPoint && sigma > 1e-9 ? (lastPoint.net - mean) / sigma : null;
    const zPrev = prevPoint && sigma > 1e-9 ? (prevPoint.net - mean) / sigma : null;

    return {
      netFlow1h: {
        value: lastPoint?.net ?? null,
        pct: toPctChange(lastPoint?.net ?? null, prevPoint?.net ?? null),
      },
      whaleVolume1h: {
        value: whaleCurrent,
        pct: toPctChange(whaleCurrent, whalePrev),
      },
      rollingVol24h: {
        value: Number.isFinite(rollingVol) ? rollingVol : null,
        pct: toPctChange(rollingVol, rollingVolPrev),
      },
      flowReturnCorr24h: {
        value: corrCurrent,
        pct: toPctChange(corrCurrent, corrPrev),
      },
      flowZScore: {
        value: z,
        pct: toPctChange(z, zPrev),
      },
    };
  }, [flowPriceSeries, flowWindow, nowMs, transactions]);

  const insight = useMemo(() => {
    const corr = kpis.flowReturnCorr24h.value;
    const z = kpis.flowZScore.value;
    const corrStrength =
      corr === null
        ? "No flow-return signal"
        : `Flow-return ${movementLabel(corr)} (${corr.toFixed(2)})`;
    const zPercentile = z === null ? null : normalCdf(z) * 100;
    const detail =
      z === null || zPercentile === null
        ? "Insufficient history for flow anomaly scoring."
        : `Net flow z-score ${z.toFixed(2)} (about ${zPercentile.toFixed(1)} percentile).`;
    return {
      summary: corrStrength,
      detail,
    };
  }, [kpis.flowReturnCorr24h.value, kpis.flowZScore.value]);

  return {
    range,
    setRange,
    lagHours,
    setLagHours,
    whaleThresholdEth: WHALE_THRESHOLD_ETH,
    flowPriceSeries,
    byCexSeries,
    cumulativeSeries,
    kpis,
    insight,
    loading: analyticsLoading || priceLoading,
    error: analyticsError ?? priceError,
    priceSource,
  };
}
