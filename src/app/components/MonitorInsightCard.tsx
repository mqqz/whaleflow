import { InsightCard, InsightCardData } from "./InsightCard";
import { MonitorFeedMode } from "../hooks/useMonitorModel";

interface MonitorInsightCardProps {
  insight: InsightCardData;
  feedMode: MonitorFeedMode;
}

export function MonitorInsightCard({ insight, feedMode }: MonitorInsightCardProps) {
  return (
    <InsightCard insight={insight} statsLabel={feedMode === "live" ? "Last 3 points" : "Last 3h"} />
  );
}
