import type { FlowPoint } from "../services/analyticsData";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
} from "recharts";
import { MonitorFeedMode } from "../hooks/useMonitorModel";

interface MonitorFlowChartProps {
  points: FlowPoint[];
  loading: boolean;
  error: string | null;
  asOfLabel: string;
  feedMode: MonitorFeedMode;
  chartMode: "line" | "network";
  onChartModeChange: (mode: "line" | "network") => void;
}

const LIVE_ROLLING_WINDOW_MS = 5 * 60 * 1000;

const formatShortHour = (ts: number, includeSeconds = false) =>
  new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: includeSeconds ? "2-digit" : undefined,
  });

const formatCompact = (value: number) => {
  if (!Number.isFinite(value)) {
    return "0";
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toFixed(1);
};

export function MonitorFlowChart({
  points,
  loading,
  error,
  asOfLabel,
  feedMode,
  chartMode,
  onChartModeChange,
}: MonitorFlowChartProps) {
  let cumulativeNet = 0;
  let cumulativeInflow = 0;
  let cumulativeOutflow = 0;

  const baseData = points.map((point) => {
    cumulativeNet += point.net;
    cumulativeInflow += point.inflow;
    cumulativeOutflow += point.outflow;

    return {
      ts: point.ts,
      label: formatShortHour(point.ts, feedMode === "live"),
      inflow: point.inflow,
      outflow: point.outflow,
      net: point.net,
      cumulativeInflow,
      cumulativeOutflow,
      cumulativeNet,
    };
  });
  const isLiveMode = feedMode === "live";
  const latestTs = baseData[baseData.length - 1]?.ts ?? Date.now();
  const firstTs = baseData[0]?.ts ?? latestTs;
  const rollingStartTs = Math.max(latestTs - LIVE_ROLLING_WINDOW_MS, firstTs);
  const liveDomainStartTs = rollingStartTs;
  const liveDomainEndTs = rollingStartTs + LIVE_ROLLING_WINDOW_MS;

  const chartData = isLiveMode ? baseData.filter((point) => point.ts >= rollingStartTs) : baseData;

  return (
    <div className="h-full flex flex-col bg-card/60 backdrop-blur-sm border border-border/60 rounded-xl p-4">
      <div className="flex items-center justify-between pb-3 border-b border-border/50">
        <div>
          <h3 className="font-semibold text-base">Exchange Liquidity Pressure</h3>
          <p className="text-xs text-muted-foreground">
            {isLiveMode
              ? "Cumulative inflow/outflow/net (rolling 5m window)"
              : `As of ${asOfLabel}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-md border border-border/60 bg-background/25 overflow-hidden">
            <button
              type="button"
              onClick={() => onChartModeChange("network")}
              className={`h-8 px-3 text-xs uppercase transition-colors ${
                chartMode === "network"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Network
            </button>
            <button
              type="button"
              onClick={() => onChartModeChange("line")}
              className={`h-8 px-3 text-xs uppercase transition-colors ${
                chartMode === "line"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Line
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 flex-1 min-h-0">
        {loading ? (
          <div className="h-full grid place-items-center text-sm text-muted-foreground">
            Loading exchange flow timeline...
          </div>
        ) : error ? (
          <div className="h-full grid place-items-center text-sm text-destructive">{error}</div>
        ) : chartData.length === 0 ? (
          <div className="h-full grid place-items-center text-sm text-muted-foreground">
            {feedMode === "live" ? (
              <span className="inline-flex items-center gap-0.5">
                <span>Waiting for exchange-relative live transactions</span>
                <span className="inline-flex">
                  <span className="animate-pulse [animation-delay:0ms]">.</span>
                  <span className="animate-pulse [animation-delay:180ms]">.</span>
                  <span className="animate-pulse [animation-delay:360ms]">.</span>
                </span>
              </span>
            ) : (
              "Exchange flow dataset is unavailable for this token."
            )}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.25} />
              <XAxis
                type="number"
                dataKey="ts"
                scale="time"
                domain={isLiveMode ? [liveDomainStartTs, liveDomainEndTs] : ["dataMin", "dataMax"]}
                minTickGap={28}
                tick={{ fill: "#94A3B8", fontSize: 11 }}
                tickFormatter={(value: number) => formatShortHour(value, isLiveMode)}
              />
              <YAxis
                tickFormatter={(value) => formatCompact(Number(value))}
                tick={{ fill: "#94A3B8", fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  background: "#0F172A",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                }}
                labelStyle={{ color: "#CBD5E1" }}
                labelFormatter={(value) => formatShortHour(Number(value), isLiveMode)}
                formatter={(value: number, name) => {
                  if (name === "cumulativeInflow") {
                    return [formatCompact(value), "Cumulative Inflow"];
                  }
                  if (name === "cumulativeOutflow") {
                    return [formatCompact(value), "Cumulative Outflow"];
                  }
                  if (name === "cumulativeNet") {
                    return [formatCompact(value), "Cumulative Net"];
                  }
                  return [formatCompact(value), name];
                }}
              />
              {!isLiveMode ? (
                <Area
                  type="monotone"
                  dataKey="inflow"
                  stroke="#22C55E"
                  fill="#22C55E"
                  fillOpacity={0.12}
                />
              ) : null}
              {!isLiveMode ? (
                <Area
                  type="monotone"
                  dataKey="outflow"
                  stroke="#F97316"
                  fill="#F97316"
                  fillOpacity={0.12}
                />
              ) : null}
              {isLiveMode ? (
                <Line
                  type="monotone"
                  dataKey="cumulativeInflow"
                  name="cumulativeInflow"
                  stroke="#22C55E"
                  strokeWidth={1.8}
                  dot={false}
                  isAnimationActive
                  animationDuration={420}
                  animationEasing="ease-out"
                />
              ) : null}
              {isLiveMode ? (
                <Line
                  type="monotone"
                  dataKey="cumulativeOutflow"
                  name="cumulativeOutflow"
                  stroke="#F97316"
                  strokeWidth={1.8}
                  dot={false}
                  isAnimationActive
                  animationDuration={420}
                  animationEasing="ease-out"
                />
              ) : null}
              <Line
                type="monotone"
                dataKey={isLiveMode ? "cumulativeNet" : "net"}
                name={isLiveMode ? "cumulativeNet" : "net"}
                stroke="#60A5FA"
                strokeWidth={2.2}
                dot={false}
                isAnimationActive
                animationDuration={420}
                animationEasing="ease-out"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
