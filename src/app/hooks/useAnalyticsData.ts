import { useCallback, useEffect, useState } from "react";
import {
  loadExchangeFlowHourly,
  loadTierExchangeEdges24h,
  loadTierExchangeFlowHourly,
} from "../services/analyticsData";
import type {
  ExchangeFlowPoint,
  TierExchangeEdge,
  TierExchangeFlowPoint,
} from "../types/analytics";

interface AnalyticsCache {
  exchangeFlow: ExchangeFlowPoint[];
  tierFlow: TierExchangeFlowPoint[];
  tierEdges: TierExchangeEdge[];
  refreshedAt: Date;
}

let cache: AnalyticsCache | null = null;
let inflightPromise: Promise<AnalyticsCache> | null = null;

const loadAllDatasets = async (): Promise<AnalyticsCache> => {
  if (cache) {
    return cache;
  }
  if (!inflightPromise) {
    inflightPromise = Promise.all([
      loadExchangeFlowHourly(),
      loadTierExchangeFlowHourly(),
      loadTierExchangeEdges24h(),
    ]).then(([exchangeFlow, tierFlow, tierEdges]) => {
      cache = {
        exchangeFlow,
        tierFlow,
        tierEdges,
        refreshedAt: new Date(),
      };
      return cache;
    });
  }
  return inflightPromise;
};

const reloadAllDatasets = async (): Promise<AnalyticsCache> => {
  cache = null;
  inflightPromise = null;
  return loadAllDatasets();
};

export function useAnalyticsData() {
  const [exchangeFlow, setExchangeFlow] = useState<ExchangeFlowPoint[]>(cache?.exchangeFlow ?? []);
  const [tierFlow, setTierFlow] = useState<TierExchangeFlowPoint[]>(cache?.tierFlow ?? []);
  const [tierEdges, setTierEdges] = useState<TierExchangeEdge[]>(cache?.tierEdges ?? []);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(cache?.refreshedAt ?? null);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((next: AnalyticsCache) => {
    setExchangeFlow(next.exchangeFlow);
    setTierFlow(next.tierFlow);
    setTierEdges(next.tierEdges);
    setRefreshedAt(next.refreshedAt);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(!cache);
    setError(null);

    loadAllDatasets()
      .then((next) => {
        if (!active) {
          return;
        }
        apply(next);
      })
      .catch((err: unknown) => {
        if (!active) {
          return;
        }
        const message = err instanceof Error ? err.message : "Failed to load analytics data.";
        setError(message);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [apply]);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return reloadAllDatasets()
      .then((next) => {
        apply(next);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to reload analytics data.";
        setError(message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [apply]);

  return {
    exchangeFlow,
    tierFlow,
    tierEdges,
    loading,
    error,
    refreshedAt,
    reload,
  };
}
