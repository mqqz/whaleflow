import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useImpactModel } from "../hooks/useImpactModel";
import { KpiRow } from "./impact/KpiRow";
import { FlowPriceChart } from "./impact/FlowPriceChart";
import { CexFlowsChart } from "./impact/CexFlowsChart";
import { CumulativeFlowChart } from "./impact/CumulativeFlowChart";
import { InsightCard } from "./InsightCard";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";

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
  const [impactControlsOpen, setImpactControlsOpen] = useState(true);
  const rangeLabel = model.range === "24h" ? "24H" : "7D";
  const rangePoints = model.range === "24h" ? 24 : 24 * 7;
  const deltaLabel = model.range === "7d" ? "24H" : rangeLabel;

  const kpiCards = [
    {
      title: "Net Exchange Flow",
      value:
        model.kpis.netExchangeFlow1h.value === null
          ? "n/a"
          : `${model.kpis.netExchangeFlow1h.value >= 0 ? "+" : "-"}${formatValue(Math.abs(model.kpis.netExchangeFlow1h.value), 1)} ETH`,
      valueClassName:
        model.kpis.netExchangeFlow1h.value === null
          ? ""
          : model.kpis.netExchangeFlow1h.value >= 0
            ? "text-success"
            : "text-destructive",
      deltaPct: model.kpis.netExchangeFlow1h.pct,
      info: {
        summary:
          "Net flow across the currently selected Impact Feed range for all exchange-labeled transfers.",
        details: [
          `Value = sum of net_flow_eth over the latest ${rangeLabel} window (outflow − inflow).`,
          `Δ% compares latest ${deltaLabel} flow vs the previous ${deltaLabel} flow.`,
          "If the previous window is ~0, delta is shown as n/a.",
        ],
      },
    },
    {
      title: "Whale/Exchange Net Flow",
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
      info: {
        summary: "Whale-tier net flow across the currently selected Impact Feed range.",
        details: [
          `Value = sum of whale tier_exchange_net_flow_eth over the latest ${rangeLabel} window.`,
          `Δ% compares latest ${deltaLabel} whale flow vs the previous ${deltaLabel} whale flow.`,
          "Positive means whales are net withdrawing from exchanges over the selected range.",
        ],
      },
    },
    {
      title: "Whale Share",
      value:
        model.kpis.whaleShare.value === null
          ? "n/a"
          : `${(model.kpis.whaleShare.value * 100).toFixed(1)}%`,
      deltaPct: model.kpis.whaleShare.pct,
      info: {
        summary: "How much of current-range exchange net flow is explained by whale flow.",
        details: [
          `Share = |whale net flow (${rangeLabel})| ÷ max(ε, |total net flow (${rangeLabel})|).`,
          "Displayed as a percentage.",
          `Δ% compares latest ${deltaLabel} share vs the previous ${deltaLabel} share.`,
        ],
      },
    },
    {
      title: "Rolling Volatility",
      value:
        model.kpis.rollingVolatility24h.value === null
          ? "n/a"
          : `${formatValue(model.kpis.rollingVolatility24h.value, 2)}%`,
      deltaPct: model.kpis.rollingVolatility24h.pct,
      info: {
        summary: "Sample standard deviation of hourly price returns over the selected range.",
        details: [
          "Returns are built from hourly-aligned close prices.",
          `Value = σ of the last ${rangePoints} return points, then scaled to percent.`,
          `Δ% compares latest ${deltaLabel} volatility vs the previous ${deltaLabel} volatility.`,
        ],
      },
    },
    {
      title: "Flow-Return Correlation",
      value: formatValue(model.kpis.flowReturnCorr24h.value, 3),
      deltaPct: model.kpis.flowReturnCorr24h.pct,
      info: {
        summary: "Pearson correlation between flow and price returns over the selected range.",
        details: [
          "Flow input is net flow series; return input is hourly price return series.",
          `Value = Pearson ρ over the latest ${rangePoints} aligned points.`,
          `Δ% compares latest ${deltaLabel} correlation vs the previous ${deltaLabel} correlation.`,
        ],
      },
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
      <div className="sticky top-[4.25rem] z-40">
        <Collapsible open={impactControlsOpen} onOpenChange={setImpactControlsOpen}>
          <div className="w-full rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
              >
                <span>Impact Feed Controls</span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${impactControlsOpen ? "rotate-180" : ""}`}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t border-border/50">
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="inline-flex items-center rounded-md border border-border/60 bg-background/25 overflow-hidden">
                  {(["24h", "7d"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => model.setRange(value)}
                      className={`h-8 px-3 text-xs uppercase transition-colors ${
                        model.range === value
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {value.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      </div>

      <InsightCard insight={impactInsight} statsLabel="Last 1h" suppressStatsFallback />

      <KpiRow cards={kpiCards} />

      <FlowPriceChart
        points={model.flowPriceSeries}
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
