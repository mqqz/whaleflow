import { FlowPoint } from "../services/analyticsData";
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
  top24hAvailable: boolean;
  onFeedModeChange: (mode: MonitorFeedMode) => void;
  chartMode: "line" | "network";
  onChartModeChange: (mode: "line" | "network") => void;
}

const formatShortHour = (ts: number) =>
  new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
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
  top24hAvailable,
  onFeedModeChange,
  chartMode,
  onChartModeChange,
}: MonitorFlowChartProps) {
  const chartData = points.map((point) => ({
    ts: point.ts,
    label: formatShortHour(point.ts),
    inflow: point.inflow,
    outflow: point.outflow,
    net: point.net,
  }));

  return (
    <div className="h-full flex flex-col bg-card/60 backdrop-blur-sm border border-border/60 rounded-xl p-4">
      <div className="flex items-center justify-between pb-3 border-b border-border/50">
        <div>
          <h3 className="font-semibold text-base">Exchange Liquidity Pressure</h3>
          <p className="text-xs text-muted-foreground">
            {feedMode === "live"
              ? "5m live buckets from current stream session"
              : `As of ${asOfLabel}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-md border border-border/60 bg-background/25 overflow-hidden">
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
          </div>
          <div className="inline-flex items-center rounded-md border border-border/60 bg-background/25 overflow-hidden">
            <button
              type="button"
              onClick={() => onFeedModeChange("live")}
              className={`h-8 px-3 text-xs uppercase transition-colors ${
                feedMode === "live"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Live
            </button>
            <button
              type="button"
              onClick={() => onFeedModeChange("top24h")}
              disabled={!top24hAvailable}
              className={`h-8 px-3 text-xs uppercase transition-colors disabled:opacity-40 ${
                feedMode === "top24h"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              24H
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
            {feedMode === "live"
              ? "Waiting for exchange-relative live transactions..."
              : "Exchange flow dataset is unavailable for this token."}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.25} />
              <XAxis dataKey="label" minTickGap={28} tick={{ fill: "#94A3B8", fontSize: 11 }} />
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
                formatter={(value: number, name) => [formatCompact(value), name]}
              />
              <Area
                type="monotone"
                dataKey="inflow"
                stroke="#22C55E"
                fill="#22C55E"
                fillOpacity={0.12}
              />
              <Area
                type="monotone"
                dataKey="outflow"
                stroke="#F97316"
                fill="#F97316"
                fillOpacity={0.12}
              />
              <Line type="monotone" dataKey="net" stroke="#60A5FA" strokeWidth={2.2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
