import { useEffect, useRef, useState } from "react";

export const FALLBACK_W = 1000;
export const FALLBACK_H = 320;
export const PAD_TOP = 8;
export const PAD_RIGHT = 18;
export const PAD_BOTTOM = 28;
export const PAD_LEFT = 42;

export const formatShortTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const formatAxisTick = (ts: number, minTs: number, maxTs: number) => {
  const spanMs = Math.max(0, maxTs - minTs);
  const oneDayMs = 24 * 60 * 60 * 1000;
  if (spanMs >= oneDayMs * 2) {
    return new Date(ts).toLocaleDateString([], { month: "short", day: "2-digit" });
  }
  return formatShortTime(ts);
};

export const formatCompact = (value: number) => {
  if (!Number.isFinite(value)) {
    return "0";
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toFixed(1);
};

export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) {
        return;
      }
      setSize({
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      });
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}
