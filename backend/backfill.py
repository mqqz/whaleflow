import argparse
import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Iterable

import aiohttp
from dotenv import load_dotenv
from psycopg2.extras import execute_values
from tqdm import tqdm

from db import get_conn

load_dotenv()

BINANCE_AGG_TRADES_URL = "https://api.binance.com/api/v3/aggTrades"
BUCKET_MS = 5 * 60 * 1000
DATASET_KEY = "binance_agg_trades_v1"
SYMBOL_BY_CHAIN = {
    "eth": "ETHUSDT",
    "btc": "BTCUSDT",
}

logger = logging.getLogger("backfill")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Resumable ETH/BTC market-data backfill"
    )
    parser.add_argument("--days", type=int, default=7, help="How many days to backfill")
    parser.add_argument(
        "--chains",
        type=str,
        default="eth,btc",
        help="Comma-separated chains to backfill (eth,btc)",
    )
    parser.add_argument(
        "--chunk-minutes",
        type=int,
        default=60,
        help="Chunk size in minutes for checkpointed ingestion",
    )
    parser.add_argument(
        "--http-timeout-seconds",
        type=float,
        default=20.0,
        help="HTTP timeout for API calls",
    )
    parser.add_argument(
        "--materialize-only",
        action="store_true",
        help="Skip ingestion and only rebuild derived tables from market_trades",
    )
    parser.add_argument(
        "--log-level",
        type=str,
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
    )
    return parser.parse_args()


