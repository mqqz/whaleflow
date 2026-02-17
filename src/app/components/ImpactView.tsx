import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { LiveTransaction } from "../hooks/useLiveTransactions";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";

type TimeRange = "1h" | "6h" | "24h" | "7d";

interface ImpactPageProps {
  transactions: LiveTransaction[];
}

interface PriceCandle {
  ts: number;
  close: number;
}

interface BucketPoint {
  ts: number;
  inflow: number;
  outflow: number;
  netFlow: number;
  whaleVolume: number;
  whaleTxCount: number;
  close: number;
  ret: number;
}

const RANGE_CONFIG: Record<TimeRange, { label: string; ms: number; interval: "1m" | "5m" }> = {
  "1h": { label: "1H", ms: 60 * 60 * 1000, interval: "1m" },
  "6h": { label: "6H", ms: 6 * 60 * 60 * 1000, interval: "1m" },
  "24h": { label: "24H", ms: 24 * 60 * 60 * 1000, interval: "5m" },
  "7d": { label: "7D", ms: 7 * 24 * 60 * 60 * 1000, interval: "5m" },
};

const BUCKET_MS = 5 * 60 * 1000;
const WHALE_THRESHOLD = 100;
const MIN_VISIBLE_WHALE_MARKER = 15;
const FALLBACK_W = 1000;
const FALLBACK_PRICE_H = 320;
const FALLBACK_SERIES_H = 250;
const PAD_TOP = 16;
const PAD_RIGHT = 16;
const PAD_BOTTOM = 24;
const PAD_LEFT = 38;

const EXCHANGE_TERMS = [
  "exchange",
  "binance",
  "coinbase",
  "kraken",
  "okx",
  "bybit",
  "router",
  "bridge",
  "uniswap",
  "sushi",
];

const intervalToMs: Record<"1m" | "5m", number> = {
  "1m": 60_000,
  "5m": 300_000,
};

