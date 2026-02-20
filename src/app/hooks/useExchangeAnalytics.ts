import { useEffect, useState } from "react";
import { ExchangeAnalyticsData, loadExchangeAnalyticsData } from "../services/analyticsData";

interface UseExchangeAnalyticsResult {
  data: ExchangeAnalyticsData | null;
  loading: boolean;
  error: string | null;
}

export function useExchangeAnalytics(): UseExchangeAnalyticsResult {
  const [data, setData] = useState<ExchangeAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    loadExchangeAnalyticsData()
      .then((next) => {
        if (!active) return;
        setData(next);
      })
      .catch(() => {
        if (!active) return;
        setData(null);
        setError("Failed to load exchange analytics datasets.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return { data, loading, error };
}
