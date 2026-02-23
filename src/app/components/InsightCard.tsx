import { Lightbulb } from "lucide-react";

export interface InsightCardData {
  signal: string;
  narrative: string;
  hasStats: boolean;
  netFlow: string;
  deltaPct: string;
  symbol: "▲" | "▼" | "■";
  trend: "positive" | "negative" | "neutral";
  highlights?: Array<{
    label: string;
    value: string;
    trend: "positive" | "negative" | "neutral";
  }>;
}

interface InsightCardProps {
  insight: InsightCardData;
  statsLabel?: string;
  suppressStatsFallback?: boolean;
}

const trendClass = (trend: "positive" | "negative" | "neutral") => {
  if (trend === "positive") return "text-success";
  if (trend === "negative") return "text-destructive";
  return "text-muted-foreground";
};

export function InsightCard({
  insight,
  statsLabel = "Last 3h",
  suppressStatsFallback = false,
}: InsightCardProps) {
  const numberClass = trendClass(insight.trend);

  return (
    <div className="bg-card/60 backdrop-blur-sm border border-border/60 rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide">
        <Lightbulb className="h-3.5 w-3.5" />
        <span>Insight</span>
      </div>
      <p className="mt-1 text-sm font-semibold">{insight.signal}</p>
      <p className="mt-1 text-sm text-foreground/90">{insight.narrative}</p>
      {insight.highlights && insight.highlights.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {insight.highlights.map((item) => (
            <span
              key={`${item.label}:${item.value}`}
              className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/35 px-2 py-1 text-[11px]"
            >
              <span className="text-muted-foreground">{item.label}</span>
              <span className={trendClass(item.trend)}>{item.value}</span>
            </span>
          ))}
        </div>
      ) : null}
      {insight.hasStats ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {statsLabel}: <span className={numberClass}>{insight.netFlow}</span> ETH
          <span className="inline-block w-2" />(
          <span className={numberClass}>{insight.symbol}</span>{" "}
          <span className={numberClass}>{insight.deltaPct}</span>)
        </p>
      ) : suppressStatsFallback ? null : (
        <p className="mt-1 text-xs text-muted-foreground">
          Need at least 6-8 buckets to compare momentum.
        </p>
      )}
    </div>
  );
}
