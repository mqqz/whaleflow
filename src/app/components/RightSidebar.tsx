import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Fuel,
  Wallet,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { ScrollArea } from "./ui/scroll-area";
import { LiveTransaction } from "../hooks/useLiveTransactions";
import { MonitorFeedMode } from "../hooks/useMonitorModel";
import { EdgePoint } from "../services/analyticsData";

interface RightSidebarProps {
  token: string;
  selectedWallet: string | null;
  transactions: LiveTransaction[];
  feedMode: MonitorFeedMode;
  edgePoints24h?: EdgePoint[];
  onWalletSelect: (wallet: string) => void;
  onOpenWalletInExplorer: (wallet: string) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

const tokenLabels: Record<string, string> = {
  btc: "BTC",
  eth: "ETH",
};

const parseNumeric = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseTierName = (value: string) => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^tier:/, "")
    .replace(/s$/, "");
  if (
    normalized === "shrimp" ||
    normalized === "dolphin" ||
    normalized === "shark" ||
    normalized === "whale"
  ) {
    return normalized as "shrimp" | "dolphin" | "shark" | "whale";
  }
  return null;
};

const tierDescriptions: Record<"shrimp" | "dolphin" | "shark" | "whale", string> = {
  shrimp: "Represents wallets with < 100 ETH.",
  dolphin: "Represents wallets with 100 <= balance < 1000 ETH.",
  shark: "Represents wallets with 1000 <= balance < 10000 ETH.",
  whale: "Represents wallets with >= 10000 ETH.",
};

type Top24hEntityKind = "exchange" | "tier" | "wallet";
type Top24hCounterpartyKind = "exchange" | "tier" | "wallet";

const TIER_EMOJI: Record<"shrimp" | "dolphin" | "shark" | "whale", string> = {
  shrimp: "🦐",
  dolphin: "🐬",
  shark: "🦈",
  whale: "🐋",
};

const TIER_PLURAL: Record<"shrimp" | "dolphin" | "shark" | "whale", string> = {
  shrimp: "shrimps",
  dolphin: "dolphins",
  shark: "sharks",
  whale: "whales",
};

const formatTierDisplay = (tier: "shrimp" | "dolphin" | "shark" | "whale") =>
  `${TIER_PLURAL[tier]} ${TIER_EMOJI[tier]}`;

interface Top24hEntityDetails {
  kind: Top24hEntityKind;
  displayName: string;
  tier: "shrimp" | "dolphin" | "shark" | "whale" | null;
  inflow: number;
  outflow: number;
  netFlow: number;
  txCount: number;
  edgeCount: number;
  counterparties: Array<{
    id: string;
    label: string;
    valueEth: number;
    kind: Top24hCounterpartyKind;
    tier: "shrimp" | "dolphin" | "shark" | "whale" | null;
    displayName: string;
  }>;
}

const pickMostFrequent = (counts: Map<string, number>, fallback: string) => {
  let selected = fallback;
  let best = 0;
  for (const [label, count] of counts.entries()) {
    if (count > best) {
      selected = label;
      best = count;
    }
  }
  return selected;
};

const resolveTop24hEntityDetails = (
  nodeId: string,
  edges: EdgePoint[],
): Top24hEntityDetails | null => {
  if (!nodeId.trim()) {
    return null;
  }

  let inflow = 0;
  let outflow = 0;
  let txCount = 0;
  let edgeCount = 0;
  const ownLabels = new Map<string, number>();
  const counterparties = new Map<string, { label: string; valueEth: number }>();

  for (const edge of edges) {
    const isSource = edge.src === nodeId;
    const isTarget = edge.dst === nodeId;
    if (!isSource && !isTarget) {
      continue;
    }

    edgeCount += 1;
    txCount += edge.txCount;
    if (isTarget) {
      inflow += edge.valueEth;
    }
    if (isSource) {
      outflow += edge.valueEth;
    }

    const ownLabel = isSource ? edge.srcLabel : edge.dstLabel;
    if (ownLabel && ownLabel !== "unlabeled") {
      ownLabels.set(ownLabel, (ownLabels.get(ownLabel) ?? 0) + 1);
    }

    const counterpartyId = isSource ? edge.dst : edge.src;
    const counterpartyLabel = isSource ? edge.dstLabel : edge.srcLabel;
    const current = counterparties.get(counterpartyId) ?? {
      label: counterpartyLabel || "unlabeled",
      valueEth: 0,
    };
    current.valueEth += edge.valueEth;
    counterparties.set(counterpartyId, current);
  }

  if (edgeCount === 0) {
    return null;
  }

  const tierFromId = parseTierName(nodeId);
  const tierFromLabel =
    [...ownLabels.keys()].map(parseTierName).find((value) => value !== null) ?? null;
  const tier = tierFromId ?? tierFromLabel;

  const displayNameRaw = ownLabels.size > 0 ? pickMostFrequent(ownLabels, nodeId) : nodeId;
  const kind: Top24hEntityKind = tier ? "tier" : ownLabels.size > 0 ? "exchange" : "wallet";
  const displayName = tier ? formatTierDisplay(tier) : displayNameRaw;
  const typedCounterparties = [...counterparties.entries()]
    .map(([id, info]) => {
      const counterpartyTier = parseTierName(id) ?? parseTierName(info.label);
      const counterpartyKind: Top24hCounterpartyKind = counterpartyTier
        ? "tier"
        : info.label && info.label !== "unlabeled"
          ? "exchange"
          : "wallet";
      const displayNameForCounterparty =
        counterpartyKind === "tier" && counterpartyTier
          ? formatTierDisplay(counterpartyTier)
          : info.label && info.label !== "unlabeled"
            ? info.label
            : id;
      return {
        id,
        label: info.label,
        valueEth: info.valueEth,
        kind: counterpartyKind,
        tier: counterpartyTier,
        displayName: displayNameForCounterparty,
      };
    })
    .filter((counterparty) =>
      kind === "tier"
        ? counterparty.kind === "exchange"
        : kind === "exchange"
          ? counterparty.kind === "tier"
          : true,
    )
    .sort((a, b) => b.valueEth - a.valueEth)
    .slice(0, 8);

  return {
    kind,
    displayName,
    tier,
    inflow,
    outflow,
    netFlow: inflow - outflow,
    txCount,
    edgeCount,
    counterparties: typedCounterparties,
  };
};

