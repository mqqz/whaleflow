import { useEffect, useMemo, useState } from "react";
import { useAnalyticsData } from "./useAnalyticsData";
import { selectLastNHours, selectTier } from "../services/analyticsSelectors";
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
  points: Array<{ ts: number; inflow: number; outflow: number; net: number }>;
}

interface ImpactKpi {
  value: number | null;
  pct: number | null;
}

interface UseImpactModelOptions {
  token: string;
}

interface UseImpactModelResult {
  range: ImpactRange;
  setRange: (value: ImpactRange) => void;
  lagHours: ImpactLagHours;
  setLagHours: (value: ImpactLagHours) => void;
  flowPriceSeries: ImpactFlowPricePoint[];
  byCexSeries: ImpactCexSeries[];
  cumulativeSeries: Array<{ ts: number; cumulative: number }>;
  kpis: {
    netExchangeFlow1h: ImpactKpi;
    whaleExchangeNetFlow1h: ImpactKpi;
    whaleShare: ImpactKpi;
    rollingVolatility24h: ImpactKpi;
    flowReturnCorr24h: ImpactKpi;
  };
  insight: {
    summary: string;
    detail: string;
  };
  loading: boolean;
  error: string | null;
  priceSource: string;
}

const RANGE_HOURS: Record<ImpactRange, number> = {
  "24h": 24,
  "7d": 7 * 24,
};

const PRICE_INTERVAL: Record<ImpactRange, CandleInterval> = {
  "24h": "5m",
  "7d": "5m",
};

const HOUR_MS = 60 * 60 * 1000;
const EPSILON = 1e-9;

