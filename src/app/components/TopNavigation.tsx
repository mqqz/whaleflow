import { Search, Activity } from "lucide-react";
import { ConnectionStatus } from "../hooks/useLiveTransactions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Input } from "./ui/input";

interface TopNavigationProps {
  network: string;
  token: string;
  status: ConnectionStatus;
  onNetworkChange: (value: string) => void;
  onTokenChange: (value: string) => void;
}

const statusLabel: Record<ConnectionStatus, string> = {
  connecting: "CONNECTING",
  live: "LIVE",
  reconnecting: "RECONNECTING",
  error: "ERROR",
};

const statusColor: Record<ConnectionStatus, string> = {
  connecting: "bg-amber-500",
  live: "bg-success",
  reconnecting: "bg-amber-500",
  error: "bg-destructive",
};

const statusBadgeClass: Record<ConnectionStatus, string> = {
  connecting: "bg-amber-500/10 border-amber-500/30 text-amber-500",
  live: "bg-success/10 border-success/30 text-success",
  reconnecting: "bg-amber-500/10 border-amber-500/30 text-amber-500",
  error: "bg-destructive/10 border-destructive/30 text-destructive",
};

export function TopNavigation({
  network,
  token,
  status,
  onNetworkChange,
  onTokenChange,
}: TopNavigationProps) {
  return (
    <div className="fixed top-0 left-0 right-0 h-16 bg-card/80 backdrop-blur-xl border-b border-border z-50">
      <div className="flex items-center justify-between h-full px-6">
        {/* Logo */}
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <Activity className="w-7 h-7 text-primary" />
            <span className="text-xl font-semibold tracking-tight">WhaleFlow</span>
          </div>

          {/* Network Selector */}
          <Select value={network} onValueChange={onNetworkChange}>
            <SelectTrigger className="w-[140px] bg-secondary/50 border-border/50 hover:bg-secondary/70 transition-colors">
              <SelectValue placeholder="Network" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ethereum">Ethereum</SelectItem>
              <SelectItem value="bitcoin">Bitcoin</SelectItem>
              <SelectItem value="bsc">BSC</SelectItem>
              <SelectItem value="polygon">Polygon</SelectItem>
              <SelectItem value="arbitrum">Arbitrum</SelectItem>
            </SelectContent>
          </Select>

          {/* Token Selector */}
          <Select value={token} onValueChange={onTokenChange}>
            <SelectTrigger className="w-[140px] bg-secondary/50 border-border/50 hover:bg-secondary/70 transition-colors">
              <SelectValue placeholder="Token" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="btc">BTC</SelectItem>
              <SelectItem value="eth">ETH</SelectItem>
              <SelectItem value="sol">SOL</SelectItem>
              <SelectItem value="bnb">BNB</SelectItem>
              <SelectItem value="xrp">XRP</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          {/* Live Indicator */}
          <div className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg ${statusBadgeClass[status]}`}>
            <div className="relative">
              <div className={`w-2 h-2 rounded-full animate-pulse ${statusColor[status]}`} />
              {status !== "error" && (
                <div className={`absolute inset-0 w-2 h-2 rounded-full animate-ping ${statusColor[status]}`} />
              )}
            </div>
            <span className="text-xs font-semibold tracking-wider">{statusLabel[status]}</span>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search wallet address..."
              className="w-[280px] pl-9 bg-secondary/50 border-border/50 hover:bg-secondary/70 focus:bg-secondary transition-colors"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