const parseAmount = (amount: string) => {
  const parsed = Number.parseFloat(amount);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatShortTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const formatValue = (value: number) => {
  if (!Number.isFinite(value)) {
    return "0";
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toFixed(2);
};

const toPctChange = (current: number, previous: number) => {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return null;
  }
  if (Math.abs(previous) < 1e-9) {
    return null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
};

const movementStyle = (pct: number | null) => {
  if (pct === null || Math.abs(pct) < 0.05) {
    return { symbol: "■", className: "text-muted-foreground", text: "n/a" };
  }
  if (pct > 0) {
    return { symbol: "▲", className: "text-success", text: `+${pct.toFixed(1)}%` };
  }
  return { symbol: "▼", className: "text-destructive", text: `${pct.toFixed(1)}%` };
};

const isExchangeLike = (wallet: string) => {
  const lower = wallet.toLowerCase();
  return EXCHANGE_TERMS.some((term) => lower.includes(term));
};

const stdDev = (values: number[]) => {
  if (values.length < 2) {
    return 0;
  }
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(variance, 0));
};

const correlation = (x: number[], y: number[]) => {
  if (x.length < 3 || y.length < 3 || x.length !== y.length) {
    return null;
  }
  const meanX = x.reduce((sum, v) => sum + v, 0) / x.length;
  const meanY = y.reduce((sum, v) => sum + v, 0) / y.length;
  const centered = x.map((_, i) => ({ x: x[i]! - meanX, y: y[i]! - meanY }));
  const num = centered.reduce((sum, p) => sum + p.x * p.y, 0);
  const denX = Math.sqrt(centered.reduce((sum, p) => sum + p.x ** 2, 0));
  const denY = Math.sqrt(centered.reduce((sum, p) => sum + p.y ** 2, 0));
  const den = denX * denY;
  return den === 0 ? null : num / den;
};

const nearestClose = (candles: PriceCandle[], ts: number) => {
  if (candles.length === 0) {
    return 0;
  }
  const bisect = d3.bisector((d: PriceCandle) => d.ts).center;
  const idx = bisect(candles, ts);
  return candles[Math.max(0, Math.min(idx, candles.length - 1))]?.close ?? 0;
};

async function fetchPriceCandles(range: TimeRange): Promise<PriceCandle[]> {
  const { ms, interval } = RANGE_CONFIG[range];
  const now = Date.now();
  const start = now - ms;
  const stepMs = intervalToMs[interval];
  const out: PriceCandle[] = [];
  let cursor = start;

  for (let i = 0; i < 6 && cursor < now; i += 1) {
    const query = new URLSearchParams({
      symbol: "ETHUSDT",
      interval,
      startTime: String(cursor),
      endTime: String(now),
      limit: "1000",
    });
    const resp = await fetch(`https://api.binance.com/api/v3/klines?${query.toString()}`);
    if (!resp.ok) {
      throw new Error(`price fetch failed: ${resp.status}`);
    }
    const rows = (await resp.json()) as Array<[number, string, string, string, string]>;
    if (rows.length === 0) {
      break;
    }
    out.push(...rows.map((row) => ({ ts: row[0], close: Number(row[4]) })));
    cursor = (rows.at(-1)?.[0] ?? now) + stepMs;
  }

  const deduped = new Map<number, PriceCandle>();
  out.forEach((candle) => deduped.set(candle.ts, candle));
  return [...deduped.values()].sort((a, b) => a.ts - b.ts);
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setSize({
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      });
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

function PriceImpactD3Chart({
  candles,
  whaleMarkers,
  inflowSpikes,
  outflowSpikes,
  width,
  height,
}: {
  candles: PriceCandle[];
  whaleMarkers: Array<{ ts: number; value: number }>;
  inflowSpikes: number[];
  outflowSpikes: number[];
  width: number;
  height: number;
}) {
  const [hover, setHover] = useState<PriceCandle | null>(null);
  const W = Math.max(320, width || FALLBACK_W);
  const H = Math.max(220, height || FALLBACK_PRICE_H);

  const minTs = candles[0]?.ts ?? Date.now() - 1;
  const maxTs = candles.at(-1)?.ts ?? Date.now();
  const minClose = d3.min(candles, (d) => d.close) ?? 0;
  const maxClose = d3.max(candles, (d) => d.close) ?? 1;
  const yPad = (maxClose - minClose) * 0.08 || 1;

  const xScale = useMemo(
    () =>
      d3
        .scaleTime<number, number>()
        .domain([new Date(minTs), new Date(maxTs)])
        .range([PAD_LEFT, W - PAD_RIGHT]),
    [minTs, maxTs, W],
  );
  const yScale = useMemo(
    () =>
      d3
        .scaleLinear()
        .domain([minClose - yPad, maxClose + yPad])
        .range([H - PAD_BOTTOM, PAD_TOP]),
    [maxClose, minClose, yPad, H],
  );

  const linePath = useMemo(
    () =>
      d3
        .line<PriceCandle>()
        .x((d) => xScale(new Date(d.ts)))
        .y((d) => yScale(d.close))
        .curve(d3.curveMonotoneX)(candles) ?? "",
    [candles, xScale, yScale],
  );

  const xTicks = xScale.ticks(6);
  const yTicks = yScale.ticks(5);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-full"
      onMouseMove={(event) => {
        const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
        const px = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * W;
        const ts = +xScale.invert(px);
        if (candles.length === 0) {
          setHover(null);
          return;
        }
        const idx = d3.bisector((d: PriceCandle) => d.ts).center(candles, ts);
        setHover(candles[Math.max(0, Math.min(idx, candles.length - 1))] ?? null);
      }}
      onMouseLeave={() => setHover(null)}
    >
      {xTicks.map((t, i) => (
        <g key={`x-${i}`}>
          <line
            x1={xScale(t)}
            y1={PAD_TOP}
            x2={xScale(t)}
            y2={H - PAD_BOTTOM}
            stroke="#334155"
            opacity="0.18"
          />
          <text x={xScale(t)} y={H - 6} textAnchor="middle" fontSize="10" fill="#64748B">
            {formatShortTime(+t)}
          </text>
        </g>
      ))}
      {yTicks.map((t, i) => (
        <g key={`y-${i}`}>
          <line
            x1={PAD_LEFT}
            y1={yScale(t)}
            x2={W - PAD_RIGHT}
            y2={yScale(t)}
            stroke="#334155"
            opacity="0.16"
          />
          <text x={4} y={yScale(t) + 3} fontSize="10" fill="#64748B">
            ${Math.round(t)}
          </text>
        </g>
      ))}

      <path d={linePath} fill="none" stroke="#5B8CFF" strokeWidth="2.2" />

      {whaleMarkers.map((m, i) => (
        <circle
          key={`w-${i}`}
          cx={xScale(new Date(m.ts))}
          cy={yScale(nearestClose(candles, m.ts))}
          r={Math.min(8, 2 + m.value * 0.01)}
          fill="#38BDF8"
          fillOpacity="0.55"
          stroke="#0EA5E9"
          strokeOpacity="0.7"
        />
      ))}
      {inflowSpikes.map((ts, i) => (
        <circle
          key={`in-${i}`}
          cx={xScale(new Date(ts))}
          cy={yScale(nearestClose(candles, ts))}
          r={5.5}
          fill="#22C55E"
        />
      ))}
      {outflowSpikes.map((ts, i) => (
        <circle
          key={`out-${i}`}
          cx={xScale(new Date(ts))}
          cy={yScale(nearestClose(candles, ts))}
          r={5.5}
          fill="#EF4444"
        />
      ))}

      {hover ? (
        <>
          <line
            x1={xScale(new Date(hover.ts))}
            y1={PAD_TOP}
            x2={xScale(new Date(hover.ts))}
            y2={H - PAD_BOTTOM}
            stroke="#94A3B8"
            strokeDasharray="4 4"
            opacity="0.7"
          />
          <rect x={W - 188} y={10} width={176} height={44} rx={6} fill="#0F172A" opacity="0.85" />
          <text x={W - 178} y={28} fill="#E2E8F0" fontSize="11">
            {new Date(hover.ts).toLocaleString()}
          </text>
          <text x={W - 178} y={44} fill="#93C5FD" fontSize="11">
            ETH ${hover.close.toFixed(2)}
          </text>
        </>
      ) : null}
    </svg>
  );
}

function NetFlowD3Chart({
  points,
  width,
  height,
}: {
  points: BucketPoint[];
  width: number;
  height: number;
}) {
  const [hover, setHover] = useState<BucketPoint | null>(null);
  const W = Math.max(320, width || FALLBACK_W);
  const H = Math.max(200, height || FALLBACK_SERIES_H);

  const minTs = points[0]?.ts ?? Date.now() - 1;
  const maxTs = points.at(-1)?.ts ?? Date.now();
  const maxAbs = Math.max(
    1,
    d3.max(points, (p) => Math.max(p.inflow, p.outflow, Math.abs(p.netFlow))) ?? 1,
  );
  const barW = Math.max(2, ((W - PAD_LEFT - PAD_RIGHT) / Math.max(points.length, 1)) * 0.68);

  const xScale = useMemo(
    () =>
      d3
        .scaleTime<number, number>()
        .domain([new Date(minTs), new Date(maxTs)])
        .range([PAD_LEFT, W - PAD_RIGHT]),
    [minTs, maxTs, W],
  );
  const yScale = useMemo(
    () =>
      d3
        .scaleLinear()
        .domain([-maxAbs, maxAbs])
        .range([H - PAD_BOTTOM, PAD_TOP]),
    [maxAbs, H],
  );

  const xTicks = xScale.ticks(6);
  const yTicks = yScale.ticks(5);
  const netPath = useMemo(
    () =>
      d3
        .line<BucketPoint>()
        .x((d) => xScale(new Date(d.ts)))
        .y((d) => yScale(d.netFlow))
        .curve(d3.curveMonotoneX)(points) ?? "",
    [points, xScale, yScale],
  );

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-full"
      onMouseMove={(event) => {
        const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
        const px = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * W;
        const ts = +xScale.invert(px);
        const idx = d3.bisector((d: BucketPoint) => d.ts).center(points, ts);
        setHover(points[Math.max(0, Math.min(idx, points.length - 1))] ?? null);
      }}
      onMouseLeave={() => setHover(null)}
    >
      {xTicks.map((t, i) => (
        <g key={`x-${i}`}>
          <line
            x1={xScale(t)}
            y1={PAD_TOP}
            x2={xScale(t)}
            y2={H - PAD_BOTTOM}
            stroke="#334155"
            opacity="0.16"
          />
          <text x={xScale(t)} y={H - 6} textAnchor="middle" fontSize="10" fill="#64748B">
            {formatShortTime(+t)}
          </text>
        </g>
      ))}
      {yTicks.map((t, i) => (
        <g key={`y-${i}`}>
          <line
            x1={PAD_LEFT}
            y1={yScale(t)}
            x2={W - PAD_RIGHT}
            y2={yScale(t)}
            stroke="#334155"
            opacity="0.16"
          />
          <text x={4} y={yScale(t) + 3} fontSize="10" fill="#64748B">
            {Math.round(t)}
          </text>
        </g>
      ))}
      <line
        x1={PAD_LEFT}
        x2={W - PAD_RIGHT}
        y1={yScale(0)}
        y2={yScale(0)}
        stroke="#94A3B8"
        opacity="0.4"
      />

      {points.map((p, i) => (
        <g key={`bar-${i}`}>
          <rect
            x={xScale(new Date(p.ts)) - barW / 2}
            y={yScale(p.inflow)}
            width={barW}
            height={Math.max(1, yScale(0) - yScale(p.inflow))}
            fill="#16A34A"
            opacity="0.75"
          />
          <rect
            x={xScale(new Date(p.ts)) - barW / 2}
            y={yScale(0)}
            width={barW}
            height={Math.max(1, yScale(-p.outflow) - yScale(0))}
            fill="#DC2626"
            opacity="0.75"
          />
        </g>
      ))}

      <path d={netPath} fill="none" stroke="#5B8CFF" strokeWidth="2" />

      {hover ? (
        <>
          <line
            x1={xScale(new Date(hover.ts))}
            y1={PAD_TOP}
            x2={xScale(new Date(hover.ts))}
            y2={H - PAD_BOTTOM}
            stroke="#94A3B8"
            strokeDasharray="4 4"
            opacity="0.7"
          />
          <rect x={W - 194} y={10} width={182} height={58} rx={6} fill="#0F172A" opacity="0.85" />
          <text x={W - 184} y={28} fill="#E2E8F0" fontSize="11">
            {new Date(hover.ts).toLocaleString()}
          </text>
          <text x={W - 184} y={44} fill="#22C55E" fontSize="11">
            In {formatValue(hover.inflow)}
          </text>
          <text x={W - 118} y={44} fill="#EF4444" fontSize="11">
            Out {formatValue(hover.outflow)}
          </text>
          <text x={W - 184} y={60} fill="#93C5FD" fontSize="11">
            Net {formatValue(hover.netFlow)}
          </text>
        </>
      ) : null}
    </svg>
  );
}

