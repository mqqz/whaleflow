CREATE OR REPLACE TABLE `whaleflow.agg_tier_exchange_flow_hourly`
PARTITION BY DATE(bucket_ts)
AS
WITH
exchanges AS (
  SELECT DISTINCT LOWER(CAST(address AS STRING)) AS address
  FROM `cex.labels`
  WHERE address IS NOT NULL
),

candidate_addresses AS (
  SELECT DISTINCT t.from_address AS address
  FROM `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.transactions_by_to_address` t
  JOIN exchanges e ON t.to_address = e.address
  WHERE t.block_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    AND t.value > 0

  UNION DISTINCT

  SELECT DISTINCT t.to_address AS address
  FROM `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.transactions_by_from_address` t
  JOIN exchanges e ON t.from_address = e.address
  WHERE t.block_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    AND t.value > 0
),

latest_state AS (
  SELECT
    s.address,
    SAFE_DIVIDE(CAST(s.balance AS BIGNUMERIC), CAST(1e18 AS BIGNUMERIC)) AS balance_eth
  FROM `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.accounts_state_by_address` s
  JOIN candidate_addresses c ON s.address = c.address
  QUALIFY ROW_NUMBER() OVER (PARTITION BY s.address ORDER BY s.block_timestamp DESC) = 1
),

-- Assign tier (exclude exchanges so Binance cold wallet doesn't become a "whale")
tiers AS (
  SELECT
    s.address,
    s.balance_eth,
    CASE
      WHEN s.balance_eth < 100 THEN 'shrimp'
      WHEN s.balance_eth < 1000 THEN 'dolphin'
      WHEN s.balance_eth < 10000 THEN 'shark'
      ELSE 'whale'
    END AS tier
  FROM latest_state s
  LEFT JOIN exchanges e ON s.address = e.address
  WHERE e.address IS NULL
),

to_exchange AS (
  SELECT
    TIMESTAMP_TRUNC(t.block_timestamp, HOUR) AS bucket_ts,
    tr.tier,
    SUM(SAFE_DIVIDE(t.value, 1e18)) AS tier_exchange_inflow_eth
  FROM `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.transactions_by_to_address` t
  JOIN exchanges e ON t.to_address = e.address
  JOIN tiers tr   ON t.from_address = tr.address
  WHERE t.block_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    AND t.value > 0
  GROUP BY bucket_ts, tier
),

from_exchange AS (
  SELECT
    TIMESTAMP_TRUNC(t.block_timestamp, HOUR) AS bucket_ts,
    tr.tier,
    SUM(SAFE_DIVIDE(t.value, 1e18)) AS tier_exchange_outflow_eth
  FROM `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.transactions_by_from_address` t
  JOIN exchanges e ON t.from_address = e.address
  JOIN tiers tr   ON t.to_address = tr.address
  WHERE t.block_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    AND t.value > 0
  GROUP BY bucket_ts, tier
)

SELECT
  COALESCE(i.bucket_ts, o.bucket_ts) AS bucket_ts,
  COALESCE(i.tier, o.tier) AS tier,
  COALESCE(i.tier_exchange_inflow_eth, 0)  AS tier_exchange_inflow_eth,
  COALESCE(o.tier_exchange_outflow_eth, 0) AS tier_exchange_outflow_eth,
  COALESCE(o.tier_exchange_outflow_eth, 0) - COALESCE(i.tier_exchange_inflow_eth, 0)
    AS tier_exchange_net_flow_eth
FROM to_exchange i
FULL OUTER JOIN from_exchange o
  ON i.bucket_ts = o.bucket_ts AND i.tier = o.tier;