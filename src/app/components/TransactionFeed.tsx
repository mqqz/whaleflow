import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Fuel,
  Icon,
  Layers,
  SlidersHorizontal,
  TimerReset,
} from "lucide-react";
import { whale } from "@lucide/lab";
import { motion, AnimatePresence } from "motion/react";
import { ReactNode } from "react";
import { ConnectionStatus, LiveTransaction } from "../hooks/useLiveTransactions";
import { Switch } from "./ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { MonitorEdgeFeedRow, MonitorFeedMode } from "../hooks/useMonitorModel";

interface TransactionFeedProps {
  network: string;
  token: string;
  minAmount: number;
  transactions: LiveTransaction[];
  maxVisible: number;
  feedMode: MonitorFeedMode;
  feedTitle: string;
  feedSubtitle: string;
  edgeRows: MonitorEdgeFeedRow[];
  pauseStream: boolean;
  status: ConnectionStatus;
  slowMode: boolean;
  onSlowModeChange: (value: boolean) => void;
  controlsOpen: boolean;
  onControlsOpenChange: (open: boolean) => void;
  selectedWallet: string | null;
  onWalletSelect: (wallet: string) => void;
  controlsPanel?: ReactNode;
}

const tokenLabels: Record<string, string> = {
  btc: "BTC",
  eth: "ETH",
};

