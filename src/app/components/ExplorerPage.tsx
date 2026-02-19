import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, Search } from "lucide-react";
import { LiveTransaction } from "../hooks/useLiveTransactions";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { NetworkGraph } from "./NetworkGraph";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { ExplorerWalletData, fetchExplorerWalletData } from "../services/explorerData";
import { detectAddressTag } from "../data/addressLabels";

interface ExplorerPageProps {
  network: string;
  token: string;
  transactions: LiveTransaction[];
  selectedWallet: string | null;
  onWalletSelect: (wallet: string) => void;
}

interface WalletRow {
  tx: LiveTransaction;
  amount: number;
  direction: "in" | "out";
  counterparty: string;
  tag: "exchange" | "contract" | "none";
}

interface CounterpartyStat {
  wallet: string;
  inflow: number;
  outflow: number;
  total: number;
  txCount: number;
  tag: "exchange" | "contract" | "none";
}

const tokenLabels: Record<string, string> = {
  btc: "BTC",
  eth: "ETH",
};

const parseAmount = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const shortWallet = (wallet: string) => {
  if (wallet.length <= 14) return wallet;
  return `${wallet.slice(0, 8)}...${wallet.slice(-6)}`;
};

const formatAmount = (value: number, token: string) => {
  if (!Number.isFinite(value)) return `0 ${token}`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M ${token}`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(2)}K ${token}`;
  return `${value.toFixed(4)} ${token}`;
};

const formatDateTime = (timestampMs: number) =>
  new Date(timestampMs).toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const classifyWallet = (wallet: string): "exchange" | "contract" | "none" => {
  const tag = detectAddressTag(wallet);
  if (tag === "exchange") {
    return "exchange";
  }
  if (tag === "router" || tag === "bridge" || tag === "contract") {
    return "contract";
  }
  return "none";
};

const tagBadgeClass: Record<WalletRow["tag"], string> = {
  exchange: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  contract: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  none: "bg-muted/40 text-muted-foreground border-border",
};