const toPctChange = (current: number | null, previous: number | null) => {
  if (current === null || previous === null) {
    return null;
  }
  if (Math.abs(previous) < EPSILON) {
    return null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
};

const stdDev = (values: number[]) => {
  if (values.length < 2) {
    return null;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Number.isFinite(variance) ? Math.sqrt(Math.max(variance, 0)) : null;
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
  if (denominator < EPSILON) {
    return null;
  }
  return numerator / denominator;
};

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

const calcWhaleShare = (whaleNet: number | null, totalNet: number | null) => {
  if (whaleNet === null || totalNet === null) {
    return null;
  }
  return Math.abs(whaleNet) / Math.max(EPSILON, Math.abs(totalNet));
};

export function useImpactModel({ token }: UseImpactModelOptions): UseImpactModelResult {
  const {
    exchangeFlow,
    tierFlow,
    loading: analyticsLoading,
    error: analyticsError,
  } = useAnalyticsData();
  const [range, setRange] = useState<ImpactRange>("24h");
  const [lagHours, setLagHours] = useState<ImpactLagHours>(0);
  const [candles, setCandles] = useState<PriceCandle[]>([]);
  const [priceSource, setPriceSource] = useState("Unavailable");
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  const flowWindow = useMemo(
    () => selectLastNHours(exchangeFlow, RANGE_HOURS[range]),
    [exchangeFlow, range],
  );

  const whaleTierWindow = useMemo(
    () => selectLastNHours(selectTier(tierFlow, "whale"), RANGE_HOURS[range]),
    [tierFlow, range],
  );

  const anchorNowMs = flowWindow.at(-1)?.bucket_ts.getTime() ?? Date.now();
  const startTs = anchorNowMs - RANGE_HOURS[range] * HOUR_MS;

  useEffect(() => {
    let active = true;
    setPriceLoading(true);
    setPriceError(null);

    fetchPriceCandlesWithFallback({
      token,
      rangeMs: RANGE_HOURS[range] * HOUR_MS * 2,
      interval: PRICE_INTERVAL[range],
      endMs: anchorNowMs,
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
  }, [anchorNowMs, range, token]);

  const flowPriceSeries = useMemo<ImpactFlowPricePoint[]>(() => {
    const whaleByTs = new Map<number, number>();
    for (const point of whaleTierWindow) {
      whaleByTs.set(point.bucket_ts.getTime(), point.tier_exchange_net_flow_eth);
    }

    const priceByHour = aggregateCandlesHourly(candles, startTs);
    const lagMs = lagHours * HOUR_MS;

    const out = flowWindow.map((point) => {
      const ts = point.bucket_ts.getTime();
      const flowValue = whaleByTs.get(ts) ?? point.net_flow_eth;
      const laggedPoint = flowWindow.find(
        (candidate) => candidate.bucket_ts.getTime() === ts - lagMs,
      );
      const laggedFlow = laggedPoint
        ? (whaleByTs.get(laggedPoint.bucket_ts.getTime()) ?? laggedPoint.net_flow_eth)
        : flowValue;

      return {
        ts,
        inflow: point.exchange_inflow_eth,
        outflow: point.exchange_outflow_eth,
        net: flowValue,
        shiftedNet: laggedFlow,
        price: priceByHour.get(ts) ?? null,
        priceIndex: null,
      };
    });

    const basePrice = out.find((point) => point.price !== null)?.price ?? null;
    for (const point of out) {
      point.priceIndex =
        basePrice && point.price !== null && basePrice > 0 ? (point.price / basePrice) * 100 : null;
    }

    return out;
  }, [candles, flowWindow, lagHours, startTs, whaleTierWindow]);

  const byCexSeries = useMemo<ImpactCexSeries[]>(() => {
    const tiers: Array<{ key: string; label: string }> = [
      { key: "whale", label: "Whale" },
      { key: "shark", label: "Shark" },
      { key: "dolphin", label: "Dolphin" },
      { key: "shrimp", label: "Shrimp" },
    ];
    const timeline = flowWindow.map((point) => point.bucket_ts.getTime());

    return tiers
      .map(({ key, label }) => {
        const tierPoints = selectLastNHours(
          tierFlow.filter((point) => point.tier === key),
          RANGE_HOURS[range],
        );
        const tierByTs = new Map<number, (typeof tierPoints)[number]>();
        for (const point of tierPoints) {
          tierByTs.set(point.bucket_ts.getTime(), point);
        }
        const points = timeline.map((ts) => {
          const point = tierByTs.get(ts);
          return {
            ts,
            inflow: point?.tier_exchange_inflow_eth ?? 0,
            outflow: point?.tier_exchange_outflow_eth ?? 0,
            net: point?.tier_exchange_net_flow_eth ?? 0,
          };
        });

        return {
          cex: label,
          points,
          score: points.reduce((sum, point) => sum + Math.abs(point.net), 0),
        };
      })
      .filter((entry) => entry.points.length > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ cex, points }) => ({ cex, points }));
  }, [flowWindow, range, tierFlow]);

  const cumulativeSeries = useMemo(() => {
    let running = 0;
    return flowWindow.map((point) => {
      running += point.net_flow_eth;
      return { ts: point.bucket_ts.getTime(), cumulative: running };
    });
  }, [flowWindow]);

  const kpiFlowSeries = useMemo(() => {
    const windowHours = range === "24h" ? 24 : 24 * 7;
    const extendedWindow = selectLastNHours(exchangeFlow, windowHours * 2);
    const whaleSeries = selectTier(tierFlow, "whale");
    const whaleByTs = new Map<number, number>();
    for (const point of whaleSeries) {
      whaleByTs.set(point.bucket_ts.getTime(), point.tier_exchange_net_flow_eth);
    }

    const startTs = anchorNowMs - windowHours * 2 * HOUR_MS;
    const priceByHour = aggregateCandlesHourly(candles, startTs);

    return extendedWindow.map((point) => {
      const ts = point.bucket_ts.getTime();
      return {
        ts,
        net: whaleByTs.get(ts) ?? point.net_flow_eth,
        price: priceByHour.get(ts) ?? null,
      };
    });
  }, [anchorNowMs, candles, exchangeFlow, range, tierFlow]);

  const kpis = useMemo(() => {
    const rangeHours = RANGE_HOURS[range];
    const windowPoints = range === "24h" ? 24 : 24 * 7;
    const deltaHours = range === "7d" ? 24 : rangeHours;
    const endTs = exchangeFlow.at(-1)?.bucket_ts.getTime() ?? null;
    const rangeMs = rangeHours * HOUR_MS;
    const deltaMs = deltaHours * HOUR_MS;

    const sumWindow = <T>(
      rows: T[],
      getTs: (row: T) => number,
      getValue: (row: T) => number,
      start: number,
      end: number,
    ) =>
      rows
        .filter((row) => {
          const ts = getTs(row);
          return ts >= start && ts < end;
        })
        .reduce((sum, row) => sum + getValue(row), 0);

    const whaleSeries = selectTier(tierFlow, "whale");
    const currentStart = endTs === null ? null : endTs - rangeMs;
    const deltaCurrentStart = endTs === null ? null : endTs - deltaMs;
    const deltaPrevStart = deltaCurrentStart === null ? null : deltaCurrentStart - deltaMs;
    const deltaPrevEnd = deltaCurrentStart === null ? null : deltaCurrentStart - HOUR_MS;

    const currentTotalNet =
      endTs === null || currentStart === null
        ? null
        : sumWindow(
            exchangeFlow,
            (row) => row.bucket_ts.getTime(),
            (row) => row.net_flow_eth,
            currentStart,
            endTs + 1,
          );
    const currentWhaleNet =
      endTs === null || currentStart === null
        ? null
        : sumWindow(
            whaleSeries,
            (row) => row.bucket_ts.getTime(),
            (row) => row.tier_exchange_net_flow_eth,
            currentStart,
            endTs + 1,
          );
    const deltaCurrentTotalNet =
      endTs === null || deltaCurrentStart === null
        ? null
        : sumWindow(
            exchangeFlow,
            (row) => row.bucket_ts.getTime(),
            (row) => row.net_flow_eth,
            deltaCurrentStart,
            endTs + 1,
          );
    const deltaPrevTotalNet =
      deltaPrevStart === null || deltaPrevEnd === null
        ? null
        : sumWindow(
            exchangeFlow,
            (row) => row.bucket_ts.getTime(),
            (row) => row.net_flow_eth,
            deltaPrevStart,
            deltaPrevEnd + 1,
          );
    const deltaCurrentWhaleNet =
      endTs === null || deltaCurrentStart === null
        ? null
        : sumWindow(
            whaleSeries,
            (row) => row.bucket_ts.getTime(),
            (row) => row.tier_exchange_net_flow_eth,
            deltaCurrentStart,
            endTs + 1,
          );
    const deltaPrevWhaleNet =
      deltaPrevStart === null || deltaPrevEnd === null
        ? null
        : sumWindow(
            whaleSeries,
            (row) => row.bucket_ts.getTime(),
            (row) => row.tier_exchange_net_flow_eth,
            deltaPrevStart,
            deltaPrevEnd + 1,
          );

    const pricePoints = kpiFlowSeries.filter((point) => point.price !== null) as Array<{
      ts: number;
      net: number;
      price: number;
    }>;

    const returns: Array<{ ts: number; ret: number }> = [];
    for (let idx = 1; idx < pricePoints.length; idx += 1) {
      const prev = pricePoints[idx - 1]!.price;
      const current = pricePoints[idx]!.price;
      const ret = prev > 0 ? (current - prev) / prev : 0;
      returns.push({ ts: pricePoints[idx]!.ts, ret });
    }

    const retByTs = new Map<number, number>();
    for (const row of returns) {
      retByTs.set(row.ts, row.ret);
    }

    const corrWindow = kpiFlowSeries
      .slice(-windowPoints)
      .filter((point) => retByTs.has(point.ts))
      .map((point) => ({ flow: point.net, ret: retByTs.get(point.ts)! }));
    const corrDeltaWindow = range === "7d" ? 24 : windowPoints;
    const corrDeltaCurrent = kpiFlowSeries
      .slice(-corrDeltaWindow)
      .filter((point) => retByTs.has(point.ts))
      .map((point) => ({ flow: point.net, ret: retByTs.get(point.ts)! }));
    const corrDeltaPrev = kpiFlowSeries
      .slice(-(corrDeltaWindow * 2), -corrDeltaWindow)
      .filter((point) => retByTs.has(point.ts))
      .map((point) => ({ flow: point.net, ret: retByTs.get(point.ts)! }));

    const corrCurrent = correlation(
      corrWindow.map((row) => row.flow),
      corrWindow.map((row) => row.ret),
    );

    const corrDeltaCurrentValue = correlation(
      corrDeltaCurrent.map((row) => row.flow),
      corrDeltaCurrent.map((row) => row.ret),
    );
    const corrDeltaPrevValue = correlation(
      corrDeltaPrev.map((row) => row.flow),
      corrDeltaPrev.map((row) => row.ret),
    );

    const whaleShareNow = calcWhaleShare(currentWhaleNet, currentTotalNet);
    const whaleShareDeltaCurrent = calcWhaleShare(deltaCurrentWhaleNet, deltaCurrentTotalNet);
    const whaleShareDeltaPrev = calcWhaleShare(deltaPrevWhaleNet, deltaPrevTotalNet);
    const recentReturns = returns.slice(-windowPoints).map((row) => row.ret);
    const volDeltaWindow = range === "7d" ? 24 : windowPoints;
    const volDeltaCurrentReturns = returns.slice(-volDeltaWindow).map((row) => row.ret);
    const volDeltaPrevReturns = returns
      .slice(-(volDeltaWindow * 2), -volDeltaWindow)
      .map((row) => row.ret);
    const rollingVol = stdDev(recentReturns);
    const rollingVolDeltaCurrent = stdDev(volDeltaCurrentReturns);
    const rollingVolDeltaPrev = stdDev(volDeltaPrevReturns);

    return {
      netExchangeFlow1h: {
        value: currentTotalNet,
        pct: toPctChange(deltaCurrentTotalNet, deltaPrevTotalNet),
      },
      whaleExchangeNetFlow1h: {
        value: currentWhaleNet,
        pct: toPctChange(deltaCurrentWhaleNet, deltaPrevWhaleNet),
      },
      whaleShare: {
        value: whaleShareNow,
        pct: toPctChange(whaleShareDeltaCurrent, whaleShareDeltaPrev),
      },
      rollingVolatility24h: {
        value: rollingVol === null ? null : rollingVol * 100,
        pct:
          rollingVolDeltaCurrent === null || rollingVolDeltaPrev === null
            ? null
            : toPctChange(rollingVolDeltaCurrent * 100, rollingVolDeltaPrev * 100),
      },
      flowReturnCorr24h: {
        value: corrCurrent,
        pct: toPctChange(corrDeltaCurrentValue, corrDeltaPrevValue),
      },
    };
  }, [exchangeFlow, kpiFlowSeries, range, tierFlow]);

  const insight = useMemo(() => {
    const corr = kpis.flowReturnCorr24h.value;
    const share = kpis.whaleShare.value;
    const net = kpis.netExchangeFlow1h.value;
    const whaleNet = kpis.whaleExchangeNetFlow1h.value;
    const vol = kpis.rollingVolatility24h.value;
    const whaleAligned = net !== null && whaleNet !== null && net * whaleNet > 0;
    const corrStrong = corr !== null && Math.abs(corr) >= 0.35;
    const volRegime =
      vol === null
        ? "uncertain volatility regime"
        : vol > 3
          ? "high-volatility regime"
          : "contained volatility regime";
    const flowRegime =
      net === null || whaleNet === null
        ? "flow leadership unclear"
        : whaleAligned
          ? "whale and aggregate flows are aligned"
          : "whale and aggregate flows are diverging";
    return {
      summary:
        corr === null
          ? "Price is currently weakly coupled to flow."
          : corrStrong
            ? `Flow-price link is ${movementLabel(corr)} and actionable.`
            : "Flow-price link is present but not decisive.",
      detail:
        share === null
          ? `${flowRegime}; ${volRegime}.`
          : `${flowRegime}; whale participation is elevated while the market remains in a ${volRegime}.`,
    };
  }, [
    kpis.flowReturnCorr24h.value,
    kpis.netExchangeFlow1h.value,
    kpis.rollingVolatility24h.value,
    kpis.whaleExchangeNetFlow1h.value,
    kpis.whaleShare.value,
  ]);

  return {
    range,
    setRange,
    lagHours,
    setLagHours,
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
