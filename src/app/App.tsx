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

const isAddressLikeForExplorer = (value: string | null, network: "bitcoin" | "ethereum") => {
  const candidate = (value ?? "").trim();
  if (!candidate) {
    return false;
  }

  if (network === "ethereum") {
    return /^0x[a-fA-F0-9]{40}$/.test(candidate);
  }

  return /^(bc1|[13])[a-zA-Z0-9]{20,}$/.test(candidate);
};

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
  const explorerSelectedWallet = useMemo(
    () => (isAddressLikeForExplorer(selectedWallet, network) ? selectedWallet : null),
    [network, selectedWallet],
  );

  const handleSectionChange = (section: TopNavSection) => {
    if (section === "explorer" && !isAddressLikeForExplorer(selectedWallet, network)) {
      setSelectedWallet(null);
    }
    setActiveSection(section);
  };

  const { transactions, status } = useLiveTransactions({
    network,
    token,
    minAmount,
    maxTransactions: IMPACT_HISTORY_SIZE,
    whaleOnly: false,
    paused: pauseStream,
    flushIntervalMs: slowMode ? 1400 : 800,
  });
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
        onSectionChange={handleSectionChange}
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
            graphTransactions={graphTransactions}
            onMinAmountChange={setMinAmount}
            onMaxVisibleChange={setMaxVisible}
            onPauseStreamChange={setPauseStream}
            onSlowModeChange={setSlowMode}
            onControlsOpenChange={setControlsOpen}
            onWalletSelect={setSelectedWallet}
            onOpenWalletInExplorer={(wallet) => {
              if (!isAddressLikeForExplorer(wallet, network)) {
                return;
              }
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
            selectedWallet={explorerSelectedWallet}
            onWalletSelect={setSelectedWallet}
          />
        )}
      </Suspense>
    </div>
  );
}
