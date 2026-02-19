import asyncio
import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import aiohttp
from dotenv import load_dotenv
from web3 import Web3

from db import get_conn

BASE_DIR = Path(__file__).resolve().parent
load_dotenv()
logger = logging.getLogger("ingest")

eth_rpc_url = os.getenv("ETH_RPC_URL")
if not eth_rpc_url:
    raise RuntimeError("ETH_RPC_URL is required")

btc_rpc_url = os.getenv("BTC_RPC_URL")
if not btc_rpc_url:
    raise RuntimeError("BTC_RPC_URL is required")

w3 = Web3(Web3.HTTPProvider(eth_rpc_url))

with (BASE_DIR / "exchange_list.json").open() as f:
    exchange_config = json.load(f)

eth_exchanges = {addr.lower() for addr in exchange_config.get("ethereum", {}).keys()}
btc_exchanges = set(exchange_config.get("bitcoin", {}).keys())

if not btc_exchanges:
    raise RuntimeError(
        "exchange_list.json must include a non-empty 'bitcoin' exchange address map"
    )


def load_threshold(chain: str, default_value: float = 100.0) -> float:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT threshold_value FROM whale_thresholds WHERE chain=%s", (chain,))
    result = cur.fetchone()
    cur.close()
    conn.close()
    return float(result[0]) if result else default_value


def get_bucket(ts: int) -> datetime:
    dt = datetime.fromtimestamp(ts, tz=timezone.utc)
    minute = dt.minute - dt.minute % 5
    return dt.replace(minute=minute, second=0, microsecond=0)


def upsert_bucket_stats(rows: list[tuple]):
    if not rows:
        return

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.executemany(
            """
            INSERT INTO flow_buckets (
                chain, bucket_ts, exchange_inflow, exchange_outflow,
                net_flow, whale_volume, whale_count, tx_count
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (chain, bucket_ts)
            DO UPDATE SET
                exchange_inflow = flow_buckets.exchange_inflow + EXCLUDED.exchange_inflow,
                exchange_outflow = flow_buckets.exchange_outflow + EXCLUDED.exchange_outflow,
                net_flow = flow_buckets.net_flow + EXCLUDED.net_flow,
                whale_volume = flow_buckets.whale_volume + EXCLUDED.whale_volume,
                whale_count = flow_buckets.whale_count + EXCLUDED.whale_count,
                tx_count = flow_buckets.tx_count + EXCLUDED.tx_count
            """,
            rows,
        )
        conn.commit()
    finally:
        cur.close()
        conn.close()


def parse_btc_addresses_from_vout(vout: dict) -> list[str]:
    script = vout.get("scriptPubKey")
    if not isinstance(script, dict):
        return []
    addr = script.get("address")
    if isinstance(addr, str):
        return [addr]
    addrs = script.get("addresses")
    if isinstance(addrs, list):
        return [a for a in addrs if isinstance(a, str)]
    return []


def parse_btc_addresses_from_vin(vin: dict) -> list[str]:
    prevout = vin.get("prevout")
    if not isinstance(prevout, dict):
        return []
    script = prevout.get("scriptPubKey")
    if not isinstance(script, dict):
        return []
    addr = script.get("address")
    if isinstance(addr, str):
        return [addr]
    addrs = script.get("addresses")
    if isinstance(addrs, list):
        return [a for a in addrs if isinstance(a, str)]
    return []


async def btc_rpc_call(
    session: aiohttp.ClientSession, rpc_id: int, method: str, params: list
):
    payload = {"jsonrpc": "1.0", "id": rpc_id, "method": method, "params": params}
    async with session.post(btc_rpc_url, json=payload) as resp:
        resp.raise_for_status()
        data = await resp.json()
        if data.get("error"):
            raise RuntimeError(f"BTC RPC {method} failed: {data['error']}")
        return data.get("result")


