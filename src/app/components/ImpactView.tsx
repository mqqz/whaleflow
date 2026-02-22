import { LiveTransaction } from "../hooks/useLiveTransactions";
import { useImpactModel } from "../hooks/useImpactModel";
import { KpiRow } from "./impact/KpiRow";
import { FlowPriceChart } from "./impact/FlowPriceChart";
import { CexFlowsChart } from "./impact/CexFlowsChart";
import { CumulativeFlowChart } from "./impact/CumulativeFlowChart";
import { InsightCard } from "./InsightCard";

interface ImpactPageProps {
  token: string;
  transactions: LiveTransaction[];
}

const formatValue = (value: number | null, digits = 2) => {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toFixed(digits);
};

export function ImpactPage({ token, transactions }: ImpactPageProps) {
  const model = useImpactModel({ token, transactions });

  const kpiCards = [
    {
      title: "Net Exchange Flow (1H)",
      value:
        model.kpis.netFlow1h.value === null
          ? "n/a"
          : `${model.kpis.netFlow1h.value >= 0 ? "+" : "-"}${formatValue(Math.abs(model.kpis.netFlow1h.value), 1)}`,
      valueClassName:
        model.kpis.netFlow1h.value === null
          ? ""
          : model.kpis.netFlow1h.value >= 0
            ? "text-success"
            : "text-destructive",
      deltaPct: model.kpis.netFlow1h.pct,
    },
    {
      title: `Whale Volume (${model.range.toUpperCase()})`,
      value: `${formatValue(model.kpis.whaleVolumeRange.value, 1)} ETH`,
      deltaPct: model.kpis.whaleVolumeRange.pct,
      subtitle: `Threshold >= ${model.whaleThresholdEth} ETH`,
    },
    {
      title: "Rolling Volatility (24H)",
      value: `${formatValue(model.kpis.rollingVol24h.value, 2)}%`,
      deltaPct: model.kpis.rollingVol24h.pct,
    },
    {
      title: "Flow-Return Correlation (24H)",
      value: formatValue(model.kpis.flowReturnCorr24h.value, 3),
      deltaPct: model.kpis.flowReturnCorr24h.pct,
    },
    {
      title: "Flow Z-Score",
      value: formatValue(model.kpis.flowZScore.value, 2),
      deltaPct: model.kpis.flowZScore.pct,
      subtitle: "z = (x - mu) / sigma",
    },
  ];

  const netFlowValue = model.kpis.netFlow1h.value;
  const netFlowPct = model.kpis.netFlow1h.pct;
  const impactInsight = {
    signal: model.insight.summary,
    narrative: model.insight.detail,
    hasStats: netFlowValue !== null && netFlowPct !== null,
    netFlow: netFlowValue === null ? "n/a" : netFlowValue.toFixed(1),
    deltaPct: netFlowPct === null ? "n/a" : `${Math.abs(netFlowPct).toFixed(1)}%`,
    symbol:
      netFlowValue === null ? ("■" as const) : netFlowValue >= 0 ? ("▲" as const) : ("▼" as const),
    trend:
      netFlowValue === null
        ? ("neutral" as const)
        : netFlowValue >= 0
          ? ("positive" as const)
          : ("negative" as const),
  };

  return (
    <div className="mt-16 px-3 pb-3 pt-3 space-y-3">
      <KpiRow cards={kpiCards} />

      <InsightCard insight={impactInsight} statsLabel="Last 1h" />

      <FlowPriceChart
        points={model.flowPriceSeries}
        range={model.range}
        onRangeChange={model.setRange}
        lagHours={model.lagHours}
        onLagHoursChange={model.setLagHours}
        priceSource={model.priceSource}
        loading={model.loading}
        error={model.error}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <CexFlowsChart series={model.byCexSeries} />
        <CumulativeFlowChart points={model.cumulativeSeries} />
      </div>
    </div>
  );
}
