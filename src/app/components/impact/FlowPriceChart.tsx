import { useMemo, useState } from "react";
import * as d3 from "d3";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { ImpactFlowPricePoint } from "../../hooks/useImpactModel";
import { InfoHover } from "../InfoHover";
import {
  FALLBACK_H,
  FALLBACK_W,
  PAD_BOTTOM,
  PAD_LEFT,
  PAD_RIGHT,
  PAD_TOP,
  formatAxisTick,
  formatCompact,
  useElementSize,
} from "./chartUtils";

interface FlowPriceChartProps {
  points: ImpactFlowPricePoint[];
  lagHours: 0 | 1 | 3;
  onLagHoursChange: (value: 0 | 1 | 3) => void;
  priceSource: string;
  loading: boolean;
  error: string | null;
}

export function FlowPriceChart({
  points,
  lagHours,
  onLagHoursChange,
  priceSource,
  loading,
  error,
}: FlowPriceChartProps) {
  const [wrapRef, wrapSize] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<ImpactFlowPricePoint | null>(null);

  const W = Math.max(360, wrapSize.width || FALLBACK_W);
  const H = Math.max(260, wrapSize.height || FALLBACK_H);
  const minTs = points[0]?.ts ?? Date.now() - 1;
  const maxTs = points.at(-1)?.ts ?? Date.now();
  const maxAbsNet = Math.max(1, d3.max(points, (point) => Math.abs(point.shiftedNet)) ?? 1);
  const priceVals = points
    .map((point) => point.priceIndex)
    .filter((value): value is number => value !== null);
  const minPriceIdx = d3.min(priceVals) ?? 95;
  const maxPriceIdx = d3.max(priceVals) ?? 105;

  const x = useMemo(
    () =>
      d3
        .scaleTime<number, number>()
        .domain([new Date(minTs), new Date(maxTs)])
        .range([PAD_LEFT, W - PAD_RIGHT]),
    [W, minTs, maxTs],
  );
  const yNet = useMemo(
    () =>
      d3
        .scaleLinear()
        .domain([-maxAbsNet, maxAbsNet])
        .range([H - PAD_BOTTOM, PAD_TOP]),
    [H, maxAbsNet],
  );
  const yPrice = useMemo(
    () =>
      d3
        .scaleLinear()
        .domain([minPriceIdx * 0.995, maxPriceIdx * 1.005])
        .range([H - PAD_BOTTOM, PAD_TOP]),
    [H, maxPriceIdx, minPriceIdx],
  );

  const netPath = useMemo(
    () =>
      d3
        .line<ImpactFlowPricePoint>()
        .x((point) => x(new Date(point.ts)))
        .y((point) => yNet(point.shiftedNet))
        .curve(d3.curveMonotoneX)(points) ?? "",
    [points, x, yNet],
  );

  const pricePath = useMemo(
    () =>
      d3
        .line<ImpactFlowPricePoint>()
        .defined((point) => point.priceIndex !== null)
        .x((point) => x(new Date(point.ts)))
        .y((point) => yPrice(point.priceIndex ?? 100))
        .curve(d3.curveMonotoneX)(points) ?? "",
    [points, x, yPrice],
  );

  const xTicks = x.ticks(6);
  const netTicks = yNet.ticks(5);

  return (
    <Card className="bg-card/60 border-border/60 h-[430px] rounded-xl flex flex-col overflow-hidden">
      <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-start space-y-0 pb-3 border-b border-border/50 gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <CardTitle className="truncate">ETH Price + Exchange Flow Impact</CardTitle>
            <InfoHover
              title="ETH Price + Exchange Flow Impact"
              summary="Compares exchange net flow and ETH price index over the same timeline."
              interpretation="If flow and price move together consistently, flow may be a stronger directional signal; if they diverge, signal confidence is lower."
              significance="Helps non-technical stakeholders assess whether liquidity movement is currently translating into price behavior."
            />
          </div>
          <p className={`text-xs mt-1 ${error ? "text-destructive" : "text-muted-foreground"}`}>
            {error
              ? error
              : loading
                ? "Loading impact datasets..."
                : `Price source: ${priceSource}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 justify-self-end">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Lag</span>
          <div className="inline-flex items-center rounded-md border border-border/60 bg-background/25 overflow-hidden">
            {([0, 1, 3] as const).map((lag) => (
              <button
                key={lag}
                type="button"
                onClick={() => onLagHoursChange(lag)}
                className={`h-8 w-12 text-xs uppercase transition-colors ${
                  lag === lagHours
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {lag}H
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 min-h-0">
        <div ref={wrapRef} className="h-full px-4 pb-4">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-full"
            onMouseMove={(event) => {
              const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
              const px = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * W;
              const ts = +x.invert(px);
              if (points.length === 0) {
                setHover(null);
                return;
              }
              const idx = d3.bisector((point: ImpactFlowPricePoint) => point.ts).center(points, ts);
              setHover(points[Math.max(0, Math.min(idx, points.length - 1))] ?? null);
            }}
            onMouseLeave={() => setHover(null)}
          >
            {xTicks.map((tick, idx) => (
              <g key={`x-${idx}`}>
                <line
                  x1={x(tick)}
                  y1={PAD_TOP}
                  x2={x(tick)}
                  y2={H - PAD_BOTTOM}
                  stroke="#334155"
                  opacity="0.16"
                />
                <text x={x(tick)} y={H - 6} textAnchor="middle" fontSize="10" fill="#64748B">
                  {formatAxisTick(+tick, minTs, maxTs)}
                </text>
              </g>
            ))}
            {netTicks.map((tick, idx) => (
              <g key={`y-${idx}`}>
                <line
                  x1={PAD_LEFT}
                  y1={yNet(tick)}
                  x2={W - PAD_RIGHT}
                  y2={yNet(tick)}
                  stroke="#334155"
                  opacity="0.16"
                />
                <text x={4} y={yNet(tick) + 3} fontSize="10" fill="#64748B">
                  {formatCompact(tick)}
                </text>
              </g>
            ))}
            <line
              x1={PAD_LEFT}
              x2={W - PAD_RIGHT}
              y1={yNet(0)}
              y2={yNet(0)}
              stroke="#94A3B8"
              opacity="0.42"
            />

            <path d={netPath} fill="none" stroke="#10B981" strokeWidth="2.1" />
            <path d={pricePath} fill="none" stroke="#5B8CFF" strokeWidth="2.1" opacity="0.95" />

            <text x={W - 144} y={PAD_TOP + 12} fontSize="10" fill="#5B8CFF">
              Price Index (base=100)
            </text>
            <text x={W - 144} y={PAD_TOP + 26} fontSize="10" fill="#10B981">
              Net Flow {lagHours > 0 ? `(shifted ${lagHours}h)` : ""}
            </text>

            {hover ? (
              <>
                <line
                  x1={x(new Date(hover.ts))}
                  y1={PAD_TOP}
                  x2={x(new Date(hover.ts))}
                  y2={H - PAD_BOTTOM}
                  stroke="#94A3B8"
                  strokeDasharray="4 4"
                  opacity="0.7"
                />
                <rect
                  x={W - 232}
                  y={10}
                  width={220}
                  height={64}
                  rx={6}
                  fill="#0F172A"
                  opacity="0.85"
                />
                <text x={W - 220} y={28} fill="#E2E8F0" fontSize="11">
                  {new Date(hover.ts).toLocaleString()}
                </text>
                <text x={W - 220} y={45} fill="#10B981" fontSize="11">
                  Net {formatCompact(hover.shiftedNet)} ETH
                </text>
                <text x={W - 220} y={62} fill="#93C5FD" fontSize="11">
                  Price Idx {hover.priceIndex === null ? "n/a" : hover.priceIndex.toFixed(2)}
                </text>
              </>
            ) : null}
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}