export function ExplorerPage({
  network,
  token,
  transactions,
  selectedWallet,
  onWalletSelect,
}: ExplorerPageProps) {
  const tokenLabel = tokenLabels[token] ?? token.toUpperCase();
  const [searchValue, setSearchValue] = useState(selectedWallet ?? "");
  const [walletAddress, setWalletAddress] = useState(selectedWallet ?? "");
  const [directionFilter, setDirectionFilter] = useState<"all" | "in" | "out">("all");
  const [tagFilter, setTagFilter] = useState<"all" | "exchange" | "contract" | "none">("all");
  const [sortBy, setSortBy] = useState<"timestamp" | "amount">("timestamp");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [apiData, setApiData] = useState<ExplorerWalletData | null>(null);
  const [apiStatus, setApiStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedWallet || selectedWallet === walletAddress) {
      return;
    }
    setSearchValue(selectedWallet);
    setWalletAddress(selectedWallet);
  }, [selectedWallet, walletAddress]);

  const normalizedWallet = walletAddress.trim();
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
    };
  }, [apiData, rows]);

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

  const filteredRows = useMemo(() => {
    const byFilter = rows.filter((row) => {
      if (directionFilter !== "all" && row.direction !== directionFilter) return false;
      if (tagFilter !== "all" && row.tag !== tagFilter) return false;
      return true;
    });
    const sorted = [...byFilter].sort((a, b) => {
      const factor = sortDirection === "asc" ? 1 : -1;
      if (sortBy === "amount") return (a.amount - b.amount) * factor;
      return (a.tx.timestampMs - b.tx.timestampMs) * factor;
    });
    return sorted;
  }, [rows, directionFilter, tagFilter, sortBy, sortDirection]);

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

  return (
    <div className="mt-16 px-3 pb-3 pt-3 space-y-3">
      <Card className="bg-card/60 border-border/60">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    const next = searchValue.trim();
                    if (next) {
                      setWalletAddress(next);
                      onWalletSelect(next);
                    }
                  }
                }}
                className="pl-9 font-mono"
                placeholder="Paste wallet address..."
              />
            </div>
            <Button
              type="button"
              onClick={() => {
                const next = searchValue.trim();
                if (!next) return;
                setWalletAddress(next);
                onWalletSelect(next);
              }}
            >
              Load Wallet
            </Button>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {apiStatus === "loading" ? "Loading external wallet data..." : null}
            {apiStatus === "ready" ? `Data source: ${apiData?.source ?? "Live stream"}` : null}
            {apiStatus === "error" ? apiError : null}
            {apiStatus === "idle" ? "Load a wallet to fetch indexed history and balance." : null}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/60 border-border/60">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-border/60 bg-background/35 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Address</p>
              <p className="mt-1 font-mono text-sm">{normalizedWallet || "--"}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/35 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Balance</p>
              <p className="mt-1 text-sm font-semibold">
                {formatAmount(summary.balance, tokenLabel)}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/35 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Total Received
              </p>
              <p className="mt-1 text-sm font-semibold text-success">
                {formatAmount(summary.totalReceived, tokenLabel)}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/35 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Total Sent
              </p>
              <p className="mt-1 text-sm font-semibold text-destructive">
                {formatAmount(summary.totalSent, tokenLabel)}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/35 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Net Position
              </p>
              <p
                className={`mt-1 text-sm font-semibold ${
                  summary.net >= 0 ? "text-success" : "text-destructive"
                }`}
              >
                {summary.net >= 0 ? "+" : "-"}
                {formatAmount(Math.abs(summary.net), tokenLabel)}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/35 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                First Seen
              </p>
              <p className="mt-1 text-sm">
                {summary.firstSeenMs === null ? "--" : formatDateTime(summary.firstSeenMs)}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/35 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Last Active
              </p>
              <p className="mt-1 text-sm">
                {summary.lastActiveMs === null ? "--" : formatDateTime(summary.lastActiveMs)}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/35 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Exchange Interaction %
              </p>
              <p className="mt-1 text-sm font-semibold">
                {summary.exchangeInteractionPct.toFixed(1)}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/60 border-border/60">
        <CardHeader>
          <CardTitle>Ego Network Graph</CardTitle>
        </CardHeader>
        <CardContent>
          {egoTransactions.length === 0 ? (
            <div className="flex h-[430px] items-center justify-center text-sm text-muted-foreground">
              Load a wallet with observed transactions to render the 1-2 hop network.
            </div>
          ) : (
            <div className="h-[430px]">
              <NetworkGraph
                network={network}
                transactions={egoTransactions}
                selectedWallet={normalizedWallet}
                onWalletSelect={(wallet) => {
                  setSearchValue(wallet);
                  setWalletAddress(wallet);
                  onWalletSelect(wallet);
                }}
              />
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Constrained to this wallet&apos;s 1-2 hop neighborhood from the last 450 wallet-channel
            transactions.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[340px_1fr]">
        <Card className="bg-card/60 border-border/60">
          <CardHeader>
            <CardTitle>Top Counterparties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {counterpartyStats.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No counterparties for this wallet yet.
              </p>
            ) : (
              counterpartyStats.slice(0, 12).map((item) => (
                <button
                  type="button"
                  key={item.wallet}
                  onClick={() => {
                    setSearchValue(item.wallet);
                    setWalletAddress(item.wallet);
                    onWalletSelect(item.wallet);
                  }}
                  className="flex w-full items-center justify-between rounded-md border border-border/60 bg-background/30 p-2 text-left transition-colors hover:bg-background/50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs">{item.wallet}</p>
                    <p className="text-[11px] text-muted-foreground">{item.txCount} tx</p>
                  </div>
                  <div className="flex items-center gap-2 pl-2">
                    <Badge variant="outline" className={tagBadgeClass[item.tag]}>
                      {item.tag}
                    </Badge>
                    <span className="text-xs font-semibold">
                      {formatAmount(item.total, tokenLabel)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/60 border-border/60">
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Transaction Table</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={directionFilter}
                onValueChange={(value: "all" | "in" | "out") => setDirectionFilter(value)}
              >
                <SelectTrigger className="h-8 w-[110px]">
                  <SelectValue placeholder="Direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="in">In</SelectItem>
                  <SelectItem value="out">Out</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={tagFilter}
                onValueChange={(value: "all" | "exchange" | "contract" | "none") =>
                  setTagFilter(value)
                }
              >
                <SelectTrigger className="h-8 w-[130px]">
                  <SelectValue placeholder="Tag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tags</SelectItem>
                  <SelectItem value="exchange">Exchange</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={sortBy}
                onValueChange={(value: "timestamp" | "amount") => setSortBy(value)}
              >
                <SelectTrigger className="h-8 w-[140px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="timestamp">Timestamp</SelectItem>
                  <SelectItem value="amount">Amount</SelectItem>
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
              >
                <ArrowDownUp className="h-3.5 w-3.5" />
                {sortDirection.toUpperCase()}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Exchange/Contract Tag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      No rows match the active wallet and filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow key={row.tx.id}>
                      <TableCell className="text-xs">
                        {formatDateTime(row.tx.timestampMs)}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => {
                            setSearchValue(row.tx.from);
                            setWalletAddress(row.tx.from);
                            onWalletSelect(row.tx.from);
                          }}
                          className="font-mono text-xs hover:text-primary"
                        >
                          {shortWallet(row.tx.from)}
                        </button>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => {
                            setSearchValue(row.tx.to);
                            setWalletAddress(row.tx.to);
                            onWalletSelect(row.tx.to);
                          }}
                          className="font-mono text-xs hover:text-primary"
                        >
                          {shortWallet(row.tx.to)}
                        </button>
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold">
                        {row.amount.toFixed(row.amount < 1 ? 4 : 2)} {tokenLabel}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            row.direction === "in"
                              ? "bg-success/10 text-success border-success/30"
                              : "bg-destructive/10 text-destructive border-destructive/30"
                          }
                        >
                          {row.direction}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={tagBadgeClass[row.tag]}>
                          {row.tag}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
