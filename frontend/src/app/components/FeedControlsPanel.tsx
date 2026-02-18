import { Slider } from "./ui/slider";
import { Label } from "./ui/label";

interface FeedControlsPanelProps {
  token: string;
  minAmount: number;
  maxVisible: number;
  onMinAmountChange: (value: number) => void;
  onMaxVisibleChange: (value: number) => void;
}

const tokenLabels: Record<string, string> = {
  btc: "BTC",
  eth: "ETH",
  sol: "SOL",
  bnb: "BNB",
  xrp: "XRP",
};

export function FeedControlsPanel({
  token,
  minAmount,
  maxVisible,
  onMinAmountChange,
  onMaxVisibleChange,
}: FeedControlsPanelProps) {
  const tokenLabel = tokenLabels[token] ?? token.toUpperCase();
  const handleMinAmountChange = (values: number[]) => {
    const next = values[0];
    if (typeof next === "number" && Number.isFinite(next)) {
      onMinAmountChange(next);
    }
  };

  const handleMaxVisibleChange = (values: number[]) => {
    const next = values[0];
    if (typeof next === "number" && Number.isFinite(next)) {
      onMaxVisibleChange(Math.round(next));
    }
  };

  return (
    <div className="w-full p-2 space-y-5">
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <Label className="text-sm text-muted-foreground">Minimum Size</Label>
          <span className="text-xs font-semibold text-primary">
            ≥ {minAmount.toFixed(minAmount < 10 ? 1 : 0)} {tokenLabel}
          </span>
        </div>
        <Slider
          value={[minAmount]}
          min={0}
          max={100}
          step={0.5}
          className="w-full"
          onValueChange={handleMinAmountChange}
          onValueCommit={handleMinAmountChange}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0</span>
          <span>100 {tokenLabel}</span>
        </div>
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <Label className="text-sm text-muted-foreground">Visible Rows</Label>
          <span className="text-xs font-semibold text-primary">{maxVisible}</span>
        </div>
        <Slider
          value={[maxVisible]}
          min={5}
          max={40}
          step={1}
          className="w-full"
          onValueChange={handleMaxVisibleChange}
          onValueCommit={handleMaxVisibleChange}
        />
      </div>
    </div>
  );
}
