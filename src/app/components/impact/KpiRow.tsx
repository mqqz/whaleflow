import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

interface KpiCardProps {
  title: string;
  value: string;
  valueClassName?: string;
  deltaPct: number | null;
  subtitle?: string;
}

export const movementStyle = (pct: number | null) => {
  if (pct === null || !Number.isFinite(pct) || Math.abs(pct) < 0.05) {
    return { symbol: "■", className: "text-muted-foreground", text: "n/a" };
  }
  if (pct > 0) {
    return { symbol: "▲", className: "text-success", text: `+${pct.toFixed(1)}%` };
  }
  return { symbol: "▼", className: "text-destructive", text: `${pct.toFixed(1)}%` };
};

function KpiCard({ title, value, valueClassName, deltaPct, subtitle }: KpiCardProps) {
  const move = movementStyle(deltaPct);
  return (
    <Card className="bg-card/60 border-border/60 h-[150px] rounded-xl">
      <CardHeader className="px-4 pt-3 pb-1">
        <CardTitle className="text-xs text-muted-foreground uppercase tracking-[0.12em] text-center">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 w-full px-3 pb-3 flex flex-col items-center justify-center text-center gap-2">
        <p className={`text-4xl font-semibold leading-none ${valueClassName ?? ""}`}>{value}</p>
        <p className={`text-xs font-medium inline-flex items-center gap-1 ${move.className}`}>
          <span>{move.symbol}</span>
          <span>{move.text}</span>
        </p>
        {subtitle ? <p className="text-[11px] text-muted-foreground">{subtitle}</p> : null}
      </CardContent>
    </Card>
  );
}

interface KpiRowProps {
  cards: KpiCardProps[];
}

export function KpiRow({ cards }: KpiRowProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
      {cards.map((card) => (
        <KpiCard key={card.title} {...card} />
      ))}
    </div>
  );
}
