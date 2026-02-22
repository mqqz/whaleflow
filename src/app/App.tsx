import { TopNavigation } from "./components/TopNavigation";
import { lazy, Suspense, useMemo, useState } from "react";
import { useLiveTransactions } from "./hooks/useLiveTransactions";
import { TopNavSection } from "./components/TopNavigation";

const MonitorSection = lazy(() =>
  import("./sections/MonitorSection").then((module) => ({ default: module.MonitorSection })),
);
const ImpactPage = lazy(() =>
  import("./components/ImpactView").then((module) => ({ default: module.ImpactPage })),
);
const ExplorerPage = lazy(() =>
  import("./components/ExplorerPage").then((module) => ({ default: module.ExplorerPage })),
);

export default function App() {
  const IMPACT_HISTORY_SIZE = 600;
  const [token, setToken] = useState("eth");
  const network = token === "btc" ? "bitcoin" : "ethereum";
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

  const sectionFallback = (
    <div className="mt-16 px-3 pb-3 pt-3 text-sm text-muted-foreground">Loading section...</div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <TopNavigation
        token={token}
        activeSection={activeSection}
        onTokenChange={setToken}
        onSectionChange={setActiveSection}
      />

      <Suspense fallback={sectionFallback}>
        {activeSection === "monitor" && (
          <MonitorSection
            network={network}
            token={token}
            minAmount={minAmount}
            maxVisible={maxVisible}
            pauseStream={pauseStream}
            slowMode={slowMode}
            controlsOpen={controlsOpen}
            selectedWallet={selectedWallet}
            status={status}
            transactions={transactions}
            visibleTransactions={visibleTransactions}
            graphTransactions={graphTransactions}
            onMinAmountChange={setMinAmount}
            onMaxVisibleChange={setMaxVisible}
            onPauseStreamChange={setPauseStream}
            onSlowModeChange={setSlowMode}
            onControlsOpenChange={setControlsOpen}
            onWalletSelect={setSelectedWallet}
            onOpenWalletInExplorer={(wallet) => {
              setSelectedWallet(wallet);
              setActiveSection("explorer");
            }}
          />
        )}

        {activeSection === "impact" && <ImpactPage token={token} />}

        {activeSection === "explorer" && (
          <ExplorerPage
            network={network}
            token={token}
            transactions={transactions}
            selectedWallet={selectedWallet}
            onWalletSelect={setSelectedWallet}
          />
        )}
      </Suspense>
    </div>
  );
}