function WhaleD3Chart({
  points,
  width,
  height,
}: {
  points: BucketPoint[];
  width: number;
  height: number;
}) {
  const [hover, setHover] = useState<BucketPoint | null>(null);
  const W = Math.max(320, width || FALLBACK_W);
  const H = Math.max(200, height || FALLBACK_SERIES_H);

  const minTs = points[0]?.ts ?? Date.now() - 1;
  const maxTs = points.at(-1)?.ts ?? Date.now();
  const maxVol = d3.max(points, (p) => p.whaleVolume) ?? 1;
  const maxCount = d3.max(points, (p) => p.whaleTxCount) ?? 1;
  const barW = Math.max(2, ((W - PAD_LEFT - PAD_RIGHT) / Math.max(points.length, 1)) * 0.68);

  const xScale = useMemo(
    () =>
      d3
        .scaleTime<number, number>()
        .domain([new Date(minTs), new Date(maxTs)])
        .range([PAD_LEFT, W - PAD_RIGHT]),
    [minTs, maxTs, W],
  );
  const yVol = useMemo(
    () =>
      d3
        .scaleLinear()
        .domain([0, maxVol])
        .nice()
        .range([H - PAD_BOTTOM, PAD_TOP]),
    [maxVol, H],
  );
  const yCount = useMemo(
    () =>
      d3
        .scaleLinear()
        .domain([0, maxCount])
        .nice()
        .range([H - PAD_BOTTOM, PAD_TOP]),
    [maxCount, H],
  );
  const xTicks = xScale.ticks(6);
  const yTicks = yVol.ticks(5);

  const countPath = useMemo(
    () =>
      d3
        .line<BucketPoint>()
        .x((d) => xScale(new Date(d.ts)))
        .y((d) => yCount(d.whaleTxCount))
        .curve(d3.curveMonotoneX)(points) ?? "",
    [points, xScale, yCount],
  );

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-full"
      onMouseMove={(event) => {
        const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
        const px = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * W;
        const ts = +xScale.invert(px);
        const idx = d3.bisector((d: BucketPoint) => d.ts).center(points, ts);
        setHover(points[Math.max(0, Math.min(idx, points.length - 1))] ?? null);
      }}
      onMouseLeave={() => setHover(null)}
    >
      {xTicks.map((t, i) => (
        <g key={`x-${i}`}>
          <line
            x1={xScale(t)}
            y1={PAD_TOP}
            x2={xScale(t)}
            y2={H - PAD_BOTTOM}
            stroke="#334155"
            opacity="0.16"
          />
          <text x={xScale(t)} y={H - 6} textAnchor="middle" fontSize="10" fill="#64748B">
            {formatShortTime(+t)}
          </text>
        </g>
      ))}
      {yTicks.map((t, i) => (
        <g key={`y-${i}`}>
          <line
            x1={PAD_LEFT}
            y1={yVol(t)}
            x2={W - PAD_RIGHT}
            y2={yVol(t)}
            stroke="#334155"
            opacity="0.16"
          />
          <text x={4} y={yVol(t) + 3} fontSize="10" fill="#64748B">
            {Math.round(t)}
          </text>
        </g>
      ))}

      {points.map((p, i) => (
        <rect
          key={`bar-${i}`}
          x={xScale(new Date(p.ts)) - barW / 2}
          y={yVol(p.whaleVolume)}
          width={barW}
          height={Math.max(1, yVol(0) - yVol(p.whaleVolume))}
          fill="#60A5FA"
          opacity="0.8"
        />
      ))}
      <path d={countPath} fill="none" stroke="#F59E0B" strokeWidth="2" />

      {hover ? (
        <>
          <line
            x1={xScale(new Date(hover.ts))}
            y1={PAD_TOP}
            x2={xScale(new Date(hover.ts))}
            y2={H - PAD_BOTTOM}
            stroke="#94A3B8"
            strokeDasharray="4 4"
            opacity="0.7"
          />
          <rect x={W - 198} y={10} width={186} height={56} rx={6} fill="#0F172A" opacity="0.85" />
          <text x={W - 188} y={28} fill="#E2E8F0" fontSize="11">
            {new Date(hover.ts).toLocaleString()}
          </text>
          <text x={W - 188} y={44} fill="#93C5FD" fontSize="11">
            Volume {formatValue(hover.whaleVolume)}
          </text>
          <text x={W - 188} y={60} fill="#FCD34D" fontSize="11">
            Count {hover.whaleTxCount}
          </text>
        </>
      ) : null}
    </svg>
  );
}

