import { TopNavigation } from "./components/TopNavigation";
import { FeedControlsPanel } from "./components/FeedControlsPanel";
import { RightSidebar } from "./components/RightSidebar";
import { NetworkGraph } from "./components/NetworkGraph";
import { TransactionFeed } from "./components/TransactionFeed";
import { useMemo, useState } from "react";
import { useLiveTransactions } from "./hooks/useLiveTransactions";
import { ImpactPage } from "./components/ImpactView";
import { TopNavSection } from "./components/TopNavigation";
import { ExplorerPage } from "./components/ExplorerPage";
import { MonitorFlowChart } from "./components/MonitorFlowChart";
import { useMonitorModel } from "./hooks/useMonitorModel";
import { MonitorInsightCard } from "./components/MonitorInsightCard";

export default function App() {
  const IMPACT_HISTORY_SIZE = 600;
  const MONITOR_TOP_HEIGHT = 520;
  const MONITOR_INSIGHT_HEIGHT = 120;
  const [token, setToken] = useState("eth");
  const network = token === "btc" ? "bitcoin" : "ethereum";
  const [minAmount, setMinAmount] = useState(1);
  const [maxVisible, setMaxVisible] = useState(20);
  const [pauseStream, setPauseStream] = useState(false);
  const [slowMode, setSlowMode] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<TopNavSection>("monitor");
  const [mainChartMode, setMainChartMode] = useState<"line" | "network">("line");
  const { transactions, status } = useLiveTransactions({
    network,
    token,
    minAmount,
    maxTransactions: IMPACT_HISTORY_SIZE,
    whaleOnly: false,
    paused: pauseStream,
    flushIntervalMs: slowMode ? 1400 : 800,
  });
  const visibleTransactions = useMemo(
    () => transactions.slice(0, maxVisible),
    [transactions, maxVisible],
  );
  const graphTransactions = useMemo(
    () => transactions.filter((tx) => tx.channel === "wallet"),
    [transactions],
  );
  const monitorModel = useMonitorModel({
    token,
    liveTransactions: transactions,
    maxVisible,
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <TopNavigation
        token={token}
        status={status}
        activeSection={activeSection}
        onTokenChange={setToken}
        onSectionChange={setActiveSection}
      />

      {activeSection === "monitor" && (
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
                            : `Exchange-centric 24H edges (Dune snapshot as of ${monitorModel.asOfLabel})`}
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
                          monitorModel.feedMode === "top24h"
                            ? monitorModel.edgePoints24h
                            : undefined
                        }
                        selectedWallet={selectedWallet}
                        onWalletSelect={setSelectedWallet}
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
                  onPauseStreamChange={setPauseStream}
                  onSlowModeChange={setSlowMode}
                  controlsOpen={controlsOpen}
                  onControlsOpenChange={setControlsOpen}
                  selectedWallet={selectedWallet}
                  onWalletSelect={setSelectedWallet}
                  controlsPanel={
                    <FeedControlsPanel
                      token={token}
                      minAmount={minAmount}
                      maxVisible={maxVisible}
                      onMinAmountChange={setMinAmount}
                      onMaxVisibleChange={setMaxVisible}
                    />
                  }
                />
              </div>
            </div>

            <RightSidebar
              token={token}
              selectedWallet={selectedWallet}
              transactions={visibleTransactions}
              onWalletSelect={setSelectedWallet}
            />
          </div>
        </div>
      )}

      {activeSection === "impact" && <ImpactPage token={token} transactions={transactions} />}

      {activeSection === "explorer" && (
        <ExplorerPage
          network={network}
          token={token}
          transactions={transactions}
          selectedWallet={selectedWallet}
          onWalletSelect={setSelectedWallet}
        />
      )}
    </div>
  );
}