def ms_to_bucket_dt(ms: int) -> datetime:
    bucket_ms = (ms // BUCKET_MS) * BUCKET_MS
    return datetime.fromtimestamp(bucket_ms / 1000, tz=timezone.utc)


def ms_to_dt(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)


def utc_now_ms() -> int:
    return int(time.time() * 1000)


def ensure_schema():
    from init_db import init_db

    init_db()


def get_checkpoint(chain: str) -> int | None:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT cursor_ms
        FROM backfill_state
        WHERE chain = %s AND dataset = %s
        """,
        (chain, DATASET_KEY),
    )
    row = cur.fetchone()
    cur.close()
    conn.close()
    return int(row[0]) if row else None


def update_checkpoint(cur, chain: str, cursor_ms: int):
    cur.execute(
        """
        INSERT INTO backfill_state (chain, dataset, cursor_ms, updated_at)
        VALUES (%s, %s, %s, NOW())
        ON CONFLICT (chain, dataset)
        DO UPDATE SET
            cursor_ms = EXCLUDED.cursor_ms,
            updated_at = NOW()
        """,
        (chain, DATASET_KEY, cursor_ms),
    )


def insert_trades(cur, chain: str, trades: Iterable[dict]) -> int:
    rows = []
    for trade in trades:
        event_ms = int(trade["T"])
        rows.append(
            (
                chain,
                int(trade["a"]),
                ms_to_dt(event_ms),
                ms_to_bucket_dt(event_ms),
                float(trade["p"]),
                float(trade["q"]),
                bool(trade["m"]),
            )
        )

    if not rows:
        return 0

    execute_values(
        cur,
        """
        INSERT INTO market_trades (
            chain, trade_id, event_ts, bucket_ts, price, quantity, is_sell_maker
        )
        VALUES %s
        ON CONFLICT (chain, trade_id) DO NOTHING
        RETURNING 1
        """,
        rows,
        page_size=1000,
    )
    inserted_rows = cur.fetchall()
    return len(inserted_rows)


async def binance_get_with_retry(
    session: aiohttp.ClientSession,
    symbol: str,
    params: dict[str, str],
) -> list[dict]:
    for attempt in range(5):
        try:
            async with session.get(
                BINANCE_AGG_TRADES_URL, params={"symbol": symbol, **params}
            ) as resp:
                if resp.status == 429:
                    wait_s = min(1.5 * (attempt + 1), 6.0)
                    logger.warning(
                        "Rate-limited by Binance for %s, sleeping %.1fs", symbol, wait_s
                    )
                    await asyncio.sleep(wait_s)
                    continue
                resp.raise_for_status()
                payload = await resp.json()
                return payload if isinstance(payload, list) else []
        except aiohttp.ClientError:
            if attempt == 4:
                raise
            wait_s = min(1.5 * (attempt + 1), 6.0)
            await asyncio.sleep(wait_s)
    return []


async def fetch_agg_trades_window(
    session: aiohttp.ClientSession,
    symbol: str,
    start_ms: int,
    end_ms: int,
) -> list[dict]:
    # First page constrained by time range gives us a safe starting trade id.
    first_batch = await binance_get_with_retry(
        session,
        symbol,
        {
            "startTime": str(start_ms),
            "endTime": str(end_ms),
            "limit": "1000",
        },
    )
    if not first_batch:
        return []

    out: list[dict] = []
    out.extend(first_batch)
    last_trade_id = int(first_batch[-1]["a"])

    # Continue by trade id to avoid skipping trades when >1000 share same timestamp.
    while True:
        batch = await binance_get_with_retry(
            session,
            symbol,
            {
                "fromId": str(last_trade_id + 1),
                "limit": "1000",
            },
        )
        if not batch:
            break

        reached_end = False
        for trade in batch:
            trade_ts = int(trade["T"])
            if trade_ts < start_ms:
                continue
            if trade_ts > end_ms:
                reached_end = True
                break
            out.append(trade)

        last_trade_id = int(batch[-1]["a"])
        if reached_end or len(batch) < 1000:
            break

    return out


def upsert_chain_threshold(cur, chain: str):
    cur.execute(
        """
        WITH p AS (
            SELECT percentile_cont(0.99) WITHIN GROUP (ORDER BY quantity) AS threshold_value
            FROM market_trades
            WHERE chain = %s
        )
        INSERT INTO whale_thresholds (chain, percentile, threshold_value, computed_at)
        SELECT %s, 99, COALESCE(threshold_value, 0), NOW()
        FROM p
        ON CONFLICT (chain)
        DO UPDATE SET
            percentile = EXCLUDED.percentile,
            threshold_value = EXCLUDED.threshold_value,
            computed_at = NOW()
        """,
        (chain, chain),
    )


def materialize_flow_buckets(cur, chain: str):
    cur.execute(
        """
        WITH th AS (
            SELECT COALESCE(
                (SELECT threshold_value FROM whale_thresholds WHERE chain = %s),
                0
            )::numeric AS threshold_value
        ),
        agg AS (
            SELECT
                mt.chain,
                mt.bucket_ts,
                SUM(CASE WHEN mt.is_sell_maker THEN 0 ELSE mt.quantity END)::numeric AS exchange_inflow,
                SUM(CASE WHEN mt.is_sell_maker THEN mt.quantity ELSE 0 END)::numeric AS exchange_outflow,
                SUM(CASE WHEN mt.is_sell_maker THEN mt.quantity ELSE -mt.quantity END)::numeric AS net_flow,
                SUM(CASE WHEN mt.quantity >= th.threshold_value THEN mt.quantity ELSE 0 END)::numeric AS whale_volume,
                SUM(CASE WHEN mt.quantity >= th.threshold_value THEN 1 ELSE 0 END)::int AS whale_count,
                COUNT(*)::int AS tx_count
            FROM market_trades mt
            CROSS JOIN th
            WHERE mt.chain = %s
            GROUP BY mt.chain, mt.bucket_ts
        )
        INSERT INTO flow_buckets (
            chain, bucket_ts, exchange_inflow, exchange_outflow,
            net_flow, whale_volume, whale_count, tx_count
        )
        SELECT
            chain, bucket_ts, exchange_inflow, exchange_outflow,
            net_flow, whale_volume, whale_count, tx_count
        FROM agg
        ON CONFLICT (chain, bucket_ts)
        DO UPDATE SET
            exchange_inflow = EXCLUDED.exchange_inflow,
            exchange_outflow = EXCLUDED.exchange_outflow,
            net_flow = EXCLUDED.net_flow,
            whale_volume = EXCLUDED.whale_volume,
            whale_count = EXCLUDED.whale_count,
            tx_count = EXCLUDED.tx_count
        """,
        (chain, chain),
    )


def materialize_price_buckets_chain(cur, chain: str):
    cur.execute(
        """
        WITH ranked AS (
            SELECT
                chain,
                bucket_ts,
                price,
                event_ts,
                trade_id,
                ROW_NUMBER() OVER (
                    PARTITION BY chain, bucket_ts
                    ORDER BY event_ts DESC, trade_id DESC
                ) AS rn
            FROM market_trades
            WHERE chain = %s
        ),
        closes AS (
            SELECT chain, bucket_ts AS timestamp, price::numeric AS close
            FROM ranked
            WHERE rn = 1
        ),
        with_returns AS (
            SELECT
                chain,
                timestamp,
                close,
                CASE
                    WHEN LAG(close) OVER (PARTITION BY chain ORDER BY timestamp) IS NULL THEN NULL
                    WHEN LAG(close) OVER (PARTITION BY chain ORDER BY timestamp) = 0 THEN NULL
                    ELSE
                        (close - LAG(close) OVER (PARTITION BY chain ORDER BY timestamp))
                        / NULLIF(ABS(LAG(close) OVER (PARTITION BY chain ORDER BY timestamp)), 0)
                END AS return_5m
            FROM closes
        )
        INSERT INTO price_buckets_chain (chain, timestamp, close, return_5m)
        SELECT chain, timestamp, close, return_5m
        FROM with_returns
        ON CONFLICT (chain, timestamp)
        DO UPDATE SET
            close = EXCLUDED.close,
            return_5m = EXCLUDED.return_5m
        """,
        (chain,),
    )


def sync_eth_into_legacy_price_buckets(cur):
    cur.execute(
        """
        INSERT INTO price_buckets (timestamp, close, return_5m)
        SELECT timestamp, close, return_5m
        FROM price_buckets_chain
        WHERE chain = 'eth'
        ON CONFLICT (timestamp)
        DO UPDATE SET
            close = EXCLUDED.close,
            return_5m = EXCLUDED.return_5m
        """
    )


def materialize_chain(chain: str):
    logger.info("Materializing derived tables for %s", chain)
    conn = get_conn()
    cur = conn.cursor()
    try:
        upsert_chain_threshold(cur, chain)
        materialize_flow_buckets(cur, chain)
        materialize_price_buckets_chain(cur, chain)
        if chain == "eth":
            sync_eth_into_legacy_price_buckets(cur)
        conn.commit()
    finally:
        cur.close()
        conn.close()


async def ingest_chain(
    chain: str, days: int, chunk_minutes: int, timeout_seconds: float
):
    symbol = SYMBOL_BY_CHAIN[chain]
    now_ms = utc_now_ms()
    start_default_ms = now_ms - (days * 24 * 60 * 60 * 1000)
    checkpoint = get_checkpoint(chain)
    start_ms = max(
        start_default_ms,
        (checkpoint + 1) if checkpoint is not None else start_default_ms,
    )

    if start_ms >= now_ms:
        logger.info("No ingestion needed for %s (already up-to-date)", chain)
        return

    chunk_ms = max(1, chunk_minutes) * 60 * 1000
    total_ms = now_ms - start_ms
    total_chunks = (total_ms + chunk_ms - 1) // chunk_ms
    logger.info(
        "Starting %s ingestion (%s -> %s)",
        chain,
        datetime.fromtimestamp(start_ms / 1000, tz=timezone.utc).isoformat(),
        datetime.fromtimestamp(now_ms / 1000, tz=timezone.utc).isoformat(),
    )

    timeout = aiohttp.ClientTimeout(total=timeout_seconds)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        with tqdm(
            total=total_chunks,
            unit="chunk",
            desc=f"{chain.upper()} backfill",
            dynamic_ncols=True,
        ) as bar:
            cursor = start_ms
            while cursor < now_ms:
                chunk_end = min(cursor + chunk_ms - 1, now_ms)
                trades = await fetch_agg_trades_window(
                    session, symbol, cursor, chunk_end
                )

                conn = get_conn()
                cur = conn.cursor()
                try:
                    inserted = insert_trades(cur, chain, trades)
                    update_checkpoint(cur, chain, chunk_end)
                    conn.commit()
                finally:
                    cur.close()
                    conn.close()

                logger.info(
                    "%s chunk [%s - %s]: fetched=%d inserted=%d",
                    chain,
                    cursor,
                    chunk_end,
                    len(trades),
                    inserted,
                )
                bar.set_postfix(
                    fetched=len(trades),
                    inserted=inserted,
                    start=datetime.fromtimestamp(
                        cursor / 1000, tz=timezone.utc
                    ).strftime("%H:%M"),
                )
                bar.update(1)
                cursor = chunk_end + 1


async def run():
    args = parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s %(levelname)s %(name)s - %(message)s",
    )

    chains = [c.strip().lower() for c in args.chains.split(",") if c.strip()]
    chains = [c for c in chains if c in SYMBOL_BY_CHAIN]
    if not chains:
        raise ValueError("No valid chains selected. Use eth and/or btc.")

    ensure_schema()

    if not args.materialize_only:
        for chain in chains:
            await ingest_chain(
                chain=chain,
                days=args.days,
                chunk_minutes=args.chunk_minutes,
                timeout_seconds=args.http_timeout_seconds,
            )

    for chain in chains:
        materialize_chain(chain)

    logger.info("Backfill finished successfully for chains: %s", ", ".join(chains))


if __name__ == "__main__":
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        logger.warning(
            "Backfill interrupted by user. Progress is checkpointed and resumable."
        )
