import pandas as pd
from db import get_conn


def compute_volatility(window=12):
    conn = get_conn()
    df = pd.read_sql(
        "SELECT timestamp, return_5m FROM price_buckets ORDER BY timestamp", conn
    )
    conn.close()

    df["volatility"] = df["return_5m"].rolling(window).std()
    return df[["timestamp", "volatility"]].dropna()


def compute_correlation(window=288):
    conn = get_conn()

    price = pd.read_sql(
        "SELECT timestamp, return_5m FROM price_buckets ORDER BY timestamp", conn
    )
    flow = pd.read_sql(
        "SELECT bucket_ts as timestamp, net_flow FROM flow_buckets ORDER BY bucket_ts",
        conn,
    )

    conn.close()

    df = price.merge(flow, on="timestamp", how="inner")
    df["corr"] = df["net_flow"].rolling(window).corr(df["return_5m"])

    return df[["timestamp", "corr"]].dropna()
