-- Whale ↔ Exchange hourly flow (7d)
-- Whale = balance-based using latest state from accounts_state_by_address
-- Net convention: outflow - inflow (positive = whales withdrawing from exchanges / accumulation bias)

CREATE OR REPLACE TABLE `whaleflow.agg_whale_exchange_flow_hourly`
PARTITION BY DATE(bucket_ts)
AS
WITH
-- exchanges dimension (small)
exchanges AS (
  SELECT DISTINCT LOWER(CAST(address AS STRING)) AS address
  FROM `cex.labels`
  WHERE address IS NOT NULL
),

-- candidate whale addresses = exchange counterparties in last 7d (prunes state scan)
candidate_whale_addresses AS (
  SELECT DISTINCT t.from_address AS address
  FROM `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.transactions_by_to_address` t
  JOIN exchanges e
    ON t.to_address = e.address
  WHERE t.block_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    AND t.value > 0

  UNION DISTINCT

  SELECT DISTINCT t.to_address AS address
  FROM `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.transactions_by_from_address` t
  JOIN exchanges e
    ON t.from_address = e.address
  WHERE t.block_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    AND t.value > 0
),

-- latest balance for only those candidates
candidate_latest_state AS (
  SELECT
    s.address,
    SAFE_DIVIDE(CAST(s.balance AS BIGNUMERIC), CAST(1e18 AS BIGNUMERIC)) AS balance_eth
  FROM `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.accounts_state_by_address` s
  JOIN candidate_whale_addresses c
    ON s.address = c.address
  QUALIFY ROW_NUMBER() OVER (PARTITION BY s.address ORDER BY s.block_timestamp DESC) = 1
),

-- whale set (exclude exchanges)
whales AS (
  SELECT s.address
  FROM candidate_latest_state s
  LEFT JOIN exchanges e
    ON s.address = e.address
  WHERE e.address IS NULL
    AND s.balance_eth >= 10000.0   -- <-- whale threshold (ETH)
),

-- Whale -> Exchange (deposit to exchange)
whale_to_exchange AS (
  SELECT
    TIMESTAMP_TRUNC(t.block_timestamp, HOUR) AS bucket_ts,
    SUM(SAFE_DIVIDE(t.value, 1e18)) AS whale_exchange_inflow_eth
  FROM `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.transactions_by_to_address` t
  JOIN exchanges e
    ON t.to_address = e.address
  JOIN whales w
    ON t.from_address = w.address
  WHERE t.block_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    AND t.value > 0
  GROUP BY bucket_ts
),

-- Exchange -> Whale (withdrawal)
exchange_to_whale AS (
  SELECT
    TIMESTAMP_TRUNC(t.block_timestamp, HOUR) AS bucket_ts,
    SUM(SAFE_DIVIDE(t.value, 1e18)) AS whale_exchange_outflow_eth
  FROM `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.transactions_by_from_address` t
  JOIN exchanges e
    ON t.from_address = e.address
  JOIN whales w
    ON t.to_address = w.address
  WHERE t.block_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    AND t.value > 0
  GROUP BY bucket_ts
)

SELECT
  COALESCE(i.bucket_ts, o.bucket_ts) AS bucket_ts,
  COALESCE(i.whale_exchange_inflow_eth, 0)  AS whale_exchange_inflow_eth,
  COALESCE(o.whale_exchange_outflow_eth, 0) AS whale_exchange_outflow_eth,
  COALESCE(o.whale_exchange_outflow_eth, 0) - COALESCE(i.whale_exchange_inflow_eth, 0)
    AS whale_exchange_net_flow_eth
FROM whale_to_exchange i
FULL OUTER JOIN exchange_to_whale o
  ON i.bucket_ts = o.bucket_ts;