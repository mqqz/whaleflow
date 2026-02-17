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

      <div className="mt-16 pl-3 pr-0 pb-3 space-y-3">
        {/* Main Layout */}
        <div className="flex gap-3">
          {/* Center Content */}
          <div className="flex-1 flex flex-col gap-3 pt-3">
            {/* Network Graph */}
            <div className="h-[420px]">
              <NetworkGraph network={network} transactions={graphTransactions} />
            </div>

            {/* Transaction Feed */}
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

          {/* Right Sidebar */}
          <RightSidebar />
        </div>
      </div>
    </div>
  );
}
