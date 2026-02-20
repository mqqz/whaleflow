import { InsightCard, InsightCardData } from "./InsightCard";

interface MonitorInsightCardProps {
  insight: InsightCardData;
}

export function MonitorInsightCard({ insight }: MonitorInsightCardProps) {
  return <InsightCard insight={insight} statsLabel="Last 3h" />;
}
