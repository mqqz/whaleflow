import { TopNavigation } from "./components/TopNavigation";
import { FeedControlsPanel } from "./components/FeedControlsPanel";
import { RightSidebar } from "./components/RightSidebar";
import { NetworkGraph } from "./components/NetworkGraph";
import { TransactionFeed } from "./components/TransactionFeed";
import { useMemo, useState } from "react";
import { useLiveTransactions } from "./hooks/useLiveTransactions";

export default function App() {
  const [network, setNetwork] = useState("ethereum");
  const [token, setToken] = useState("eth");
  const [minAmount, setMinAmount] = useState(1);
  const [maxVisible, setMaxVisible] = useState(20);
  const [pauseStream, setPauseStream] = useState(false);
  const [slowMode, setSlowMode] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const { transactions, status } = useLiveTransactions({
    network,
    token,
    minAmount,
    maxTransactions: maxVisible,
    whaleOnly: false,
    paused: pauseStream,
    flushIntervalMs: slowMode ? 1400 : 800,
  });
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
        onNetworkChange={setNetwork}
        onTokenChange={setToken}
      />

      <div className="mt-16 pl-3 pr-0 pb-3 h-[calc(100vh-4rem)]">
        {/* Main Layout */}
        <div className="flex gap-3 h-full">
          {/* Center Content */}
          <div className="flex-1 flex flex-col gap-3 pt-3 min-h-0">
            {/* Network Graph */}
            <div className="h-[420px]">
              <NetworkGraph
                network={network}
                transactions={graphTransactions}
                selectedWallet={selectedWallet}
                onWalletSelect={setSelectedWallet}
              />
            </div>

            {/* Transaction Feed */}
            <div className="flex-1 min-h-0">
              <TransactionFeed
                network={network}
                token={token}
                minAmount={minAmount}
                transactions={transactions}
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

          {/* Right Sidebar */}
          <RightSidebar
            token={token}
            selectedWallet={selectedWallet}
            transactions={transactions}
            onWalletSelect={setSelectedWallet}
          />
        </div>
      </div>
    </div>
  );
}
