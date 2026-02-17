import { ArrowRight, ChevronDown, ChevronUp, Fuel, Pause, Play, SlidersHorizontal, TimerReset } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ReactNode } from "react";
import {
  ConnectionStatus,
  LiveTransaction,
} from "../hooks/useLiveTransactions";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";

interface TransactionFeedProps {
  network: string;
  token: string;
  minAmount: number;
  status: ConnectionStatus;
  transactions: LiveTransaction[];
  pauseStream: boolean;
  slowMode: boolean;
  onPauseStreamChange: (value: boolean) => void;
  onSlowModeChange: (value: boolean) => void;
  controlsOpen: boolean;
  onControlsOpenChange: (open: boolean) => void;
  controlsPanel?: ReactNode;
}

const statusText: Record<ConnectionStatus, string> = {
  connecting: "Connecting to websocket...",
  live: "Streaming live events",
  reconnecting: "Connection dropped, retrying...",
  error: "Socket error. Retrying automatically...",
};

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
  sol: "SOL",
  bnb: "BNB",
  xrp: "XRP",
};

export function TransactionFeed({
  network,
  token,
  minAmount,
  status,
  transactions,
  pauseStream,
  slowMode,
  onPauseStreamChange,
  onSlowModeChange,
  controlsOpen,
  onControlsOpenChange,
  controlsPanel,
}: TransactionFeedProps) {
  const upperNetwork = network.toUpperCase();
  const tokenLabel = tokenLabels[token] ?? token.toUpperCase();
  const statusMeta = pauseStream
    ? {
        title: "Paused",
        dotClass: "bg-amber-500",
        animateClass: "",
      }
    : statusUi[status];

  return (
    <div className="bg-card/60 backdrop-blur-sm border-t border-border">
      <Collapsible open={controlsOpen} onOpenChange={onControlsOpenChange}>
        <div className="flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 border-b border-border/50 text-sm">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-base">Transaction Feed</h3>
            <div className="ml-2 inline-flex items-center gap-0.5">
              <div className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <span className={`w-2 h-2 rounded-full ${statusMeta.dotClass} ${statusMeta.animateClass}`} />
                <span>{statusMeta.title}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onPauseStreamChange(!pauseStream)}
                aria-pressed={pauseStream}
                className={`h-7 w-7 rounded-full ${
                  pauseStream ? "text-success hover:text-success" : "text-amber-500 hover:text-amber-500"
                }`}
              >
                {pauseStream ? (
                  <Play className="w-3.5 h-3.5" />
                ) : (
                  <Pause className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{upperNetwork}</span>
            <span>≥ {minAmount.toFixed(minAmount < 10 ? 1 : 0)} {tokenLabel}</span>
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
          </div>
        </div>

        {controlsPanel ? (
          <CollapsibleContent className="px-6 py-3 border-b border-border/50">
            {controlsPanel}
          </CollapsibleContent>
        ) : null}

        <div className="px-6 py-2">
          {transactions.length === 0 ? (
            <div className="h-24 grid place-items-center text-sm text-muted-foreground">
              {statusText[status]}
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
                        <p className="text-xs font-mono">{tx.from}</p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground mb-0.5">To</p>
                        <p className="text-xs font-mono">{tx.to}</p>
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
