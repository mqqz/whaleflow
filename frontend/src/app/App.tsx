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

export default function App() {
  const IMPACT_HISTORY_SIZE = 600;
  const [network, setNetwork] = useState("ethereum");
  const [token, setToken] = useState("eth");
  const [minAmount, setMinAmount] = useState(1);
  const [maxVisible, setMaxVisible] = useState(20);
  const [pauseStream, setPauseStream] = useState(false);
  const [slowMode, setSlowMode] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<TopNavSection>("monitor");
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

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <TopNavigation
        network={network}
        token={token}
        status={status}
        activeSection={activeSection}
        onNetworkChange={setNetwork}
        onTokenChange={setToken}
        onSectionChange={setActiveSection}
      />

      {activeSection === "monitor" && (
        <div className="mt-16 pl-3 pr-0 pb-3 min-h-[calc(100dvh-4rem)]">
          <div className="flex gap-3 min-h-[calc(100dvh-4rem)]">
            <div className="flex-1 flex flex-col gap-3 pt-3">
              <div className="h-[420px]">
                <NetworkGraph
                  network={network}
                  transactions={graphTransactions}
                  selectedWallet={selectedWallet}
                  onWalletSelect={setSelectedWallet}
                />
              </div>

              <div className="min-h-[calc(100dvh-4rem-420px-1.5rem)]">
                <TransactionFeed
                  network={network}
                  token={token}
                  minAmount={minAmount}
                  transactions={visibleTransactions}
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
