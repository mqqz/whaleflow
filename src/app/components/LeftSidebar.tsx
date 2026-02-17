import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Filter, TrendingUp, Building2, Users } from "lucide-react";

export function LeftSidebar() {
  return (
    <div className="w-[240px] bg-card/60 backdrop-blur-sm border-r border-border p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-border/50">
        <Filter className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm">Filters & Controls</h3>
      </div>

      {/* Transaction Size Filter */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <Label className="text-sm text-muted-foreground">Transaction Size</Label>
          <span className="text-xs font-semibold text-primary">≥ 10 ETH</span>
        </div>
        <Slider
          defaultValue={[10]}
          max={1000}
          step={10}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0 ETH</span>
          <span>1000 ETH</span>
        </div>
      </div>

      {/* Whale Filter */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors border border-border/30">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-4 h-4 text-accent" />
          <div>
            <Label className="text-sm font-medium">Whale Activity</Label>
            <p className="text-xs text-muted-foreground">≥ 100 ETH</p>
          </div>
        </div>
        <Switch defaultChecked />
      </div>

      {/* Exchange Filter */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors border border-border/30">
        <div className="flex items-center gap-3">
          <Building2 className="w-4 h-4 text-accent" />
          <div>
            <Label className="text-sm font-medium">Exchange Wallets</Label>
            <p className="text-xs text-muted-foreground">CEX addresses</p>
          </div>
        </div>
        <Switch defaultChecked />
      </div>

      {/* Smart Money Filter */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors border border-border/30">
        <div className="flex items-center gap-3">
          <Users className="w-4 h-4 text-accent" />
          <div>
            <Label className="text-sm font-medium">Smart Money</Label>
            <p className="text-xs text-muted-foreground">Top traders</p>
          </div>
        </div>
        <Switch />
      </div>

      {/* Stats */}
      <div className="pt-4 border-t border-border/50 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Active Wallets</span>
          <span className="text-sm font-semibold text-primary">1,247</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Transactions/min</span>
          <span className="text-sm font-semibold text-success">342</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Volume (24h)</span>
          <span className="text-sm font-semibold text-accent">$2.4B</span>
        </div>
      </div>
    </div>
  );
}