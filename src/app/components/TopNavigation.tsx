import { Search, Activity } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Input } from "./ui/input";

export function TopNavigation() {
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
          <Select defaultValue="ethereum">
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
          <Select defaultValue="eth">
            <SelectTrigger className="w-[140px] bg-secondary/50 border-border/50 hover:bg-secondary/70 transition-colors">
              <SelectValue placeholder="Token" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="eth">ETH</SelectItem>
              <SelectItem value="usdt">USDT</SelectItem>
              <SelectItem value="usdc">USDC</SelectItem>
              <SelectItem value="wbtc">WBTC</SelectItem>
              <SelectItem value="dai">DAI</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          {/* Live Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-success/10 border border-success/30 rounded-lg">
            <div className="relative">
              <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
              <div className="absolute inset-0 w-2 h-2 bg-success rounded-full animate-ping" />
            </div>
            <span className="text-xs font-semibold text-success tracking-wider">LIVE</span>
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