const resolveDistinctCexLabel = (wallet: string, transactions: LiveTransaction[]) => {
  const labelCounts = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.from === wallet && tx.fromLabel && tx.fromLabel !== "unlabeled") {
      labelCounts.set(tx.fromLabel, (labelCounts.get(tx.fromLabel) ?? 0) + 1);
    }
    if (tx.to === wallet && tx.toLabel && tx.toLabel !== "unlabeled") {
      labelCounts.set(tx.toLabel, (labelCounts.get(tx.toLabel) ?? 0) + 1);
    }
  }

  let selected: string | null = null;
  let bestCount = 0;
  for (const [label, count] of labelCounts.entries()) {
    if (count > bestCount) {
      selected = label;
      bestCount = count;
    }
  }
  return selected;
};

export function RightSidebar({
  token,
  selectedWallet,
  transactions,
  feedMode,
  edgePoints24h,
  onWalletSelect,
  onOpenWalletInExplorer,
  expanded,
  onExpandedChange,
}: RightSidebarProps) {
  const [copied, setCopied] = useState(false);
  const tokenLabel = tokenLabels[token] ?? token.toUpperCase();
  const selected = selectedWallet?.trim() ?? "";
  const hasSelection = selected.length > 0;
  const resolvedFullWallet = hasSelection
    ? (transactions.find((tx) => tx.from === selected && tx.fromFull)?.fromFull ??
      transactions.find((tx) => tx.to === selected && tx.toFull)?.toFull ??
      selected)
    : "";
  const explorerUrl = resolvedFullWallet
    ? token === "btc"
      ? `https://mempool.space/address/${resolvedFullWallet}`
      : `https://etherscan.io/address/${resolvedFullWallet}`
    : "";

  const walletTransactions = hasSelection
    ? transactions.filter((tx) => tx.from === selected || tx.to === selected)
    : [];
  const distinctCexLabel = hasSelection ? resolveDistinctCexLabel(selected, transactions) : null;
  const top24hEntityDetails =
    hasSelection && feedMode === "top24h"
      ? resolveTop24hEntityDetails(selected, edgePoints24h ?? [])
      : null;
  const showAggregateEntityDetails =
    top24hEntityDetails !== null && top24hEntityDetails.kind !== "wallet";

  const inflow = walletTransactions.reduce(
    (sum, tx) => sum + (tx.to === selected ? parseNumeric(tx.amount) : 0),
    0,
  );
  const outflow = walletTransactions.reduce(
    (sum, tx) => sum + (tx.from === selected ? parseNumeric(tx.amount) : 0),
    0,
  );
  const netFlow = inflow - outflow;
  const txCount = walletTransactions.length;
  const avgValue = txCount > 0 ? (inflow + outflow) / txCount : 0;
  const totalFees = walletTransactions.reduce((sum, tx) => sum + parseNumeric(tx.fee), 0);
  const firstActivity = walletTransactions.at(-1)?.timestamp ?? "--";
  const latestActivity = walletTransactions[0]?.timestamp ?? "--";
  const recentTransactions = walletTransactions.slice(0, 12);
  const sidebarTitle = showAggregateEntityDetails
    ? top24hEntityDetails?.kind === "tier"
      ? "Tier Details"
      : "Exchange Details"
    : "Wallet Details";

  if (!expanded) {
    return (
      <div className="h-full w-[52px] self-stretch bg-card/60 backdrop-blur-sm border border-border/60 rounded-xl p-2">
        <button
          type="button"
          onClick={() => onExpandedChange(true)}
          className="w-full h-10 inline-flex items-center justify-center rounded-md border border-border/40 bg-card/50 text-muted-foreground transition-colors hover:text-primary"
          aria-label="Expand wallet details"
          title="Expand wallet details"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="h-full w-[280px] self-stretch bg-card/60 backdrop-blur-sm border border-border/60 rounded-xl p-4 space-y-4 overflow-y-auto">
      <div className="flex items-center gap-2 pb-2 border-b border-border/50">
        <Wallet className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm">{sidebarTitle}</h3>
        <button
          type="button"
          onClick={() => onExpandedChange(false)}
          className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded border border-border/40 bg-card/50 text-muted-foreground transition-colors hover:text-primary"
          aria-label="Collapse wallet details"
          title="Collapse wallet details"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {hasSelection ? (
        showAggregateEntityDetails && top24hEntityDetails ? (
          <>
            <div className="p-4 bg-gradient-to-br from-primary/10 to-accent/5 rounded-lg border border-primary/20">
              <p className="text-xs text-muted-foreground mb-1">
                {top24hEntityDetails.kind === "tier" ? "Selected Tier" : "Selected Exchange"}
              </p>
              <p className="text-sm font-semibold text-primary break-all">
                {top24hEntityDetails.displayName}
              </p>
            </div>

            {top24hEntityDetails.kind === "tier" && top24hEntityDetails.tier ? (
              <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-500/30">
                <p className="text-xs text-amber-300/90 mb-1">Tier Definition</p>
                <p className="text-sm font-semibold text-amber-200">
                  {tierDescriptions[top24hEntityDetails.tier]}
                </p>
              </div>
            ) : null}

            <div className="p-4 bg-secondary/30 rounded-lg border border-border/30 space-y-1">
              <p className="text-xs text-muted-foreground">Net Flow (24H Edges)</p>
              <p
                className={`text-2xl font-bold ${
                  top24hEntityDetails.netFlow >= 0 ? "text-success" : "text-destructive"
                }`}
              >
                {top24hEntityDetails.netFlow >= 0 ? "+" : "-"}
                {Math.abs(top24hEntityDetails.netFlow).toFixed(2)} {tokenLabel}
              </p>
              <p className="text-xs text-muted-foreground">
                Across {top24hEntityDetails.txCount} transfers in {top24hEntityDetails.edgeCount}{" "}
                edges
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-success/10 rounded-lg border border-success/20">
                <div className="flex items-center gap-2 mb-1">
                  <ArrowDownLeft className="w-3.5 h-3.5 text-success" />
                  <p className="text-xs text-muted-foreground">Inflow</p>
                </div>
                <p className="text-lg font-bold text-success">
                  {top24hEntityDetails.inflow.toFixed(2)} {tokenLabel}
                </p>
              </div>

              <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                <div className="flex items-center gap-2 mb-1">
                  <ArrowUpRight className="w-3.5 h-3.5 text-destructive" />
                  <p className="text-xs text-muted-foreground">Outflow</p>
                </div>
                <p className="text-lg font-bold text-destructive">
                  {top24hEntityDetails.outflow.toFixed(2)} {tokenLabel}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">
                  {top24hEntityDetails.kind === "tier" ? "Top Exchanges" : "Top Tiers"}
                </p>
                <span className="text-xs text-muted-foreground">
                  {top24hEntityDetails.counterparties.length}
                </span>
              </div>
              <ScrollArea className="h-[280px] pr-3">
                <div className="space-y-2">
                  {top24hEntityDetails.counterparties.map((counterparty) => (
                    <div
                      key={counterparty.id}
                      className="p-3 bg-secondary/20 rounded-lg border border-border/20"
                    >
                      <p className="text-xs font-semibold break-all">{counterparty.displayName}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {counterparty.valueEth.toFixed(2)} {tokenLabel}
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onOpenWalletInExplorer(resolvedFullWallet)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-border/40 bg-card/50 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View In WhaleFlow Explorer
            </button>

            <div className="p-4 bg-gradient-to-br from-primary/10 to-accent/5 rounded-lg border border-primary/20">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">Active Wallet</p>
                <div className="flex items-center gap-1">
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-6 w-6 items-center justify-center rounded border border-border/40 bg-card/50 text-muted-foreground transition-colors hover:text-primary"
                    aria-label="View in explorer"
                    title="View in explorer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(resolvedFullWallet);
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1400);
                      } catch {
                        // Ignore clipboard failures.
                      }
                    }}
                    className="inline-flex h-6 w-6 items-center justify-center rounded border border-border/40 bg-card/50 text-muted-foreground transition-colors hover:text-primary"
                    aria-label="Copy wallet address"
                    title={copied ? "Copied" : "Copy address"}
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <p className="font-mono text-sm font-semibold text-primary break-all">
                {resolvedFullWallet}
              </p>
            </div>

            {distinctCexLabel ? (
              <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-500/30">
                <p className="text-xs text-amber-300/90 mb-1">Label</p>
                <p className="text-sm font-semibold text-amber-200 break-all">{distinctCexLabel}</p>
              </div>
            ) : null}

            <div className="p-4 bg-secondary/30 rounded-lg border border-border/30 space-y-1">
              <p className="text-xs text-muted-foreground">Net Flow</p>
              <p
                className={`text-2xl font-bold ${netFlow >= 0 ? "text-success" : "text-destructive"}`}
              >
                {netFlow >= 0 ? "+" : "-"}
                {Math.abs(netFlow).toFixed(2)} {tokenLabel}
              </p>
              <p className="text-xs text-muted-foreground">Across {txCount} matched transactions</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-success/10 rounded-lg border border-success/20">
                <div className="flex items-center gap-2 mb-1">
                  <ArrowDownLeft className="w-3.5 h-3.5 text-success" />
                  <p className="text-xs text-muted-foreground">Inflow</p>
                </div>
                <p className="text-lg font-bold text-success">
                  {inflow.toFixed(2)} {tokenLabel}
                </p>
              </div>

              <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                <div className="flex items-center gap-2 mb-1">
                  <ArrowUpRight className="w-3.5 h-3.5 text-destructive" />
                  <p className="text-xs text-muted-foreground">Outflow</p>
                </div>
                <p className="text-lg font-bold text-destructive">
                  {outflow.toFixed(2)} {tokenLabel}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2 bg-secondary/20 rounded border border-border/20">
                <p className="text-muted-foreground mb-0.5">First Seen</p>
                <p className="font-semibold font-mono">{firstActivity}</p>
              </div>
              <div className="p-2 bg-secondary/20 rounded border border-border/20">
                <p className="text-muted-foreground mb-0.5">Latest</p>
                <p className="font-semibold font-mono">{latestActivity}</p>
              </div>
              <div className="p-2 bg-secondary/20 rounded border border-border/20">
                <p className="text-muted-foreground mb-0.5">Avg Value</p>
                <p className="font-semibold">
                  {avgValue.toFixed(2)} {tokenLabel}
                </p>
              </div>
              <div className="p-2 bg-secondary/20 rounded border border-border/20">
                <p className="text-muted-foreground mb-0.5">Total Fees</p>
                <p className="font-semibold inline-flex items-center gap-1">
                  <Fuel className="w-3 h-3" />
                  {totalFees.toFixed(4)}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Recent Activity</p>
                <span className="text-xs text-muted-foreground">
                  {recentTransactions.length} txs
                </span>
              </div>

              <ScrollArea className="h-[280px] pr-3">
                <div className="space-y-2">
                  {recentTransactions.map((tx) => {
                    const direction: "inflow" | "outflow" =
                      tx.to === selected ? "inflow" : "outflow";
                    return (
                      <div
                        key={tx.id}
                        className="p-3 bg-secondary/20 hover:bg-secondary/40 rounded-lg border border-border/20 transition-all"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {direction === "inflow" ? (
                              <TrendingDown className="w-3.5 h-3.5 text-success" />
                            ) : (
                              <TrendingUp className="w-3.5 h-3.5 text-destructive" />
                            )}
                            <span
                              className={`text-sm font-bold ${
                                direction === "inflow" ? "text-success" : "text-destructive"
                              }`}
                            >
                              {direction === "inflow" ? "+" : "-"}
                              {tx.amount} {tokenLabel}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">{tx.timestamp}</span>
                        </div>
                        <p className="text-xs font-mono text-muted-foreground">{tx.hash}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          From:{" "}
                          <button
                            type="button"
                            onClick={() => onWalletSelect(tx.from)}
                            className="font-mono hover:text-primary transition-colors"
                          >
                            {tx.from}
                          </button>
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          To:{" "}
                          <button
                            type="button"
                            onClick={() => onWalletSelect(tx.to)}
                            className="font-mono hover:text-primary transition-colors"
                          >
                            {tx.to}
                          </button>
                        </p>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </>
        )
      ) : (
        <div className="p-4 min-h-[220px] grid place-items-center bg-secondary/30 rounded-lg border border-border/30 text-sm text-muted-foreground text-center">
          {feedMode === "top24h"
            ? "Select an exchange or tier node from the 24H network graph."
            : "Select a wallet by clicking a graph node or any `From` / `To` address in the live feed."}
        </div>
      )}
    </div>
  );
}