export function ImpactPage({ transactions }: ImpactPageProps) {
  const [priceRef, priceSize] = useElementSize<HTMLDivElement>();
  const [flowRef, flowSize] = useElementSize<HTMLDivElement>();
  const [whaleRef, whaleSize] = useElementSize<HTMLDivElement>();

  const [range, setRange] = useState<TimeRange>("24h");
  const [candles, setCandles] = useState<PriceCandle[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    fetchPriceCandles(range)
      .then((next) => {
        if (active) setCandles(next);
      })
      .catch(() => {
        if (active) {
          setCandles([]);
          setLoadError("Price feed unavailable");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [range]);

  const windowStart = Date.now() - RANGE_CONFIG[range].ms;

  const bucketed = useMemo<BucketPoint[]>(() => {
    const now = Date.now();
    const startBucketTs = Math.floor(windowStart / BUCKET_MS) * BUCKET_MS;
    const endBucketTs = Math.floor(now / BUCKET_MS) * BUCKET_MS;
    const byBucket = new Map<number, BucketPoint>();

    for (let ts = startBucketTs; ts <= endBucketTs; ts += BUCKET_MS) {
      byBucket.set(ts, {
        ts,
        inflow: 0,
        outflow: 0,
        netFlow: 0,
        whaleVolume: 0,
        whaleTxCount: 0,
        close: nearestClose(candles, ts),
        ret: 0,
      });
    }

    const visibleTx = transactions.filter(
      (tx) => tx.channel === "wallet" && tx.timestampMs >= windowStart,
    );
    const amounts = visibleTx
      .map((tx) => parseAmount(tx.amount))
      .filter((v) => v > 0)
      .sort((a, b) => a - b);
    const p80 = amounts[Math.floor(amounts.length * 0.8)] ?? WHALE_THRESHOLD;
    const dynamicWhaleThreshold = Math.max(15, Math.min(WHALE_THRESHOLD, p80));

    for (const tx of visibleTx) {
      const bucketTs = Math.floor(tx.timestampMs / BUCKET_MS) * BUCKET_MS;
      const current = byBucket.get(bucketTs);
      if (!current) continue;

      const amount = parseAmount(tx.amount);
      const toExchange = isExchangeLike(tx.to);
      const fromExchange = isExchangeLike(tx.from);

      if (toExchange && !fromExchange) {
        current.inflow += amount;
      } else if (fromExchange && !toExchange) {
        current.outflow += amount;
      } else if (tx.type === "inflow") {
        current.inflow += amount;
      } else {
        current.outflow += amount;
      }

      if (amount >= dynamicWhaleThreshold) {
        current.whaleVolume += amount;
        current.whaleTxCount += 1;
      }
      current.netFlow = current.inflow - current.outflow;
    }

    const points = [...byBucket.values()].sort((a, b) => a.ts - b.ts);
    for (let i = 1; i < points.length; i += 1) {
      const prevClose = points[i - 1]?.close ?? 0;
      const currClose = points[i]?.close ?? 0;
      points[i]!.ret = prevClose > 0 ? (currClose - prevClose) / prevClose : 0;
    }
    return points;
  }, [candles, transactions, windowStart]);

  const metrics = useMemo(() => {
    const now = Date.now();
    const lastHour = bucketed.filter((b) => b.ts >= now - 60 * 60 * 1000);
    const prevHour = bucketed.filter(
      (b) => b.ts >= now - 2 * 60 * 60 * 1000 && b.ts < now - 60 * 60 * 1000,
    );
    const last24h = bucketed.filter((b) => b.ts >= now - 24 * 60 * 60 * 1000);
    const prev24h = bucketed.filter(
      (b) => b.ts >= now - 48 * 60 * 60 * 1000 && b.ts < now - 24 * 60 * 60 * 1000,
    );
    const returns24h = last24h.map((b) => b.ret);
    const prevReturns24h = prev24h.map((b) => b.ret);
    const rollingVol = stdDev(returns24h.slice(-12)) * 100;
    const prevRollingVol = stdDev(prevReturns24h.slice(-12)) * 100;
    const corr = correlation(
      last24h.map((b) => b.netFlow),
      returns24h,
    );
    const prevCorr = correlation(
      prev24h.map((b) => b.netFlow),
      prevReturns24h,
    );

    const netExchangeFlow1h = lastHour.reduce((sum, b) => sum + b.netFlow, 0);
    const prevNetExchangeFlow1h = prevHour.reduce((sum, b) => sum + b.netFlow, 0);
    const whaleVolume1h = lastHour.reduce((sum, b) => sum + b.whaleVolume, 0);
    const prevWhaleVolume1h = prevHour.reduce((sum, b) => sum + b.whaleVolume, 0);

    return {
      netExchangeFlow1h,
      netExchangeFlow1hPct: toPctChange(netExchangeFlow1h, prevNetExchangeFlow1h),
      whaleVolume1h,
      whaleVolume1hPct: toPctChange(whaleVolume1h, prevWhaleVolume1h),
      rollingVol,
      rollingVolPct: toPctChange(rollingVol, prevRollingVol),
      corr,
      corrPct: toPctChange(corr ?? 0, prevCorr ?? 0),
    };
  }, [bucketed]);

  const netFlowMove = movementStyle(metrics.netExchangeFlow1hPct);
  const whaleVolMove = movementStyle(metrics.whaleVolume1hPct);
  const volMove = movementStyle(metrics.rollingVolPct);
  const corrMove = movementStyle(metrics.corrPct);

  const whaleMarkers = useMemo(
    () =>
      transactions
        .filter(
          (tx) =>
            tx.channel === "wallet" &&
            tx.timestampMs >= windowStart &&
            parseAmount(tx.amount) >= MIN_VISIBLE_WHALE_MARKER,
        )
        .slice(0, 180)
        .map((tx) => ({ ts: tx.timestampMs, value: parseAmount(tx.amount) })),
    [transactions, windowStart],
  );

  const spikeData = useMemo(() => {
    const inflowSeries = bucketed.map((b) => b.inflow);
    const outflowSeries = bucketed.map((b) => b.outflow);
    const inflowThreshold =
      inflowSeries.reduce((sum, v) => sum + v, 0) / Math.max(inflowSeries.length, 1) +
      stdDev(inflowSeries);
    const outflowThreshold =
      outflowSeries.reduce((sum, v) => sum + v, 0) / Math.max(outflowSeries.length, 1) +
      stdDev(outflowSeries);
    return {
      inflow: bucketed.filter((b) => b.inflow > inflowThreshold).map((b) => b.ts),
      outflow: bucketed.filter((b) => b.outflow > outflowThreshold).map((b) => b.ts),
    };
  }, [bucketed]);

  return (
    <div className="mt-16 px-3 pb-3 pt-3 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <Card className="bg-card/60 border-border/60 h-[150px]">
          <CardHeader className="px-4 pt-3 pb-1">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-[0.12em] text-center">
              Net Exchange Flow (1H)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 w-full px-3 pb-3 flex flex-col items-center justify-center text-center gap-2">
            <p
              className={`text-4xl font-semibold leading-none ${metrics.netExchangeFlow1h >= 0 ? "text-success" : "text-destructive"}`}
            >
              {metrics.netExchangeFlow1h >= 0 ? "+" : "-"}
              {formatValue(Math.abs(metrics.netExchangeFlow1h))}
            </p>
            <p
              className={`text-xs font-medium inline-flex items-center gap-1 ${netFlowMove.className}`}
            >
              <span>{netFlowMove.symbol}</span>
              <span>{netFlowMove.text}</span>
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/60 border-border/60 h-[150px]">
          <CardHeader className="px-4 pt-3 pb-1">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-[0.12em] text-center">
              Whale Volume (1H)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 w-full px-3 pb-3 flex flex-col items-center justify-center text-center gap-2">
            <p className="text-4xl font-semibold leading-none">
              {formatValue(metrics.whaleVolume1h)}
            </p>
            <p
              className={`text-xs font-medium inline-flex items-center gap-1 ${whaleVolMove.className}`}
            >
              <span>{whaleVolMove.symbol}</span>
              <span>{whaleVolMove.text}</span>
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/60 border-border/60 h-[150px]">
          <CardHeader className="px-4 pt-3 pb-1">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-[0.12em] text-center">
              Rolling Volatility
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 w-full px-3 pb-3 flex flex-col items-center justify-center text-center gap-2">
            <p className="text-4xl font-semibold leading-none">{metrics.rollingVol.toFixed(2)}%</p>
            <p
              className={`text-xs font-medium inline-flex items-center gap-1 ${volMove.className}`}
            >
              <span>{volMove.symbol}</span>
              <span>{volMove.text}</span>
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/60 border-border/60 h-[150px]">
          <CardHeader className="px-4 pt-3 pb-1">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-[0.12em] text-center">
              Corr: Net Flow vs Returns (24H)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 w-full px-3 pb-3 flex flex-col items-center justify-center text-center gap-2">
            <p className="text-4xl font-semibold leading-none">
              {metrics.corr === null ? "n/a" : metrics.corr.toFixed(3)}
            </p>
            <p
              className={`text-xs font-medium inline-flex items-center gap-1 ${corrMove.className}`}
            >
              <span>{corrMove.symbol}</span>
              <span>{corrMove.text}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/60 border-border/60 h-[430px]">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle>ETH Price + Flow Impact</CardTitle>
          <div className="flex items-center gap-1">
            {(Object.keys(RANGE_CONFIG) as TimeRange[]).map((key) => (
              <Button
                key={key}
                size="sm"
                variant={range === key ? "secondary" : "ghost"}
                onClick={() => setRange(key)}
                className="h-7 px-2.5 text-xs"
              >
                {RANGE_CONFIG[key].label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 p-0">
          <div ref={priceRef} className="h-full px-4 pb-4">
            <PriceImpactD3Chart
              candles={candles}
              whaleMarkers={whaleMarkers}
              inflowSpikes={spikeData.inflow}
              outflowSpikes={spikeData.outflow}
              width={priceSize.width}
              height={priceSize.height}
            />
          </div>
          {(loading || loadError) && (
            <p className="mt-1 px-4 text-xs text-muted-foreground">
              {loading ? "Loading ETH candles..." : loadError}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <Card className="xl:col-span-2 bg-card/60 border-border/60 h-[340px]">
          <CardHeader className="pb-3">
            <CardTitle>Net Exchange Flow (5m Buckets)</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 p-0">
            <div ref={flowRef} className="h-full px-4 pb-4">
              <NetFlowD3Chart points={bucketed} width={flowSize.width} height={flowSize.height} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/60 border-border/60 h-[340px]">
          <CardHeader className="pb-3">
            <CardTitle>Whale Activity</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 p-0">
            <div ref={whaleRef} className="h-full px-4 pb-4">
              <WhaleD3Chart points={bucketed} width={whaleSize.width} height={whaleSize.height} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
