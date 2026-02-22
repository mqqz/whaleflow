import { useEffect, useState } from "react";
import { FeedControlsPanel } from "../components/FeedControlsPanel";
import { RightSidebar } from "../components/RightSidebar";
import { MonitorFlowChart } from "../components/MonitorFlowChart";
import { MonitorInsightCard } from "../components/MonitorInsightCard";
import { NetworkGraph } from "../components/NetworkGraph";
import { TransactionFeed } from "../components/TransactionFeed";
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
  const [mainChartMode, setMainChartMode] = useState<"line" | "network">("line");
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
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
        <div className="flex-1 flex flex-col gap-3 pt-3">
          <div style={{ height: `${MONITOR_TOP_HEIGHT}px` }}>
            {mainChartMode === "line" ? (
              <MonitorFlowChart
                points={monitorModel.flowSeries}
                loading={monitorModel.flowLoading}
                error={monitorModel.flowError}
                asOfLabel={monitorModel.asOfLabel}
                feedMode={monitorModel.feedMode}
                top24hAvailable={monitorModel.top24hAvailable}
                onFeedModeChange={monitorModel.setFeedMode}
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
                  <div className="flex items-center gap-2">
                    <div className="inline-flex items-center rounded-md border border-border/60 bg-background/25 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setMainChartMode("line")}
                        className="h-8 px-3 text-xs uppercase transition-colors text-muted-foreground hover:text-foreground"
                      >
                        Line
                      </button>
                      <button
                        type="button"
                        onClick={() => setMainChartMode("network")}
                        className="h-8 px-3 text-xs uppercase transition-colors bg-secondary text-foreground"
                      >
                        Network
                      </button>
                    </div>
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

          <MonitorInsightCard insight={monitorModel.insight} />

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
              status={status}
              pauseStream={pauseStream}
              slowMode={slowMode}
              onPauseStreamChange={onPauseStreamChange}
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

        <RightSidebar
          token={token}
          selectedWallet={selectedWallet}
          transactions={visibleTransactions}
          onWalletSelect={onWalletSelect}
          onOpenWalletInExplorer={onOpenWalletInExplorer}
          expanded={sidebarExpanded}
          onExpandedChange={setSidebarExpanded}
        />
      </div>
    </div>
  );
}
