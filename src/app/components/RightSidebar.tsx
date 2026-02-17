import { ArrowDownLeft, ArrowUpRight, Shield, Wallet, TrendingUp, TrendingDown } from "lucide-react";
import { Progress } from "./ui/progress";
import { ScrollArea } from "./ui/scroll-area";

interface Transaction {
  hash: string;
  type: "inflow" | "outflow";
  amount: string;
  time: string;
  from?: string;
  to?: string;
}

const mockTransactions: Transaction[] = [
  { hash: "0x7f3a...9d2c", type: "inflow", amount: "45.2", time: "2s ago", from: "0xB12C...3A45" },
  { hash: "0x8e4b...1a3d", type: "outflow", amount: "12.8", time: "8s ago", to: "0xC89D...6F12" },
  { hash: "0x9f5c...2b4e", type: "inflow", amount: "120.5", time: "15s ago", from: "0xD45E...8C34" },
  { hash: "0xa06d...3c5f", type: "outflow", amount: "8.3", time: "23s ago", to: "0xE67F...9D56" },
  { hash: "0xb17e...4d6a", type: "inflow", amount: "67.9", time: "31s ago", from: "0xF89A...1E78" },
  { hash: "0xc28f...5e7b", type: "outflow", amount: "34.1", time: "45s ago", to: "0xG12B...2F90" },
  { hash: "0xd39a...6f8c", type: "inflow", amount: "92.4", time: "52s ago", from: "0xH34C...3G01" },
  { hash: "0xe4ab...7a9d", type: "outflow", amount: "21.6", time: "1m ago", to: "0xI56D...4H23" },
];

export function RightSidebar() {
  const riskScore = 32;

  return (
    <div className="w-[280px] bg-card/60 backdrop-blur-sm border-l border-border p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-border/50">
        <Wallet className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm">Wallet Details</h3>
      </div>

      {/* Wallet Address */}
      <div className="p-4 bg-gradient-to-br from-primary/10 to-accent/5 rounded-lg border border-primary/20">
        <p className="text-xs text-muted-foreground mb-1">Active Wallet</p>
        <p className="font-mono text-sm font-semibold text-primary">0xA34F...7B21</p>
      </div>

      {/* Balance */}
      <div className="p-4 bg-secondary/30 rounded-lg border border-border/30 space-y-1">
        <p className="text-xs text-muted-foreground">Total Balance</p>
        <p className="text-2xl font-bold">450.75 ETH</p>
        <p className="text-xs text-success">≈ $1,847,275 USD</p>
      </div>

      {/* Flow Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-success/10 rounded-lg border border-success/20">
          <div className="flex items-center gap-2 mb-1">
            <ArrowDownLeft className="w-3.5 h-3.5 text-success" />
            <p className="text-xs text-muted-foreground">Total Inflow</p>
          </div>
          <p className="text-lg font-bold text-success">234.8 ETH</p>
        </div>

        <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
          <div className="flex items-center gap-2 mb-1">
            <ArrowUpRight className="w-3.5 h-3.5 text-destructive" />
            <p className="text-xs text-muted-foreground">Total Outflow</p>
          </div>
          <p className="text-lg font-bold text-destructive">156.2 ETH</p>
        </div>
      </div>

      {/* Risk Score */}
      <div className="p-4 bg-secondary/30 rounded-lg border border-border/30 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-success" />
            <p className="text-sm font-medium">Risk Score</p>
          </div>
          <span className="text-sm font-bold text-success">{riskScore}/100</span>
        </div>
        <Progress value={riskScore} className="h-2" />
        <p className="text-xs text-muted-foreground">Low risk - Verified wallet</p>
      </div>

      {/* Activity Stats */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="p-2 bg-secondary/20 rounded border border-border/20">
          <p className="text-muted-foreground mb-0.5">First Activity</p>
          <p className="font-semibold">Mar 2023</p>
        </div>
        <div className="p-2 bg-secondary/20 rounded border border-border/20">
          <p className="text-muted-foreground mb-0.5">Total Txs</p>
          <p className="font-semibold">1,847</p>
        </div>
        <div className="p-2 bg-secondary/20 rounded border border-border/20">
          <p className="text-muted-foreground mb-0.5">Avg Value</p>
          <p className="font-semibold">45.2 ETH</p>
        </div>
        <div className="p-2 bg-secondary/20 rounded border border-border/20">
          <p className="text-muted-foreground mb-0.5">Gas Spent</p>
          <p className="font-semibold">2.4 ETH</p>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Recent Activity</p>
          <span className="text-xs text-muted-foreground">{mockTransactions.length} txs</span>
        </div>

        <ScrollArea className="h-[280px] pr-3">
          <div className="space-y-2">
            {mockTransactions.map((tx, index) => (
              <div
                key={index}
                className="p-3 bg-secondary/20 hover:bg-secondary/40 rounded-lg border border-border/20 transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {tx.type === "inflow" ? (
                      <TrendingDown className="w-3.5 h-3.5 text-success" />
                    ) : (
                      <TrendingUp className="w-3.5 h-3.5 text-destructive" />
                    )}
                    <span className={`text-sm font-bold ${
                      tx.type === "inflow" ? "text-success" : "text-destructive"
                    }`}>
                      {tx.type === "inflow" ? "+" : "-"}{tx.amount} ETH
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">{tx.time}</span>
                </div>
                <p className="text-xs font-mono text-muted-foreground group-hover:text-foreground transition-colors">
                  {tx.hash}
                </p>
                {tx.from && (
                  <p className="text-xs text-muted-foreground mt-1">
                    From: <span className="font-mono">{tx.from}</span>
                  </p>
                )}
                {tx.to && (
                  <p className="text-xs text-muted-foreground mt-1">
                    To: <span className="font-mono">{tx.to}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}