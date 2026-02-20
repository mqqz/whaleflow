import { ArrowDownUp, Search } from "lucide-react";
import { LiveTransaction } from "../hooks/useLiveTransactions";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { NetworkGraph } from "./NetworkGraph";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { WalletTag, useExploreModel } from "../hooks/useExploreModel";

interface ExplorerPageProps {
  network: string;
  token: string;
  transactions: LiveTransaction[];
  selectedWallet: string | null;
  onWalletSelect: (wallet: string) => void;
}

interface SummaryCardItem {
  label: string;
  value: string;
  valueClassName?: string;
}

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

const tagBadgeClass: Record<WalletTag, string> = {
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
  const model = useExploreModel({
    network,
    token,
    transactions,
    selectedWallet,
    onWalletSelect,
  });

  const summaryCards: SummaryCardItem[] = [
    {
      label: "Address",
      value: model.normalizedWallet || "--",
      valueClassName: "font-mono",
    },
    {
      label: "Balance",
      value: formatAmount(model.summary.balance, model.tokenLabel),
      valueClassName: "font-semibold",
    },
    {
      label: "Total Received",
      value: formatAmount(model.summary.totalReceived, model.tokenLabel),
      valueClassName: "font-semibold text-success",
    },
    {
      label: "Total Sent",
      value: formatAmount(model.summary.totalSent, model.tokenLabel),
      valueClassName: "font-semibold text-destructive",
    },
    {
      label: "Net Position",
      value: `${model.summary.net >= 0 ? "+" : "-"}${formatAmount(Math.abs(model.summary.net), model.tokenLabel)}`,
      valueClassName: `font-semibold ${model.summary.net >= 0 ? "text-success" : "text-destructive"}`,
    },
    {
      label: "First Seen",
      value: model.summary.firstSeenMs === null ? "--" : formatDateTime(model.summary.firstSeenMs),
    },
    {
      label: "Last Active",
      value:
        model.summary.lastActiveMs === null ? "--" : formatDateTime(model.summary.lastActiveMs),
    },
    {
      label: "Exchange Interaction %",
      value: `${model.summary.exchangeInteractionPct.toFixed(1)}%`,
      valueClassName: "font-semibold",
    },
    {
      label: "Net Exchange Interaction (24H)",
      value: model.edgeSummary.available
        ? `${model.edgeSummary.netExchangeInteraction >= 0 ? "+" : "-"}${formatAmount(Math.abs(model.edgeSummary.netExchangeInteraction), model.tokenLabel)}`
        : "n/a",
      valueClassName: `font-semibold ${
        model.edgeSummary.netExchangeInteraction >= 0 ? "text-success" : "text-destructive"
      }`,
    },
    {
      label: "Sent To Exchanges (24H)",
      value: model.edgeSummary.available
        ? formatAmount(model.edgeSummary.sentToExchanges, model.tokenLabel)
        : "n/a",
      valueClassName: "font-semibold text-destructive",
    },
    {
      label: "Received From Exchanges (24H)",
      value: model.edgeSummary.available
        ? formatAmount(model.edgeSummary.receivedFromExchanges, model.tokenLabel)
        : "n/a",
      valueClassName: "font-semibold text-success",
    },
    {
      label: "Exchange Share Of Volume",
      value: model.edgeSummary.available ? `${model.edgeSummary.pctOfObserved.toFixed(1)}%` : "n/a",
      valueClassName: "font-semibold",
    },
  ];

  return (
    <div className="mt-16 px-3 pb-3 pt-3 space-y-3">
      <Card className="bg-card/60 border-border/60">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={model.searchValue}
                onChange={(event) => model.setSearchValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    model.loadSearchWallet();
                  }
                }}
                className="pl-9 font-mono"
                placeholder="Paste wallet address..."
              />
            </div>
            <Button type="button" onClick={model.loadSearchWallet}>
              Load Wallet
            </Button>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {model.apiStatus === "loading" ? "Loading external wallet data..." : null}
            {model.apiStatus === "ready" ? `Data source: ${model.apiDataSource}` : null}
            {model.apiStatus === "error" ? model.apiError : null}
            {model.apiStatus === "idle"
              ? "Load a wallet to fetch indexed history and balance."
              : null}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/60 border-border/60">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-border/60 bg-background/35 p-3"
              >
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {item.label}
                </p>
                <p className={`mt-1 text-sm ${item.valueClassName ?? ""}`}>{item.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/60 border-border/60">
        <CardHeader>
          <CardTitle>{model.graphTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {model.graphEmpty ? (
            <div className="flex h-[430px] items-center justify-center text-sm text-muted-foreground">
              Load a wallet with observed transactions to render the 1-2 hop network.
            </div>
          ) : (
            <div className="h-[430px]">
              <NetworkGraph
                network={network}
                transactions={model.graphTransactions}
                edgePoints={model.hasDuneWalletEdges ? model.walletEdgePoints : undefined}
                selectedWallet={model.normalizedWalletForGraph}
                onWalletSelect={model.selectWallet}
              />
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">{model.graphCaption}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[340px_1fr]">
        <Card className="bg-card/60 border-border/60">
          <CardHeader>
            <CardTitle>Top Counterparties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {model.counterpartyStats.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No counterparties for this wallet yet.
              </p>
            ) : (
              model.counterpartyStats.slice(0, 12).map((item) => (
                <button
                  type="button"
                  key={item.wallet}
                  onClick={() => model.selectWallet(item.wallet)}
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
                      {formatAmount(item.total, model.tokenLabel)}
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
                value={model.directionFilter}
                onValueChange={(value: "all" | "in" | "out") => model.setDirectionFilter(value)}
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
                value={model.tagFilter}
                onValueChange={(value: "all" | "exchange" | "contract" | "none") =>
                  model.setTagFilter(value)
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
                value={model.sortBy}
                onValueChange={(value: "timestamp" | "amount") => model.setSortBy(value)}
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
                onClick={() =>
                  model.setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
                }
              >
                <ArrowDownUp className="h-3.5 w-3.5" />
                {model.sortDirection.toUpperCase()}
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
                {model.filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      No rows match the active wallet and filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  model.filteredRows.map((row) => (
                    <TableRow key={row.tx.id}>
                      <TableCell className="text-xs">
                        {formatDateTime(row.tx.timestampMs)}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => model.selectWallet(row.tx.from)}
                          className="font-mono text-xs hover:text-primary"
                        >
                          {shortWallet(row.tx.from)}
                        </button>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => model.selectWallet(row.tx.to)}
                          className="font-mono text-xs hover:text-primary"
                        >
                          {shortWallet(row.tx.to)}
                        </button>
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold">
                        {row.amount.toFixed(row.amount < 1 ? 4 : 2)} {model.tokenLabel}
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
