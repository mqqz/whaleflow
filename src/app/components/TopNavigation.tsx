import { useState } from "react";
import { Activity } from "lucide-react";
import { motion } from "motion/react";
import { ConnectionStatus } from "../hooks/useLiveTransactions";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface TopNavigationProps {
  token: string;
  status: ConnectionStatus;
  activeSection: TopNavSection;
  onTokenChange: (value: string) => void;
  onSectionChange: (section: TopNavSection) => void;
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

const iconPath = (filename: string) => `${import.meta.env.BASE_URL}icons/${filename}`;

const tokenMeta = {
  btc: { label: "BTC", iconSrc: iconPath("btc.svg") },
  eth: { label: "ETH", iconSrc: iconPath("eth.svg") },
} as const;

const sections = [
  { id: "monitor", label: "Monitor" },
  { id: "impact", label: "Impact" },
  { id: "explorer", label: "Explorer" },
] as const;

export type TopNavSection = (typeof sections)[number]["id"];

function SelectorIcon({ src, label }: { src: string; label: string }) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[8px] font-semibold text-muted-foreground"
        aria-hidden="true"
      >
        {label.slice(0, 1).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className="h-4 w-4 rounded-full object-cover"
      onError={() => setHasError(true)}
    />
  );
}

export function TopNavigation({
  token,
  status,
  activeSection,
  onTokenChange,
  onSectionChange,
}: TopNavigationProps) {
  return (
    <div className="fixed top-0 left-0 right-0 h-16 bg-card/80 backdrop-blur-xl border-b border-border z-50">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center h-full px-6 gap-4">
        {/* Left */}
        <div className="flex items-center min-w-0 gap-5">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            <span className="text-lg font-semibold tracking-tight">WhaleFlow</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 py-0.5">
            <div className="h-7 w-px bg-border/60 self-end" />

            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] leading-none font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Token
              </span>
              <Select value={token} onValueChange={onTokenChange}>
                <SelectTrigger
                  size="sm"
                  title="Chooses the asset symbol used for stream and value context"
                  className="h-7 w-[82px] sm:w-[94px] bg-muted/40 border-border/40 px-2 text-xs hover:bg-muted/70 transition-colors"
                >
                  <SelectorIcon
                    src={tokenMeta[token as keyof typeof tokenMeta]?.iconSrc ?? iconPath("eth.svg")}
                    label={tokenMeta[token as keyof typeof tokenMeta]?.label ?? "Token"}
                  />
                  <SelectValue placeholder="Token" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Trade stream symbol</SelectLabel>
                    <SelectSeparator />
                    <SelectItem
                      value="btc"
                      icon={
                        <SelectorIcon src={tokenMeta.btc.iconSrc} label={tokenMeta.btc.label} />
                      }
                    >
                      {tokenMeta.btc.label}
                    </SelectItem>
                    <SelectItem
                      value="eth"
                      icon={
                        <SelectorIcon src={tokenMeta.eth.iconSrc} label={tokenMeta.eth.label} />
                      }
                    >
                      {tokenMeta.eth.label}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Center */}
        <div className="hidden md:flex items-center justify-center">
          <div className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-card/50 p-1">
            {sections.map((section) => {
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => onSectionChange(section.id)}
                  className={`relative px-4 py-1.5 text-sm transition-colors ${
                    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {section.label}
                  {isActive ? (
                    <motion.span
                      layoutId="top-nav-active-underline"
                      className="absolute left-2 right-2 -bottom-[2px] h-[2px] rounded-full bg-primary/70"
                      transition={{ type: "spring", stiffness: 460, damping: 36 }}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-4 justify-self-end">
          {/* Live Indicator */}
          <div
            className={`hidden sm:flex items-center gap-2 px-3 py-1.5 border rounded-lg ${statusBadgeClass[status]}`}
          >
            <div className="relative">
              <div className={`w-2 h-2 rounded-full animate-pulse ${statusColor[status]}`} />
              {status !== "error" && (
                <div
                  className={`absolute inset-0 w-2 h-2 rounded-full animate-ping ${statusColor[status]}`}
                />
              )}
            </div>
            <span className="text-xs font-semibold tracking-wider">{statusLabel[status]}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
