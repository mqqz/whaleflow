import { ConnectionStatus } from "../hooks/useLiveTransactions";

interface LiveStatusBadgeProps {
  status: ConnectionStatus;
  paused?: boolean;
  className?: string;
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

export function LiveStatusBadge({ status, paused = false, className = "" }: LiveStatusBadgeProps) {
  const visualStatus: ConnectionStatus = paused ? "reconnecting" : status;
  const label = paused ? "PAUSED" : statusLabel[status];
  const shouldAnimate = !paused && visualStatus !== "error";

  return (
    <div
      className={`relative inline-flex min-w-[112px] items-center justify-center px-3 py-1.5 border rounded-lg ${statusBadgeClass[visualStatus]} ${className}`}
    >
      <div className="absolute left-1.5 relative">
        <div
          className={`w-2 h-2 rounded-full ${shouldAnimate ? "animate-pulse" : ""} ${statusColor[visualStatus]}`}
        />
        {shouldAnimate && (
          <div
            className={`absolute inset-0 w-2 h-2 rounded-full animate-ping ${statusColor[visualStatus]}`}
          />
        )}
      </div>
      <span className="w-full text-center text-xs font-semibold tracking-wider">{label}</span>
    </div>
  );
}
