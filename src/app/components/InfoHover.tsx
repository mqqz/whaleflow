import { CircleHelp } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./ui/hover-card";

interface InfoHoverProps {
  title: string;
  summary: string;
  interpretation: string;
  significance: string;
}

export function InfoHover({ title, summary, interpretation, significance }: InfoHoverProps) {
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`About ${title}`}
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-84 p-3">
        <p className="text-xs font-semibold">{summary}</p>
        <div className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <p>
            <span className="text-foreground">How to interpret:</span> {interpretation}
          </p>
          <p>
            <span className="text-foreground">Why it matters:</span> {significance}
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
