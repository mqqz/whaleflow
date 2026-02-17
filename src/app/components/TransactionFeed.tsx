import { useEffect, useState } from "react";
import { ArrowRight, Fuel } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Transaction {
  id: string;
  hash: string;
  from: string;
  to: string;
  amount: string;
  type: "inflow" | "outflow";
  gas: string;
  block: number;
  timestamp: string;
}

const generateMockTransaction = (): Transaction => {
  const types: ("inflow" | "outflow")[] = ["inflow", "outflow"];
  const type = types[Math.floor(Math.random() * types.length)];
  
  return {
    id: Math.random().toString(36).substring(7),
    hash: `0x${Math.random().toString(16).substring(2, 10)}...${Math.random().toString(16).substring(2, 6)}`,
    from: `0x${Math.random().toString(16).substring(2, 6)}...${Math.random().toString(16).substring(2, 6)}`,
    to: `0x${Math.random().toString(16).substring(2, 6)}...${Math.random().toString(16).substring(2, 6)}`,
    amount: (Math.random() * 500 + 1).toFixed(2),
    type,
    gas: (Math.random() * 0.1).toFixed(4),
    block: Math.floor(Math.random() * 100000) + 19000000,
    timestamp: new Date().toLocaleTimeString(),
  };
};

export function TransactionFeed() {
  const [transactions, setTransactions] = useState<Transaction[]>([
    generateMockTransaction(),
    generateMockTransaction(),
    generateMockTransaction(),
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTransactions((prev) => {
        const newTx = generateMockTransaction();
        return [newTx, ...prev.slice(0, 9)]; // Keep last 10 transactions
      });
    }, 3000); // New transaction every 3 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-[200px] bg-card/60 backdrop-blur-sm border-t border-border">
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
            <h3 className="font-semibold">Live Transaction Feed</h3>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-success" />
              <span>Inflow</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-destructive" />
              <span>Outflow</span>
            </div>
          </div>
        </div>

        {/* Transaction List */}
        <div className="flex-1 overflow-hidden px-6 py-2">
          <AnimatePresence mode="popLayout">
            {transactions.map((tx) => (
              <motion.div
                key={tx.id}
                initial={{ x: 100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -100, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="mb-2"
              >
                <div className="flex items-start gap-4 p-3 bg-secondary/20 hover:bg-secondary/40 rounded-lg border border-border/20 transition-all group cursor-pointer">
                  {/* Transaction Hash */}
                  <div className="w-[140px]">
                    <p className="text-xs text-muted-foreground mb-0.5">Hash</p>
                    <p className="text-xs font-mono font-semibold group-hover:text-primary transition-colors">
                      {tx.hash}
                    </p>
                  </div>

                  {/* From -> To */}
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

                  {/* Amount */}
                  <div className="w-[120px] text-right">
                    <p className="text-xs text-muted-foreground mb-0.5">Amount</p>
                    <p className={`text-sm font-bold ${
                      tx.type === "inflow" ? "text-success" : "text-destructive"
                    }`}>
                      {tx.type === "inflow" ? "+" : "-"}{tx.amount} ETH
                    </p>
                  </div>

                  {/* Gas */}
                  <div className="w-[100px]">
                    <p className="text-xs text-muted-foreground mb-0.5">Gas Fee</p>
                    <div className="flex items-center gap-1">
                      <Fuel className="w-3 h-3 text-muted-foreground" />
                      <p className="text-xs font-mono">{tx.gas} ETH</p>
                    </div>
                  </div>

                  {/* Block */}
                  <div className="w-[100px]">
                    <p className="text-xs text-muted-foreground mb-0.5">Block</p>
                    <p className="text-xs font-mono">#{tx.block}</p>
                  </div>

                  {/* Time */}
                  <div className="w-[100px] text-right">
                    <p className="text-xs text-muted-foreground mb-0.5">Time</p>
                    <p className="text-xs font-mono">{tx.timestamp}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}