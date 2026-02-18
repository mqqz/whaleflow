import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from backend.db import get_conn
from backend.ingest import live_loop
from backend.metrics import compute_correlation, compute_volatility


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
def get_impact():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT bucket_ts, exchange_inflow, exchange_outflow,
               net_flow, whale_volume, whale_count
        FROM flow_buckets
        ORDER BY bucket_ts
    """)
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
