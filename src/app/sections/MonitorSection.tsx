import { useEffect, useState } from "react";
import { ChevronDown, Pause, Play } from "lucide-react";
import { FeedControlsPanel } from "../components/FeedControlsPanel";
import { RightSidebar } from "../components/RightSidebar";
import { MonitorFlowChart } from "../components/MonitorFlowChart";
import { MonitorInsightCard } from "../components/MonitorInsightCard";
import { NetworkGraph } from "../components/NetworkGraph";
import { TransactionFeed } from "../components/TransactionFeed";
import { LiveStatusBadge } from "../components/LiveStatusBadge";
import { Button } from "../components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/ui/collapsible";
import { useLiveTransactions, type LiveTransaction } from "../hooks/useLiveTransactions";
import { useMonitorModel } from "../hooks/useMonitorModel";

interface MonitorSectionProps {
  network: string;
  token: string;
  minAmount: number;
  maxVisible: number;
  pauseStream: boolean;
  slowMode: boolean;
  controlsOpen: boolean;
  selectedWallet: string | null;
  status: ReturnType<typeof useLiveTransactions>["status"];
  transactions: LiveTransaction[];
  visibleTransactions: LiveTransaction[];
  graphTransactions: LiveTransaction[];
  onMinAmountChange: (value: number) => void;
  onMaxVisibleChange: (value: number) => void;
  onPauseStreamChange: (value: boolean) => void;
  onSlowModeChange: (value: boolean) => void;
  onControlsOpenChange: (value: boolean) => void;
  onWalletSelect: (wallet: string | null) => void;
  onOpenWalletInExplorer: (wallet: string) => void;
}

const MONITOR_TOP_HEIGHT = 520;
const MONITOR_INSIGHT_HEIGHT = 120;

