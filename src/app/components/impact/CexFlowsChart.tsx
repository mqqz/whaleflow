import { useMemo, useState } from "react";
import * as d3 from "d3";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { ImpactCexSeries } from "../../hooks/useImpactModel";
import {
  FALLBACK_H,
  FALLBACK_W,
  PAD_BOTTOM,
  PAD_LEFT,
  PAD_RIGHT,
  PAD_TOP,
  formatCompact,
  formatShortTime,
  useElementSize,
} from "./chartUtils";

interface CexFlowsChartProps {
  series: ImpactCexSeries[];
}

const tierMeta: Record<string, { color: string; threshold: string }> = {
  whale: { color: "#F43F5E", threshold: ">= 10000 ETH" },
  shark: { color: "#F59E0B", threshold: "< 10000 ETH" },
  dolphin: { color: "#10B981", threshold: "< 1000 ETH" },
  shrimp: { color: "#3B82F6", threshold: "< 100 ETH" },
};

const tierKey = (label: string) => label.trim().toLowerCase();
const tierColor = (label: string) => tierMeta[tierKey(label)]?.color ?? "#A78BFA";
const tierThreshold = (label: string) => tierMeta[tierKey(label)]?.threshold ?? "";

export function CexFlowsChart({ series }: CexFlowsChartProps) {
  const [wrapRef, wrapSize] = useElementSize<HTMLDivElement>();
  const [hoverTs, setHoverTs] = useState<number | null>(null);
  const rankedSeries = useMemo(
    () =>
      [...series].sort((a, b) => {
        const aKey = tierKey(a.cex);
        const bKey = tierKey(b.cex);
        if ((aKey === "shark" && bKey === "whale") || (aKey === "whale" && bKey === "shark")) {
          return aKey === "shark" ? -1 : 1;
        }
        return (
          b.points.reduce((sum, point) => sum + Math.abs(point.net), 0) -
          a.points.reduce((sum, point) => sum + Math.abs(point.net), 0)
        );
      }),
    [series],
  );

  const flat = rankedSeries.flatMap((entry) => entry.points);
  const W = Math.max(320, wrapSize.width || FALLBACK_W);
  const H = Math.max(220, wrapSize.height || FALLBACK_H);
  const minTs = d3.min(flat, (point) => point.ts) ?? Date.now() - 1;
  const maxTs = d3.max(flat, (point) => point.ts) ?? Date.now();
  const maxAbs = Math.max(1, d3.max(flat, (point) => Math.abs(point.net)) ?? 1);

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
        .domain([-maxAbs, maxAbs])
        .range([H - PAD_BOTTOM, PAD_TOP]),
    [H, maxAbs],
  );

  const xTicks = x.ticks(5);

  return (
    <Card className="bg-card/60 border-border/60 h-[380px] rounded-xl flex flex-col overflow-hidden">
      <CardHeader className="flex-row items-center justify-between space-y-0 !pt-4 !pb-2 border-b border-border/50 gap-3">
        <CardTitle className="truncate leading-tight">Net Flow by Tier</CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 min-h-0">
        <div className="h-full px-4 pb-4 flex flex-col min-h-0">
          <div
            className="pb-1 px-2 grid items-center gap-x-8 text-[11px] text-muted-foreground shrink-0"
            style={{
              gridTemplateColumns: `repeat(${Math.max(1, rankedSeries.length)}, minmax(0, 1fr))`,
            }}
          >
            {rankedSeries.map((entry) => (
              <div
                key={entry.cex}
                className="inline-flex flex-col items-center justify-center gap-0.5 min-w-0"
              >
                <span className="inline-flex items-center gap-2 min-w-0">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: tierColor(entry.cex) }}
                  />
                  <span className="truncate">{entry.cex}</span>
                </span>
                <span className="text-[10px] text-muted-foreground/90">
                  {tierThreshold(entry.cex)}
                </span>
              </div>
            ))}
          </div>

          <div ref={wrapRef} className="flex-1 min-h-0 h-full">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-full"
              onMouseMove={(event) => {
                const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
                const px = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * W;
                const ts = +x.invert(px);
                setHoverTs(ts);
              }}
              onMouseLeave={() => setHoverTs(null)}
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
                    {formatShortTime(+tick)}
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

              {rankedSeries.map((entry) => {
                const path =
                  d3
                    .line<(typeof entry.points)[number]>()
                    .x((point) => x(new Date(point.ts)))
                    .y((point) => y(point.net))
                    .curve(d3.curveMonotoneX)(entry.points) ?? "";
                return (
                  <path
                    key={entry.cex}
                    d={path}
                    fill="none"
                    stroke={tierColor(entry.cex)}
                    strokeWidth="2"
                    opacity="0.95"
                  />
                );
              })}

              {hoverTs ? (
                <line
                  x1={x(new Date(hoverTs))}
                  y1={PAD_TOP}
                  x2={x(new Date(hoverTs))}
                  y2={H - PAD_BOTTOM}
                  stroke="#94A3B8"
                  strokeDasharray="4 4"
                  opacity="0.65"
                />
              ) : null}
            </svg>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
