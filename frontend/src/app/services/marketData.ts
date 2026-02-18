export interface PriceCandle {
  ts: number;
  close: number;
}

export type CandleInterval = "1m" | "5m";

interface FetchPriceCandlesOptions {
  token: string;
  rangeMs: number;
  interval: CandleInterval;
}

interface PriceFeedResult {
  candles: PriceCandle[];
  source: string;
}

const BINANCE_SYMBOLS: Record<string, string> = {
  btc: "BTCUSDT",
  eth: "ETHUSDT",
  sol: "SOLUSDT",
  bnb: "BNBUSDT",
  xrp: "XRPUSDT",
};

const COINBASE_PRODUCTS: Record<string, string> = {
  btc: "BTC-USD",
  eth: "ETH-USD",
  sol: "SOL-USD",
  bnb: "BNB-USD",
  xrp: "XRP-USD",
};

const COINGECKO_IDS: Record<string, string> = {
  btc: "bitcoin",
  eth: "ethereum",
  sol: "solana",
  bnb: "binancecoin",
  xrp: "ripple",
};

const dedupeAndSort = (candles: PriceCandle[]) => {
  const byTs = new Map<number, PriceCandle>();
  for (const candle of candles) {
    if (Number.isFinite(candle.ts) && Number.isFinite(candle.close)) {
      byTs.set(candle.ts, candle);
    }
  }
  return [...byTs.values()].sort((a, b) => a.ts - b.ts);
};

const intervalToMs: Record<CandleInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
};

async function fetchBinanceCandles(
  symbol: string,
  startMs: number,
  endMs: number,
  interval: CandleInterval,
): Promise<PriceCandle[]> {
  const stepMs = intervalToMs[interval];
  const out: PriceCandle[] = [];
  let cursor = startMs;

  for (let i = 0; i < 6 && cursor < endMs; i += 1) {
    const query = new URLSearchParams({
      symbol,
      interval,
      startTime: String(cursor),
      endTime: String(endMs),
      limit: "1000",
    });
    const resp = await fetch(`https://api.binance.com/api/v3/klines?${query.toString()}`);
    if (!resp.ok) {
      throw new Error(`binance failed: ${resp.status}`);
    }
    const rows = (await resp.json()) as Array<[number, string, string, string, string]>;
    if (rows.length === 0) {
      break;
    }
    out.push(...rows.map((row) => ({ ts: row[0], close: Number(row[4]) })));
    cursor = (rows.at(-1)?.[0] ?? endMs) + stepMs;
  }

  return dedupeAndSort(out);
}

async function fetchCoinbaseCandles(
  product: string,
  startMs: number,
  endMs: number,
  interval: CandleInterval,
): Promise<PriceCandle[]> {
  const granularity = interval === "1m" ? 60 : 300;
  const windowSeconds = granularity * 300;
  const startSec = Math.floor(startMs / 1000);
  const endSec = Math.floor(endMs / 1000);
  const out: PriceCandle[] = [];
  let cursor = startSec;

  for (let i = 0; i < 12 && cursor < endSec; i += 1) {
    const chunkEnd = Math.min(endSec, cursor + windowSeconds);
    const query = new URLSearchParams({
      granularity: String(granularity),
      start: new Date(cursor * 1000).toISOString(),
      end: new Date(chunkEnd * 1000).toISOString(),
    });
    const resp = await fetch(
      `https://api.exchange.coinbase.com/products/${product}/candles?${query.toString()}`,
    );
    if (!resp.ok) {
      throw new Error(`coinbase failed: ${resp.status}`);
    }
    const rows = (await resp.json()) as Array<[number, number, number, number, number, number]>;
    if (!Array.isArray(rows) || rows.length === 0) {
      cursor = chunkEnd;
      continue;
    }
    out.push(...rows.map((row) => ({ ts: row[0] * 1000, close: Number(row[4]) })));
    cursor = chunkEnd;
  }

  return dedupeAndSort(out);
}

async function fetchCoinGeckoCandles(
  coinId: string,
  startMs: number,
  endMs: number,
): Promise<PriceCandle[]> {
  const query = new URLSearchParams({
    vs_currency: "usd",
    from: String(Math.floor(startMs / 1000)),
    to: String(Math.floor(endMs / 1000)),
  });
  const resp = await fetch(
    `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart/range?${query.toString()}`,
  );
  if (!resp.ok) {
    throw new Error(`coingecko failed: ${resp.status}`);
  }
  const payload = (await resp.json()) as { prices?: Array<[number, number]> };
  const prices = Array.isArray(payload.prices) ? payload.prices : [];
  return dedupeAndSort(prices.map(([ts, close]) => ({ ts, close })));
}

export async function fetchPriceCandlesWithFallback({
  token,
  rangeMs,
  interval,
}: FetchPriceCandlesOptions): Promise<PriceFeedResult> {
  const now = Date.now();
  const start = now - rangeMs;
  const tokenKey = token.toLowerCase();

  const coinGeckoId = COINGECKO_IDS[tokenKey];
  if (coinGeckoId) {
    try {
      const candles = await fetchCoinGeckoCandles(coinGeckoId, start, now);
      if (candles.length > 0) {
        return { candles, source: "CoinGecko" };
      }
    } catch {
      // fall through to next provider
    }
  }

  const binanceSymbol = BINANCE_SYMBOLS[tokenKey];
  if (binanceSymbol) {
    try {
      const candles = await fetchBinanceCandles(binanceSymbol, start, now, interval);
      if (candles.length > 0) {
        return { candles, source: "Binance" };
      }
    } catch {
      // fall through to next provider
    }
  }

  const coinbaseProduct = COINBASE_PRODUCTS[tokenKey];
  if (coinbaseProduct) {
    try {
      const candles = await fetchCoinbaseCandles(coinbaseProduct, start, now, interval);
      if (candles.length > 0) {
        return { candles, source: "Coinbase Exchange" };
      }
    } catch {
      // fall through to next provider
    }
  }

  return { candles: [], source: "Unavailable" };
}
