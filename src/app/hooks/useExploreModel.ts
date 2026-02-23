import { useCallback, useEffect, useMemo, useState } from "react";
import { detectAddressTag } from "../data/addressLabels";
import { useExchangeAnalytics } from "./useExchangeAnalytics";
import { EdgePoint, selectWalletEdges } from "../services/analyticsData";
import { ExplorerWalletData, fetchExplorerWalletData } from "../services/explorerData";
import { LiveTransaction } from "./useLiveTransactions";

export type WalletTag = "exchange" | "contract" | "none";

export interface WalletRow {
  tx: LiveTransaction;
  amount: number;
  direction: "in" | "out";
  counterparty: string;
  tag: WalletTag;
}

export interface CounterpartyStat {
  wallet: string;
  inflow: number;
  outflow: number;
  total: number;
  txCount: number;
  tag: WalletTag;
}

export type ExplorerSortColumn = "timestamp" | "from" | "to" | "amount" | "direction";
export type ExplorerSortDirection = "asc" | "desc";

interface UseExploreModelOptions {
  network: string;
  token: string;
  transactions: LiveTransaction[];
  selectedWallet: string | null;
  onWalletSelect: (wallet: string) => void;
}

const tokenLabels: Record<string, string> = {
  btc: "BTC",
  eth: "ETH",
};

const parseAmount = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeAddress = (value: string) => value.trim().toLowerCase();

const classifyWallet = (wallet: string): WalletTag => {
  const tag = detectAddressTag(wallet);
  if (tag === "exchange") {
    return "exchange";
  }
  if (tag === "router" || tag === "bridge" || tag === "contract") {
    return "contract";
  }
  return "none";
};

