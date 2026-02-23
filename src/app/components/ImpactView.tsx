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
          "Indicates whether exchanges saw net withdrawals or net deposits in the selected window.",
        details: [
          `How calculated: sum of net_flow_eth over ${rangeLabel} (outflow − inflow).`,
          "How to interpret: Positive suggests net coins leaving exchanges (often accumulation); negative suggests net coins entering exchanges (often sell pressure).",
          "Why it matters: Gives a high-level read of liquidity pressure and directional risk.",
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
        summary: "Shows whether large holders (whales) are net moving funds on or off exchanges.",
        details: [
          `How calculated: sum of whale tier_exchange_net_flow_eth over ${rangeLabel}.`,
          "How to interpret: Positive means whales are net withdrawing from exchanges; negative means net depositing to exchanges.",
          "Why it matters: Whale flows often move earlier than broad market flows and can be a leading risk signal.",
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
        summary: "Measures how concentrated current exchange flow is in whale activity.",
        details: [
          "How calculated: |whale net flow| ÷ |total net flow| for the selected range, shown as a %. ",
          "How to interpret: Higher share means fewer large players are driving flow; lower share means broader participation.",
          "Why it matters: Highlights concentration risk and whether current flow may be less stable.",
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
        summary: "Tracks how unstable price movement has been over the selected window.",
        details: [
          `How calculated: standard deviation (σ) of hourly returns across the last ${rangePoints} points.`,
          "How to interpret: Higher values mean larger swings and higher uncertainty; lower values mean calmer conditions.",
          "Why it matters: Supports risk posture, sizing, and communication of expected turbulence.",
        ],
      },
    },
    {
      title: "Flow-Return Correlation",
      value: formatValue(model.kpis.flowReturnCorr24h.value, 3),
      deltaPct: model.kpis.flowReturnCorr24h.pct,
      info: {
        summary: "Shows whether flow direction and price direction are moving together.",
        details: [
          `How calculated: Pearson correlation (ρ) between net flow and hourly price returns over ${rangePoints} aligned points.`,
          "How to interpret: Near +1 means flow and price move together; near 0 means weak relationship; near -1 means they move opposite.",
          "Why it matters: Indicates whether flow is currently a dependable directional signal for decision-making.",
        ],
      },
    },
  ];

  const netFlowValue = model.kpis.netExchangeFlow1h.value;
  const impactInsight = {
    signal: model.insight.summary,
    narrative: model.insight.detail,
    hasStats: false,
    netFlow: netFlowValue === null ? "n/a" : netFlowValue.toFixed(1),
    deltaPct: "n/a",
    symbol: "■" as const,
    trend: "neutral" as const,
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

      <InsightCard
        insight={impactInsight}
        statsLabel={model.range === "24h" ? "Last 24H" : "Last 7D"}
        suppressStatsFallback
      />

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