const shortAddress = (address: string) => {
  if (address.length <= 12) {
    return address;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const shortEventId = (id: string) => {
  if (id.length <= 20) {
    return id;
  }
  return `${id.slice(0, 10)}...${id.slice(-6)}`;
};
const WHALE_THRESHOLD = 100;
const TIER_EMOJI: Record<string, string> = {
  shrimp: "🦐",
  dolphin: "🐬",
  shark: "🦈",
  whale: "🐋",
};
const TIER_PLURAL: Record<string, string> = {
  shrimp: "shrimps",
  dolphin: "dolphins",
  shark: "sharks",
  whale: "whales",
};

const getTierName = (value: string, label: string) => {
  const normalizedValue = value.trim().toLowerCase();
  const normalizedLabel = label.trim().toLowerCase();
  if (TIER_EMOJI[normalizedValue]) {
    return normalizedValue;
  }
  if (TIER_EMOJI[normalizedLabel]) {
    return normalizedLabel;
  }
  return null;
};

const withTierEmoji = (value: string, label: string) => {
  const tier = getTierName(value, label);
  if (!tier) {
    return value;
  }
  return `${TIER_PLURAL[tier] ?? value} ${TIER_EMOJI[tier]}`;
};

const isCexLabel = (value: string, label: string) =>
  label !== "unlabeled" && !getTierName(value, label);

export function TransactionFeed({
  network,
  token,
  minAmount,
  transactions,
  maxVisible,
  feedMode,
  feedTitle,
  feedSubtitle,
  edgeRows,
  pauseStream,
  status,
  slowMode,
  onSlowModeChange,
  controlsOpen,
  onControlsOpenChange,
  selectedWallet,
  onWalletSelect,
  controlsPanel,
}: TransactionFeedProps) {
  const upperNetwork = network.toUpperCase();
  const tokenLabel = tokenLabels[token] ?? token.toUpperCase();
  const visibleTransactions = transactions.slice(0, maxVisible);

  return (
    <div className="bg-card/60 backdrop-blur-sm border border-border/60 rounded-xl min-h-[calc(100dvh-4rem-420px-1.5rem)]">
      <Collapsible open={controlsOpen} onOpenChange={onControlsOpenChange}>
        <div className="flex flex-col min-h-full">
          <div className="flex items-center justify-between px-6 py-3 border-b border-border/50 text-sm">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base">{feedTitle}</h3>
              <p className="ml-2 text-xs text-muted-foreground">{feedSubtitle}</p>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {feedMode === "live" ? (
                <>
                  <span>{upperNetwork}</span>
                  <span>
                    ≥ {minAmount.toFixed(minAmount < 10 ? 1 : 0)} {tokenLabel}
                  </span>
                  <label className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <TimerReset className="w-3.5 h-3.5" />
                    <Switch
                      checked={slowMode}
                      onCheckedChange={(checked) => onSlowModeChange(Boolean(checked))}
                    />
                  </label>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Toggle feed controls"
                    >
                      <SlidersHorizontal className="w-4 h-4" />
                      {controlsOpen ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </CollapsibleTrigger>
                </>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Layers className="w-3.5 h-3.5" />
                  Exchange-labeled edges
                </span>
              )}
            </div>
          </div>

          {controlsPanel && feedMode === "live" ? (
            <CollapsibleContent className="px-6 py-3 border-b border-border/50">
              {controlsPanel}
            </CollapsibleContent>
          ) : null}

          <div className="px-6 py-2">
            {feedMode === "top24h" ? (
              edgeRows.length === 0 ? (
                <div className="min-h-[220px] flex items-center justify-center">
                  <div className="text-sm text-muted-foreground text-center">
                    No exchange transfer rows available for this token.
                  </div>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {edgeRows.map((row) => (
                    <motion.div
                      key={row.id}
                      initial={{ x: 40, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: -40, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="mb-2"
                    >
                      {/** Top-24h rows use aggregated ETH value as the whale heuristic. */}
                      {(() => {
                        const isWhale = row.valueEth >= WHALE_THRESHOLD;
                        return (
                          <div className="flex items-start gap-4 p-3 bg-secondary/20 hover:bg-secondary/35 rounded-lg border border-border/20 transition-all">
                            <div className="w-[140px]">
                              <p className="text-xs text-muted-foreground mb-0.5">Event</p>
                              <p className="text-xs font-mono font-semibold group-hover:text-primary transition-colors">
                                {shortEventId(row.id)}
                              </p>
                            </div>

                            <div className="flex-1 flex items-center gap-2">
                              <div className="flex-1">
                                <p className="text-xs text-muted-foreground mb-0.5">From</p>
                                {(() => {
                                  const base = withTierEmoji(shortAddress(row.src), row.srcLabel);
                                  const cex = isCexLabel(row.src, row.srcLabel);
                                  const hideBase = cex;
                                  return (
                                    <>
                                      {hideBase ? null : (
                                        <span className="text-xs font-mono text-foreground">
                                          {base}
                                        </span>
                                      )}
                                      {cex ? (
                                        <span className="ml-1 text-xs font-medium uppercase tracking-wide text-amber-400">
                                          {row.srcLabel}
                                        </span>
                                      ) : null}
                                    </>
                                  );
                                })()}
                                {isWhale && row.srcLabel === "unlabeled" ? (
                                  <span
                                    className="ml-1 inline-flex items-center rounded border border-rose-500/30 bg-rose-500/12 px-1 py-0.5 text-[10px] font-medium text-rose-300"
                                    title="Whale-sized transfer"
                                  >
                                    <Icon iconNode={whale} className="h-3 w-3" />
                                  </span>
                                ) : null}
                              </div>
                              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                              <div className="flex-1">
                                <p className="text-xs text-muted-foreground mb-0.5">To</p>
                                {(() => {
                                  const base = withTierEmoji(shortAddress(row.dst), row.dstLabel);
                                  const cex = isCexLabel(row.dst, row.dstLabel);
                                  const hideBase = cex;
                                  return (
                                    <>
                                      {hideBase ? null : (
                                        <span className="text-xs font-mono text-foreground">
                                          {base}
                                        </span>
                                      )}
                                      {cex ? (
                                        <span className="ml-1 text-xs font-medium uppercase tracking-wide text-amber-400">
                                          {row.dstLabel}
                                        </span>
                                      ) : null}
                                    </>
                                  );
                                })()}
                                {isWhale && row.dstLabel === "unlabeled" ? (
                                  <span
                                    className="ml-1 inline-flex items-center rounded border border-rose-500/30 bg-rose-500/12 px-1 py-0.5 text-[10px] font-medium text-rose-300"
                                    title="Whale-sized transfer"
                                  >
                                    <Icon iconNode={whale} className="h-3 w-3" />
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="w-[120px] text-right">
                              <p className="text-xs text-muted-foreground mb-0.5">Amount</p>
                              <p
                                className={`text-sm font-bold ${
                                  row.dstLabel !== "unlabeled" && row.srcLabel === "unlabeled"
                                    ? "text-success"
                                    : row.srcLabel !== "unlabeled" && row.dstLabel === "unlabeled"
                                      ? "text-destructive"
                                      : "text-primary"
                                }`}
                              >
                                {row.dstLabel !== "unlabeled" && row.srcLabel === "unlabeled"
                                  ? "+"
                                  : row.srcLabel !== "unlabeled" && row.dstLabel === "unlabeled"
                                    ? "-"
                                    : ""}
                                {row.valueEth.toFixed(row.valueEth < 1 ? 4 : 2)} {tokenLabel}
                              </p>
                            </div>

                            <div className="w-[90px] text-right">
                              <p className="text-xs text-muted-foreground mb-0.5">Tx Count</p>
                              <p className="text-sm font-semibold">{row.txCount}</p>
                            </div>

                            <div className="w-[90px] text-right">
                              <p className="text-xs text-muted-foreground mb-0.5">Time</p>
                              <p className="text-xs font-mono">{row.timeLabel}</p>
                            </div>
                          </div>
                        );
                      })()}
                    </motion.div>
                  ))}
                </AnimatePresence>
              )
            ) : visibleTransactions.length === 0 ? (
              <div className="min-h-[220px] flex items-center justify-center">
                <div className="text-sm text-muted-foreground text-center">
                  {pauseStream ? (
                    "Stream paused"
                  ) : status === "error" ? (
                    "Connection issue. Reconnecting automatically..."
                  ) : (
                    <span className="inline-flex items-center gap-0.5">
                      <span>Waiting for transactions to come in</span>
                      <span className="inline-flex">
                        <span className="animate-pulse [animation-delay:0ms]">.</span>
                        <span className="animate-pulse [animation-delay:180ms]">.</span>
                        <span className="animate-pulse [animation-delay:360ms]">.</span>
                      </span>
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {visibleTransactions.map((tx) => (
                  <motion.div
                    key={tx.id}
                    initial={{ x: 100, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -100, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="mb-2"
                  >
                    {/** Live rows use per-transaction amount as the whale heuristic. */}
                    {(() => {
                      return (
                        <div className="flex items-start gap-4 p-3 bg-secondary/20 hover:bg-secondary/40 rounded-lg border border-border/20 transition-all group cursor-pointer">
                          <div className="w-[140px]">
                            <p className="text-xs text-muted-foreground mb-0.5">Event</p>
                            <p className="text-xs font-mono font-semibold group-hover:text-primary transition-colors">
                              {tx.hash}
                            </p>
                          </div>

                          <div className="flex-1 flex items-center gap-2">
                            <div className="flex-1">
                              <p className="text-xs text-muted-foreground mb-0.5">From</p>
                              <button
                                type="button"
                                onClick={() => onWalletSelect(tx.from)}
                                className={`text-xs font-mono rounded px-1 -mx-1 transition-colors ${
                                  tx.fromLabel
                                    ? selectedWallet === tx.from
                                      ? "text-amber-300 bg-amber-500/15"
                                      : "text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                                    : selectedWallet === tx.from
                                      ? "text-primary bg-primary/15"
                                      : "hover:text-primary hover:bg-primary/10"
                                }`}
                              >
                                {tx.from}
                              </button>
                              {tx.fromLabel ? (
                                <span className="ml-1 inline-flex items-center rounded border border-amber-500/30 bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
                                  {tx.fromLabel}
                                </span>
                              ) : null}
                            </div>
                            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-xs text-muted-foreground mb-0.5">To</p>
                              {tx.to === "contract creation" ? (
                                <span className="text-xs font-mono text-muted-foreground">
                                  {tx.to}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => onWalletSelect(tx.to)}
                                  className={`text-xs font-mono rounded px-1 -mx-1 transition-colors ${
                                    tx.toLabel
                                      ? selectedWallet === tx.to
                                        ? "text-amber-300 bg-amber-500/15"
                                        : "text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                                      : selectedWallet === tx.to
                                        ? "text-primary bg-primary/15"
                                        : "hover:text-primary hover:bg-primary/10"
                                  }`}
                                >
                                  {tx.to}
                                </button>
                              )}
                              {tx.toLabel ? (
                                <span className="ml-1 inline-flex items-center rounded border border-amber-500/30 bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
                                  {tx.toLabel}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="w-[120px] text-right">
                            <p className="text-xs text-muted-foreground mb-0.5">Amount</p>
                            {(() => {
                              const nonContributingFlow =
                                (!tx.fromLabel && !tx.toLabel) ||
                                (Boolean(tx.fromLabel) && Boolean(tx.toLabel));
                              const amountClass = nonContributingFlow
                                ? "text-primary"
                                : tx.type === "inflow"
                                  ? "text-success"
                                  : "text-destructive";
                              const amountPrefix = nonContributingFlow
                                ? ""
                                : tx.type === "inflow"
                                  ? "+"
                                  : "-";
                              return (
                                <p className={`text-sm font-bold ${amountClass}`}>
                                  {amountPrefix}
                                  {tx.amount} {tokenLabel}
                                </p>
                              );
                            })()}
                          </div>

                          <div className="w-[120px]">
                            <p className="text-xs text-muted-foreground mb-0.5">Gas Fee</p>
                            <div className="flex items-center gap-1">
                              <Fuel className="w-3 h-3 text-muted-foreground" />
                              <p className="text-xs font-mono">{tx.fee}</p>
                            </div>
                          </div>

                          <div className="w-[90px]">
                            <p className="text-xs text-muted-foreground mb-0.5">Block</p>
                            <p className="text-xs font-mono">
                              {tx.block > 0 ? `#${tx.block}` : "pending"}
                            </p>
                          </div>

                          <div className="w-[90px] text-right">
                            <p className="text-xs text-muted-foreground mb-0.5">Time</p>
                            <p className="text-xs font-mono">{tx.timestamp}</p>
                          </div>
                        </div>
                      );
                    })()}
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>
      </Collapsible>
    </div>
  );
}