export function useExploreModel({
  network,
  token,
  transactions,
  selectedWallet,
  onWalletSelect,
}: UseExploreModelOptions) {
  const { data: analyticsData, loading: analyticsLoading } = useExchangeAnalytics();
  const [searchValue, setSearchValue] = useState(selectedWallet ?? "");
  const [walletAddress, setWalletAddress] = useState(selectedWallet ?? "");
  const [sortColumn, setSortColumn] = useState<ExplorerSortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<ExplorerSortDirection | null>(null);
  const [apiData, setApiData] = useState<ExplorerWalletData | null>(null);
  const [apiStatus, setApiStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [apiError, setApiError] = useState<string | null>(null);

  const tokenLabel = tokenLabels[token] ?? token.toUpperCase();

  useEffect(() => {
    if (!selectedWallet || selectedWallet === walletAddress) {
      return;
    }
    setSearchValue(selectedWallet);
    setWalletAddress(selectedWallet);
  }, [selectedWallet, walletAddress]);

  const normalizedWallet = walletAddress.trim();
  const normalizedWalletLower = normalizeAddress(normalizedWallet);

  const walletEdgePoints = useMemo(() => {
    if (!analyticsData || !normalizedWalletLower || token.toLowerCase() !== "eth") {
      return [] as EdgePoint[];
    }
    return selectWalletEdges(analyticsData, normalizedWalletLower).slice(0, 140);
  }, [analyticsData, normalizedWalletLower, token]);

  const hasDuneWalletEdges = walletEdgePoints.length > 0;

  useEffect(() => {
    if (!normalizedWallet) {
      setApiData(null);
      setApiStatus("idle");
      setApiError(null);
      return;
    }

    let active = true;
    setApiStatus("loading");
    setApiError(null);

    fetchExplorerWalletData({
      network,
      address: normalizedWallet,
      maxTransactions: 300,
    })
      .then((data) => {
        if (!active) return;
        setApiData(data);
        setApiStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setApiData(null);
        setApiStatus("error");
        setApiError("External explorer sources unavailable; showing live-stream snapshot.");
      });

    return () => {
      active = false;
    };
  }, [network, normalizedWallet]);

  const sourceTransactions = useMemo(
    () => (apiData && apiData.transactions.length > 0 ? apiData.transactions : transactions),
    [apiData, transactions],
  );

  const walletTx = useMemo(
    () =>
      sourceTransactions
        .filter(
          (tx) =>
            tx.channel === "wallet" && (tx.from === normalizedWallet || tx.to === normalizedWallet),
        )
        .sort((a, b) => b.timestampMs - a.timestampMs),
    [sourceTransactions, normalizedWallet],
  );

  const rows = useMemo<WalletRow[]>(
    () =>
      walletTx.map((tx) => {
        const amount = parseAmount(tx.amount);
        const direction = tx.to === normalizedWallet ? "in" : "out";
        const counterparty = direction === "in" ? tx.from : tx.to;
        return {
          tx,
          amount,
          direction,
          counterparty,
          tag: classifyWallet(counterparty),
        };
      }),
    [walletTx, normalizedWallet],
  );

  const summary = useMemo(() => {
    const totalReceived = rows
      .filter((row) => row.direction === "in")
      .reduce((sum, row) => sum + row.amount, 0);
    const totalSent = rows
      .filter((row) => row.direction === "out")
      .reduce((sum, row) => sum + row.amount, 0);
    const net = totalReceived - totalSent;
    const exchangeCount = rows.filter((row) => row.tag === "exchange").length;
    const exchangeInteractionPct = rows.length === 0 ? 0 : (exchangeCount / rows.length) * 100;
    const firstSeenMs = rows.at(-1)?.tx.timestampMs ?? null;
    const lastActiveMs = rows[0]?.tx.timestampMs ?? null;

    return {
      totalReceived,
      totalSent,
      net,
      balance: apiData?.balance ?? net,
      firstSeenMs,
      lastActiveMs,
      exchangeInteractionPct,
      walletObservedVolume: totalReceived + totalSent,
    };
  }, [apiData, rows]);

  const edgeSummary = useMemo(() => {
    if (!normalizedWalletLower || walletEdgePoints.length === 0) {
      return {
        available: false,
        sentToExchanges: 0,
        receivedFromExchanges: 0,
        netExchangeInteraction: 0,
        pctOfObserved: 0,
      };
    }

    let sentToExchanges = 0;
    let receivedFromExchanges = 0;
    const isExchangeLabel = (label: string) => {
      const normalized = label.trim().toLowerCase();
      return normalized.length > 0 && normalized !== "unlabeled";
    };

    for (const edge of walletEdgePoints) {
      const src = normalizeAddress(edge.src);
      const dst = normalizeAddress(edge.dst);
      const srcIsWallet = src === normalizedWalletLower;
      const dstIsWallet = dst === normalizedWalletLower;
      const srcIsExchange = isExchangeLabel(edge.srcLabel);
      const dstIsExchange = isExchangeLabel(edge.dstLabel);

      if (srcIsWallet && dstIsExchange) {
        sentToExchanges += edge.valueEth;
      } else if (dstIsWallet && srcIsExchange) {
        receivedFromExchanges += edge.valueEth;
      }
    }

    const totalExchange = sentToExchanges + receivedFromExchanges;
    const pctOfObserved =
      summary.walletObservedVolume > 0 ? (totalExchange / summary.walletObservedVolume) * 100 : 0;

    return {
      available: true,
      sentToExchanges,
      receivedFromExchanges,
      netExchangeInteraction: receivedFromExchanges - sentToExchanges,
      pctOfObserved,
    };
  }, [normalizedWalletLower, walletEdgePoints, summary.walletObservedVolume]);

  const counterpartyStats = useMemo<CounterpartyStat[]>(() => {
    const byWallet = new Map<string, CounterpartyStat>();
    for (const row of rows) {
      const current = byWallet.get(row.counterparty) ?? {
        wallet: row.counterparty,
        inflow: 0,
        outflow: 0,
        total: 0,
        txCount: 0,
        tag: row.tag,
      };
      if (row.direction === "in") {
        current.inflow += row.amount;
      } else {
        current.outflow += row.amount;
      }
      current.total += row.amount;
      current.txCount += 1;
      byWallet.set(row.counterparty, current);
    }
    return [...byWallet.values()].sort((a, b) => b.total - a.total);
  }, [rows]);

  const toggleSort = useCallback(
    (column: ExplorerSortColumn) => {
      if (sortColumn !== column) {
        setSortColumn(column);
        setSortDirection("asc");
        return;
      }
      if (sortDirection === "asc") {
        setSortDirection("desc");
        return;
      }
      setSortColumn(null);
      setSortDirection(null);
    },
    [sortColumn, sortDirection],
  );

  const filteredRows = useMemo(() => {
    const byFilter = rows;

    if (!sortColumn || !sortDirection) {
      return byFilter;
    }

    return [...byFilter].sort((a, b) => {
      const factor = sortDirection === "asc" ? 1 : -1;
      let compare = 0;

      switch (sortColumn) {
        case "timestamp":
          compare = a.tx.timestampMs - b.tx.timestampMs;
          break;
        case "from":
          compare = a.tx.from.localeCompare(b.tx.from);
          break;
        case "to":
          compare = a.tx.to.localeCompare(b.tx.to);
          break;
        case "amount":
          compare = a.amount - b.amount;
          break;
        case "direction":
          compare = a.direction.localeCompare(b.direction);
          break;
      }

      if (compare === 0) {
        return b.tx.timestampMs - a.tx.timestampMs;
      }
      return compare * factor;
    });
  }, [rows, sortColumn, sortDirection]);

  const egoTransactions = useMemo(() => {
    if (!normalizedWallet) {
      return [] as LiveTransaction[];
    }

    const graphSeed =
      apiData && apiData.transactions.length > 0 ? apiData.transactions : transactions;
    const recent = graphSeed.filter((tx) => tx.channel === "wallet").slice(0, 450);

    const firstHop = new Set<string>();
    for (const tx of recent) {
      if (tx.from === normalizedWallet) {
        firstHop.add(tx.to);
      } else if (tx.to === normalizedWallet) {
        firstHop.add(tx.from);
      }
    }

    const secondHop = new Set<string>();
    for (const tx of recent) {
      if (tx.from === normalizedWallet || tx.to === normalizedWallet) {
        continue;
      }
      const fromIsHop1 = firstHop.has(tx.from);
      const toIsHop1 = firstHop.has(tx.to);
      if (!fromIsHop1 && !toIsHop1) {
        continue;
      }
      const candidate = fromIsHop1 ? tx.to : tx.from;
      if (candidate === normalizedWallet || firstHop.has(candidate)) {
        continue;
      }
      secondHop.add(candidate);
    }

    const include = new Set([normalizedWallet, ...firstHop, ...secondHop]);
    return recent.filter((tx) => include.has(tx.from) && include.has(tx.to));
  }, [apiData, normalizedWallet, transactions]);

  const graphTitle = hasDuneWalletEdges ? "Exchange-Centric Network (24H)" : "Ego Network Graph";
  const graphCaption = hasDuneWalletEdges
    ? "Filtered from 24H exchange-edge snapshot for the selected wallet."
    : analyticsLoading && token.toLowerCase() === "eth"
      ? "Loading 24H exchange-edge snapshot..."
      : token.toLowerCase() === "eth" && normalizedWallet
        ? "No qualifying edges in 24H exchange-edge snapshot. Showing 1-2 hop fallback from wallet-channel transactions."
        : "Constrained to this wallet's 1-2 hop neighborhood from the last 450 wallet-channel transactions.";

  const selectWallet = useCallback(
    (wallet: string) => {
      setSearchValue(wallet);
      setWalletAddress(wallet);
      onWalletSelect(wallet);
    },
    [onWalletSelect],
  );

  const loadSearchWallet = useCallback(() => {
    const next = searchValue.trim();
    if (!next) {
      return;
    }
    selectWallet(next);
  }, [searchValue, selectWallet]);

  return {
    tokenLabel,
    searchValue,
    setSearchValue,
    normalizedWallet,
    apiStatus,
    apiDataSource: apiData?.source ?? "Live stream",
    apiError,
    sortColumn,
    sortDirection,
    toggleSort,
    summary,
    edgeSummary,
    counterpartyStats,
    filteredRows,
    hasDuneWalletEdges,
    walletEdgePoints,
    graphTransactions: hasDuneWalletEdges ? ([] as LiveTransaction[]) : egoTransactions,
    graphTitle,
    graphCaption,
    graphEmpty: !hasDuneWalletEdges && egoTransactions.length === 0,
    normalizedWalletForGraph: normalizedWallet,
    selectWallet,
    loadSearchWallet,
  };
}