export function MonitorSection({
  network,
  token,
  minAmount,
  maxVisible,
  pauseStream,
  slowMode,
  controlsOpen,
  selectedWallet,
  status,
  transactions,
  visibleTransactions,
  graphTransactions,
  onMinAmountChange,
  onMaxVisibleChange,
  onPauseStreamChange,
  onSlowModeChange,
  onControlsOpenChange,
  onWalletSelect,
  onOpenWalletInExplorer,
}: MonitorSectionProps) {
  const [mainChartMode, setMainChartMode] = useState<"line" | "network">("network");
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [monitorBarOpen, setMonitorBarOpen] = useState(true);
  const monitorModel = useMonitorModel({
    token,
    liveTransactions: transactions,
    maxVisible,
  });

  useEffect(() => {
    if (selectedWallet && selectedWallet.trim().length > 0) {
      setSidebarExpanded(true);
    }
  }, [selectedWallet]);

  return (
    <div className="mt-16 pl-3 pr-0 pb-3 min-h-[calc(100dvh-4rem)]">
      <div className="flex gap-3 min-h-[calc(100dvh-4rem)]">
        <div className="flex-1 flex flex-col gap-3 pt-2">
          <div className="sticky top-[4.25rem] z-40">
            <Collapsible open={monitorBarOpen} onOpenChange={setMonitorBarOpen}>
              <div className="w-full rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span>Monitor Feed Controls</span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${monitorBarOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t border-border/50">
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <div className="inline-flex items-center rounded-md border border-border/60 bg-background/25 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => monitorModel.setFeedMode("live")}
                        className={`h-8 px-3 text-xs uppercase transition-colors ${
                          monitorModel.feedMode === "live"
                            ? "bg-secondary text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Live
                      </button>
                      <button
                        type="button"
                        onClick={() => monitorModel.setFeedMode("top24h")}
                        disabled={!monitorModel.top24hAvailable}
                        className={`h-8 px-3 text-xs uppercase transition-colors disabled:opacity-40 ${
                          monitorModel.feedMode === "top24h"
                            ? "bg-secondary text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        24H
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      {monitorModel.feedMode === "live" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => onPauseStreamChange(!pauseStream)}
                          aria-pressed={pauseStream}
                          className={`h-8 w-8 rounded-full ${
                            pauseStream
                              ? "text-success hover:text-success"
                              : "text-amber-500 hover:text-amber-500"
                          }`}
                        >
                          {pauseStream ? (
                            <Play className="w-4 h-4" />
                          ) : (
                            <Pause className="w-4 h-4" />
                          )}
                        </Button>
                      ) : null}
                      {monitorModel.feedMode === "live" ? (
                        <LiveStatusBadge
                          status={status}
                          paused={pauseStream}
                          className="hidden sm:inline-flex"
                        />
                      ) : null}
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          </div>

          <MonitorInsightCard insight={monitorModel.insight} />

          <div style={{ height: `${MONITOR_TOP_HEIGHT}px` }}>
            {mainChartMode === "line" ? (
              <MonitorFlowChart
                points={monitorModel.flowSeries}
                loading={monitorModel.flowLoading}
                error={monitorModel.flowError}
                asOfLabel={monitorModel.asOfLabel}
                feedMode={monitorModel.feedMode}
                chartMode={mainChartMode}
                onChartModeChange={setMainChartMode}
              />
            ) : (
              <div className="h-full flex flex-col bg-card/60 backdrop-blur-sm border border-border/60 rounded-xl p-4">
                <div className="flex items-center justify-between pb-3 border-b border-border/50">
                  <div>
                    <h3 className="font-semibold text-base">Live Wallet Network Graph</h3>
                    <p className="text-xs text-muted-foreground">
                      {monitorModel.feedMode === "live"
                        ? "Node-edge view from current stream session"
                        : `Exchange-centric 24H edges (BigQuery snapshot as of ${monitorModel.asOfLabel})`}
                    </p>
                  </div>
                  <div className="inline-flex items-center rounded-md border border-border/60 bg-background/25 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setMainChartMode("network")}
                      className="h-8 px-3 text-xs uppercase transition-colors bg-secondary text-foreground"
                    >
                      Network
                    </button>
                    <button
                      type="button"
                      onClick={() => setMainChartMode("line")}
                      className="h-8 px-3 text-xs uppercase transition-colors text-muted-foreground hover:text-foreground"
                    >
                      Line
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex-1 min-h-0">
                  <NetworkGraph
                    network={network}
                    transactions={graphTransactions}
                    edgePoints={
                      monitorModel.feedMode === "top24h" ? monitorModel.edgePoints24h : undefined
                    }
                    selectedWallet={selectedWallet}
                    onWalletSelect={(wallet) => onWalletSelect(wallet)}
                  />
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              minHeight: `calc(100dvh - 4rem - ${MONITOR_TOP_HEIGHT}px - ${MONITOR_INSIGHT_HEIGHT}px - 2.25rem)`,
            }}
          >
            <TransactionFeed
              network={network}
              token={token}
              minAmount={minAmount}
              transactions={visibleTransactions}
              feedMode={monitorModel.feedMode}
              feedTitle={monitorModel.feedTitle}
              feedSubtitle={monitorModel.feedSubtitle}
              edgeRows={monitorModel.edgeRows}
              pauseStream={pauseStream}
              status={status}
              slowMode={slowMode}
              onSlowModeChange={onSlowModeChange}
              controlsOpen={controlsOpen}
              onControlsOpenChange={onControlsOpenChange}
              selectedWallet={selectedWallet}
              onWalletSelect={(wallet) => onWalletSelect(wallet)}
              controlsPanel={
                <FeedControlsPanel
                  token={token}
                  minAmount={minAmount}
                  maxVisible={maxVisible}
                  onMinAmountChange={onMinAmountChange}
                  onMaxVisibleChange={onMaxVisibleChange}
                />
              }
            />
          </div>
        </div>

        <div className="sticky top-[4.25rem] self-start flex h-[calc(100dvh-4.25rem)]">
          <RightSidebar
            token={token}
            selectedWallet={selectedWallet}
            transactions={visibleTransactions}
            feedMode={monitorModel.feedMode}
            edgePoints24h={monitorModel.edgePoints24h}
            onWalletSelect={onWalletSelect}
            onOpenWalletInExplorer={onOpenWalletInExplorer}
            expanded={sidebarExpanded}
            onExpandedChange={setSidebarExpanded}
          />
        </div>
      </div>
    </div>
  );
}
