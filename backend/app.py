import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi import Query

from db import get_conn
from ingest import live_loop
from metrics import compute_correlation, compute_volatility


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(live_loop())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(lifespan=lifespan)


@app.get("/impact")
def get_impact(
    chain: str | None = Query(default=None, pattern="^(eth|btc)$"),
    limit: int = Query(default=1000, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
):
    conn = get_conn()
    cur = conn.cursor()
    if chain:
        cur.execute(
            """
            SELECT chain, bucket_ts, exchange_inflow, exchange_outflow,
                   net_flow, whale_volume, whale_count, tx_count
            FROM flow_buckets
            WHERE chain = %s
            ORDER BY bucket_ts DESC
            LIMIT %s OFFSET %s
            """,
            (chain, limit, offset),
        )
    else:
        cur.execute(
            """
            SELECT chain, bucket_ts, exchange_inflow, exchange_outflow,
                   net_flow, whale_volume, whale_count, tx_count
            FROM flow_buckets
            ORDER BY bucket_ts DESC
            LIMIT %s OFFSET %s
            """,
            (limit, offset),
        )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows


@app.get("/metrics/volatility")
def volatility():
    return compute_volatility().to_dict(orient="records")


@app.get("/metrics/correlation")
def correlation():
    return compute_correlation().to_dict(orient="records")
