import { ArrowDownLeft, ArrowUpRight, Fuel, Wallet, TrendingUp, TrendingDown } from "lucide-react";
import { ScrollArea } from "./ui/scroll-area";
import { LiveTransaction } from "../hooks/useLiveTransactions";

interface RightSidebarProps {
  token: string;
  selectedWallet: string | null;
  transactions: LiveTransaction[];
  onWalletSelect: (wallet: string) => void;
}

const tokenLabels: Record<string, string> = {
  btc: "BTC",
  eth: "ETH",
  sol: "SOL",
  bnb: "BNB",
  xrp: "XRP",
};

const parseNumeric = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function RightSidebar({
  token,
  selectedWallet,
  transactions,
  onWalletSelect,
}: RightSidebarProps) {
  const tokenLabel = tokenLabels[token] ?? token.toUpperCase();
  const selected = selectedWallet?.trim() ?? "";
  const hasSelection = selected.length > 0;

  const walletTransactions = hasSelection
    ? transactions.filter((tx) => tx.from === selected || tx.to === selected)
    : [];

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

  return (
    <div className="w-[280px] self-stretch bg-card/60 backdrop-blur-sm border border-border/60 rounded-b-xl p-4 space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-border/50">
        <Wallet className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm">Wallet Details</h3>
      </div>

      {hasSelection ? (
        <>
          <div className="p-4 bg-gradient-to-br from-primary/10 to-accent/5 rounded-lg border border-primary/20">
            <p className="text-xs text-muted-foreground mb-1">Active Wallet</p>
            <p className="font-mono text-sm font-semibold text-primary break-all">{selected}</p>
          </div>

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
              <span className="text-xs text-muted-foreground">{recentTransactions.length} txs</span>
            </div>

            <ScrollArea className="h-[280px] pr-3">
              <div className="space-y-2">
                {recentTransactions.map((tx) => {
                  const direction: "inflow" | "outflow" = tx.to === selected ? "inflow" : "outflow";
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
      ) : (
        <div className="p-4 min-h-[220px] grid place-items-center bg-secondary/30 rounded-lg border border-border/30 text-sm text-muted-foreground text-center">
          Select a wallet by clicking a graph node or any `From` / `To` address in the live feed.
        </div>
      )}
    </div>
  );
}
