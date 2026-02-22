import { useImpactModel } from "../hooks/useImpactModel";
import { KpiRow } from "./impact/KpiRow";
import { FlowPriceChart } from "./impact/FlowPriceChart";
import { CexFlowsChart } from "./impact/CexFlowsChart";
import { CumulativeFlowChart } from "./impact/CumulativeFlowChart";
import { InsightCard } from "./InsightCard";

interface ImpactPageProps {
  token: string;
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

export function ImpactPage({ token }: ImpactPageProps) {
  const model = useImpactModel({ token });

  const kpiCards = [
    {
      title: "Net Exchange Flow (1H)",
      value:
        model.kpis.netExchangeFlow1h.value === null
          ? "n/a"
          : `${model.kpis.netExchangeFlow1h.value >= 0 ? "+" : "-"}${formatValue(Math.abs(model.kpis.netExchangeFlow1h.value), 1)}`,
      valueClassName:
        model.kpis.netExchangeFlow1h.value === null
          ? ""
          : model.kpis.netExchangeFlow1h.value >= 0
            ? "text-success"
            : "text-destructive",
      deltaPct: model.kpis.netExchangeFlow1h.pct,
    },
    {
      title: "Whale/Exchange Net Flow (1H)",
      value:
        model.kpis.whaleExchangeNetFlow1h.value === null
          ? "n/a"
          : `${model.kpis.whaleExchangeNetFlow1h.value >= 0 ? "+" : "-"}${formatValue(Math.abs(model.kpis.whaleExchangeNetFlow1h.value), 1)} ETH`,
      valueClassName:
        model.kpis.whaleExchangeNetFlow1h.value === null
          ? ""
          : model.kpis.whaleExchangeNetFlow1h.value >= 0
            ? "text-success"
            : "text-destructive",
      deltaPct: model.kpis.whaleExchangeNetFlow1h.pct,
    },
    {
      title: "Whale Share",
      value:
        model.kpis.whaleShare.value === null
          ? "n/a"
          : `${(model.kpis.whaleShare.value * 100).toFixed(1)}%`,
      deltaPct: model.kpis.whaleShare.pct,
    },
    {
      title: "Rolling Volatility (24H)",
      value:
        model.kpis.rollingVolatility24h.value === null
          ? "n/a"
          : `${formatValue(model.kpis.rollingVolatility24h.value, 2)}%`,
      deltaPct: model.kpis.rollingVolatility24h.pct,
    },
    {
      title: "Flow-Return Correlation (24H)",
      value: formatValue(model.kpis.flowReturnCorr24h.value, 3),
      deltaPct: model.kpis.flowReturnCorr24h.pct,
    },
  ];

  const netFlowValue = model.kpis.netExchangeFlow1h.value;
  const netFlowPct = model.kpis.netExchangeFlow1h.pct;
  const impactInsight = {
    signal: model.insight.summary,
    narrative: model.insight.detail,
    hasStats: false,
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
      <InsightCard insight={impactInsight} statsLabel="Last 1h" suppressStatsFallback />

      <KpiRow cards={kpiCards} />

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