async def eth_live_loop():
    last_block = w3.eth.block_number
    whale_threshold = load_threshold("eth", 100.0)

    while True:
        try:
            latest = w3.eth.block_number
            if latest > last_block:
                rows: list[tuple] = []
                for block_num in range(last_block + 1, latest + 1):
                    block = w3.eth.get_block(block_num, full_transactions=True)
                    bucket = get_bucket(int(block.timestamp))

                    exchange_inflow = 0.0
                    exchange_outflow = 0.0
                    whale_volume = 0.0
                    whale_count = 0
                    tx_count = 0

                    for tx in block.transactions:
                        value = float(tx["value"]) / 10**18
                        from_addr = (tx.get("from") or "").lower()
                        to_addr = (tx.get("to") or "").lower()

                        if to_addr in eth_exchanges:
                            exchange_inflow += value
                        if from_addr in eth_exchanges:
                            exchange_outflow += value
                        if value >= whale_threshold:
                            whale_volume += value
                            whale_count += 1
                        tx_count += 1

                    rows.append(
                        (
                            "eth",
                            bucket,
                            exchange_inflow,
                            exchange_outflow,
                            exchange_outflow - exchange_inflow,
                            whale_volume,
                            whale_count,
                            tx_count,
                        )
                    )

                upsert_bucket_stats(rows)
                last_block = latest
        except Exception:
            logger.exception("ETH live ingestion error")
            await asyncio.sleep(3)
            continue

        await asyncio.sleep(5)


async def btc_live_loop():
    timeout = aiohttp.ClientTimeout(total=20)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        last_block = int(await btc_rpc_call(session, 1, "getblockcount", []))
        whale_threshold = load_threshold("btc", 100.0)

        while True:
            try:
                latest = int(await btc_rpc_call(session, 2, "getblockcount", []))
                if latest > last_block:
                    rows: list[tuple] = []
                    for block_height in range(last_block + 1, latest + 1):
                        block_hash = await btc_rpc_call(
                            session,
                            10_000 + block_height,
                            "getblockhash",
                            [block_height],
                        )
                        block = await btc_rpc_call(
                            session,
                            20_000 + block_height,
                            "getblock",
                            [block_hash, 2],
                        )

                        block_time = int(block.get("time", 0))
                        if block_time <= 0:
                            block_time = int(time.time())
                        bucket = get_bucket(block_time)

                        exchange_inflow = 0.0
                        exchange_outflow = 0.0
                        whale_volume = 0.0
                        whale_count = 0
                        tx_count = 0

                        for tx in block.get("tx", []):
                            if not isinstance(tx, dict):
                                continue
                            total_amount = 0.0
                            tx_exchange_inflow = 0.0
                            tx_exchange_outflow = 0.0

                            for vout in tx.get("vout", []):
                                if not isinstance(vout, dict):
                                    continue
                                value = vout.get("value")
                                if not isinstance(value, (int, float)):
                                    continue
                                value_f = float(value)
                                total_amount += value_f
                                out_addresses = parse_btc_addresses_from_vout(vout)
                                if any(a in btc_exchanges for a in out_addresses):
                                    tx_exchange_inflow += value_f

                            for vin in tx.get("vin", []):
                                if isinstance(vin, dict):
                                    in_addresses = parse_btc_addresses_from_vin(vin)
                                    prevout = vin.get("prevout")
                                    if not isinstance(prevout, dict):
                                        continue
                                    value = prevout.get("value")
                                    if not isinstance(value, (int, float)):
                                        continue
                                    if any(a in btc_exchanges for a in in_addresses):
                                        tx_exchange_outflow += float(value)

                            exchange_inflow += tx_exchange_inflow
                            exchange_outflow += tx_exchange_outflow

                            if total_amount >= whale_threshold:
                                whale_volume += total_amount
                                whale_count += 1
                            tx_count += 1

                        rows.append(
                            (
                                "btc",
                                bucket,
                                exchange_inflow,
                                exchange_outflow,
                                exchange_outflow - exchange_inflow,
                                whale_volume,
                                whale_count,
                                tx_count,
                            )
                        )

                    upsert_bucket_stats(rows)
                    last_block = latest
            except Exception:
                logger.exception("BTC live ingestion error")
                await asyncio.sleep(3)
                continue

            await asyncio.sleep(5)


async def live_loop():
    eth_task = asyncio.create_task(eth_live_loop())
    btc_task = asyncio.create_task(btc_live_loop())
    try:
        await asyncio.gather(eth_task, btc_task)
    finally:
        eth_task.cancel()
        btc_task.cancel()
        await asyncio.gather(eth_task, btc_task, return_exceptions=True)
