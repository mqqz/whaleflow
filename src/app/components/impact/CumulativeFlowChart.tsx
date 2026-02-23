import { useMemo, useState } from "react";
import * as d3 from "d3";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
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

interface CumulativeFlowChartProps {
  points: Array<{ ts: number; cumulative: number }>;
}

export function CumulativeFlowChart({ points }: CumulativeFlowChartProps) {
  const [wrapRef, wrapSize] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<(typeof points)[number] | null>(null);

  const W = Math.max(320, wrapSize.width || FALLBACK_W);
  const H = Math.max(220, wrapSize.height || FALLBACK_H);
  const minTs = points[0]?.ts ?? Date.now() - 1;
  const maxTs = points.at(-1)?.ts ?? Date.now();
  const values = points.map((point) => point.cumulative);
  const minValue = Math.min(0, d3.min(values) ?? 0);
  const maxValue = Math.max(0, d3.max(values) ?? 1);

  const x = useMemo(
    () =>
      d3
        .scaleTime<number, number>()
        .domain([new Date(minTs), new Date(maxTs)])
        .range([PAD_LEFT, W - PAD_RIGHT]),
    [W, minTs, maxTs],
  );
  const y = useMemo(
    () =>
      d3
        .scaleLinear()
        .domain([minValue * 1.05, maxValue * 1.05])
        .range([H - PAD_BOTTOM, PAD_TOP]),
    [H, maxValue, minValue],
  );

  const path =
    d3
      .line<(typeof points)[number]>()
      .x((point) => x(new Date(point.ts)))
      .y((point) => y(point.cumulative))
      .curve(d3.curveMonotoneX)(points) ?? "";

  return (
    <Card className="bg-card/60 border-border/60 h-[380px] rounded-xl flex flex-col overflow-hidden">
      <CardHeader className="flex-row items-center justify-between space-y-0 !pt-4 !pb-2 border-b border-border/50 gap-3">
        <CardTitle className="truncate leading-tight">Cumulative Net Flow (Running Sum)</CardTitle>
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
              const idx = d3
                .bisector((point: (typeof points)[number]) => point.ts)
                .center(points, ts);
              setHover(points[Math.max(0, Math.min(idx, points.length - 1))] ?? null);
            }}
            onMouseLeave={() => setHover(null)}
          >
            {x.ticks(5).map((tick, idx) => (
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

            {y.ticks(5).map((tick, idx) => (
              <g key={`y-${idx}`}>
                <line
                  x1={PAD_LEFT}
                  y1={y(tick)}
                  x2={W - PAD_RIGHT}
                  y2={y(tick)}
                  stroke="#334155"
                  opacity="0.16"
                />
                <text x={4} y={y(tick) + 3} fontSize="10" fill="#64748B">
                  {formatCompact(tick)}
                </text>
              </g>
            ))}

            <line
              x1={PAD_LEFT}
              x2={W - PAD_RIGHT}
              y1={y(0)}
              y2={y(0)}
              stroke="#94A3B8"
              opacity="0.42"
            />

            <path d={path} fill="none" stroke="#22C55E" strokeWidth="2.1" />

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
                  x={W - 220}
                  y={10}
                  width={208}
                  height={48}
                  rx={6}
                  fill="#0F172A"
                  opacity="0.85"
                />
                <text x={W - 208} y={28} fill="#E2E8F0" fontSize="11">
                  {new Date(hover.ts).toLocaleString()}
                </text>
                <text x={W - 208} y={44} fill="#86EFAC" fontSize="11">
                  Cumulative {formatCompact(hover.cumulative)} ETH
                </text>
              </>
            ) : null}
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}
