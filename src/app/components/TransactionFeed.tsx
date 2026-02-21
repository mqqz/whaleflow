import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Fuel,
  Layers,
  Pause,
  Play,
  SlidersHorizontal,
  TimerReset,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ReactNode } from "react";
import { ConnectionStatus, LiveTransaction } from "../hooks/useLiveTransactions";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { MonitorEdgeFeedRow, MonitorFeedMode } from "../hooks/useMonitorModel";

interface TransactionFeedProps {
  network: string;
  token: string;
  minAmount: number;
  status: ConnectionStatus;
  transactions: LiveTransaction[];
  feedMode: MonitorFeedMode;
  feedTitle: string;
  feedSubtitle: string;
  edgeRows: MonitorEdgeFeedRow[];
  pauseStream: boolean;
  slowMode: boolean;
  onPauseStreamChange: (value: boolean) => void;
  onSlowModeChange: (value: boolean) => void;
  controlsOpen: boolean;
  onControlsOpenChange: (open: boolean) => void;
  selectedWallet: string | null;
  onWalletSelect: (wallet: string) => void;
  controlsPanel?: ReactNode;
}

const statusUi: Record<
  ConnectionStatus,
  { title: string; dotClass: string; animateClass: string }
> = {
  connecting: {
    title: "Connecting",
    dotClass: "bg-amber-500",
    animateClass: "animate-pulse",
  },
  live: {
    title: "Live",
    dotClass: "bg-success",
    animateClass: "animate-pulse",
  },
  reconnecting: {
    title: "Reconnecting",
    dotClass: "bg-amber-500",
    animateClass: "animate-pulse",
  },
  error: {
    title: "Disconnected",
    dotClass: "bg-destructive",
    animateClass: "",
  },
};

const tokenLabels: Record<string, string> = {
  btc: "BTC",
  eth: "ETH",
};

export function TransactionFeed({
  network,
  token,
  minAmount,
  status,
  transactions,
  feedMode,
  feedTitle,
  feedSubtitle,
  edgeRows,
  pauseStream,
  slowMode,
  onPauseStreamChange,
  onSlowModeChange,
  controlsOpen,
  onControlsOpenChange,
  selectedWallet,
  onWalletSelect,
  controlsPanel,
}: TransactionFeedProps) {
  const upperNetwork = network.toUpperCase();
  const tokenLabel = tokenLabels[token] ?? token.toUpperCase();
  const statusMeta =
    feedMode === "live"
      ? pauseStream
        ? {
            title: "Paused",
            dotClass: "bg-amber-500",
            animateClass: "",
          }
        : statusUi[status]
      : {
          title: "Snapshot",
          dotClass: "bg-blue-500",
          animateClass: "",
        };

  return (
    <div className="bg-card/60 backdrop-blur-sm border border-border/60 rounded-xl min-h-[calc(100dvh-4rem-420px-1.5rem)]">
      <Collapsible open={controlsOpen} onOpenChange={onControlsOpenChange}>
        <div className="flex flex-col min-h-full">
          <div className="flex items-center justify-between px-6 py-3 border-b border-border/50 text-sm">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base">{feedTitle}</h3>
              <div className="ml-2 inline-flex items-center gap-0.5">
                <div className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span
                    className={`w-2 h-2 rounded-full ${statusMeta.dotClass} ${statusMeta.animateClass}`}
                  />
                  <span>{statusMeta.title}</span>
                </div>
                {feedMode === "live" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onPauseStreamChange(!pauseStream)}
                    aria-pressed={pauseStream}
                    className={`h-7 w-7 rounded-full ${
                      pauseStream
                        ? "text-success hover:text-success"
                        : "text-amber-500 hover:text-amber-500"
                    }`}
                  >
                    {pauseStream ? (
                      <Play className="w-3.5 h-3.5" />
                    ) : (
                      <Pause className="w-3.5 h-3.5" />
                    )}
                  </Button>
                ) : null}
              </div>
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
                      <div className="flex items-start gap-4 p-3 bg-secondary/20 hover:bg-secondary/35 rounded-lg border border-border/20 transition-all">
                        <div className="w-[120px]">
                          <p className="text-xs text-muted-foreground mb-0.5">Time</p>
                          <p className="text-xs font-mono">{row.timeLabel}</p>
                        </div>

                        <div className="flex-1">
                          <p className="text-xs text-muted-foreground mb-0.5">Route</p>
                          <div className="flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => onWalletSelect(row.src)}
                              className="font-semibold text-amber-400 hover:text-amber-300"
                            >
                              {row.srcLabel}
                            </button>
                            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            <button
                              type="button"
                              onClick={() => onWalletSelect(row.dst)}
                              className="font-semibold text-amber-400 hover:text-amber-300"
                            >
                              {row.dstLabel}
                            </button>
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground font-mono">
                            {row.src} {"->"} {row.dst}
                          </div>
                        </div>

                        <div className="w-[140px] text-right">
                          <p className="text-xs text-muted-foreground mb-0.5">ETH Value</p>
                          <p className="text-sm font-bold text-primary">
                            {row.valueEth.toFixed(2)} ETH
                          </p>
                        </div>

                        <div className="w-[90px] text-right">
                          <p className="text-xs text-muted-foreground mb-0.5">Tx Count</p>
                          <p className="text-sm font-semibold">{row.txCount}</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )
            ) : transactions.length === 0 ? (
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
                {transactions.map((tx) => (
                  <motion.div
                    key={tx.id}
                    initial={{ x: 100, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -100, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="mb-2"
                  >
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
                          {tx.toLabel ? (
                            <span className="ml-1 inline-flex items-center rounded border border-amber-500/30 bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
                              {tx.toLabel}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="w-[120px] text-right">
                        <p className="text-xs text-muted-foreground mb-0.5">Amount</p>
                        <p
                          className={`text-sm font-bold ${
                            tx.type === "inflow" ? "text-success" : "text-destructive"
                          }`}
                        >
                          {tx.type === "inflow" ? "+" : "-"}
                          {tx.amount} {tokenLabel}
                        </p>
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
