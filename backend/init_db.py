from db import get_conn


def init_db():
    conn = get_conn()
    cur = conn.cursor()

    # Flow buckets
    cur.execute("""
        CREATE TABLE IF NOT EXISTS flow_buckets (
            id SERIAL PRIMARY KEY,
            chain TEXT NOT NULL,
            bucket_ts TIMESTAMP NOT NULL,
            exchange_inflow NUMERIC DEFAULT 0,
            exchange_outflow NUMERIC DEFAULT 0,
            net_flow NUMERIC DEFAULT 0,
            whale_volume NUMERIC DEFAULT 0,
            whale_count INTEGER DEFAULT 0,
            tx_count INTEGER DEFAULT 0,
            UNIQUE(chain, bucket_ts)
        );
    """)

    # Price buckets
    cur.execute("""
        CREATE TABLE IF NOT EXISTS price_buckets (
            timestamp TIMESTAMP PRIMARY KEY,
            close NUMERIC,
            return_5m NUMERIC
        );
    """)

    # Chain-aware price buckets for multi-asset backfills.
    cur.execute("""
        CREATE TABLE IF NOT EXISTS price_buckets_chain (
            chain TEXT NOT NULL,
            timestamp TIMESTAMP NOT NULL,
            close NUMERIC,
            return_5m NUMERIC,
            PRIMARY KEY (chain, timestamp)
        );
    """)

    # Index for fast lookups on flow buckets by timestamp
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_flow_bucket_ts
        ON flow_buckets(bucket_ts);
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_price_buckets_chain_ts
        ON price_buckets_chain(chain, timestamp);
    """)

    # Whale thresholds
    cur.execute("""
        CREATE TABLE IF NOT EXISTS whale_thresholds (
            chain TEXT PRIMARY KEY,
            percentile NUMERIC,
            threshold_value NUMERIC,
            computed_at TIMESTAMP DEFAULT NOW()
        );
    """)

    # Raw market trades used to materialize flow/price/threshold tables.
    cur.execute("""
        CREATE TABLE IF NOT EXISTS market_trades (
            chain TEXT NOT NULL,
            trade_id BIGINT NOT NULL,
            event_ts TIMESTAMP NOT NULL,
            bucket_ts TIMESTAMP NOT NULL,
            price NUMERIC NOT NULL,
            quantity NUMERIC NOT NULL,
            is_sell_maker BOOLEAN NOT NULL,
            PRIMARY KEY (chain, trade_id)
        );
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_market_trades_chain_bucket
        ON market_trades(chain, bucket_ts);
    """)

    # Backfill progress checkpoints for resumable jobs.
    cur.execute("""
        CREATE TABLE IF NOT EXISTS backfill_state (
            chain TEXT NOT NULL,
            dataset TEXT NOT NULL,
            cursor_ms BIGINT NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW(),
            PRIMARY KEY (chain, dataset)
        );
    """)

    # Raw on-chain transfers used for BTC RPC-driven flow derivations.
    cur.execute("""
        CREATE TABLE IF NOT EXISTS onchain_transfers (
            chain TEXT NOT NULL,
            txid TEXT NOT NULL,
            block_height BIGINT NOT NULL,
            event_ts TIMESTAMP NOT NULL,
            bucket_ts TIMESTAMP NOT NULL,
            amount NUMERIC NOT NULL,
            fee NUMERIC DEFAULT 0,
            PRIMARY KEY (chain, txid)
        );
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_onchain_transfers_chain_bucket
        ON onchain_transfers(chain, bucket_ts);
    """)

    conn.commit()
    cur.close()
    conn.close()

    print("Database initialized successfully.")


if __name__ == "__main__":
    init_db()
