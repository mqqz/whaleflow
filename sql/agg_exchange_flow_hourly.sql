CREATE OR REPLACE TABLE `whaleflow.agg_exchange_flow_hourly`
PARTITION BY DATE(bucket_ts)
AS
WITH exchanges AS (
  SELECT DISTINCT LOWER(CAST(address AS STRING)) AS address
  FROM `cex.labels`
  WHERE address IS NOT NULL
),

inflows AS (
  SELECT
    TIMESTAMP_TRUNC(t.block_timestamp, HOUR) AS bucket_ts,
    SUM(SAFE_DIVIDE(t.value, 1e18)) AS exchange_inflow_eth
  FROM exchanges e
  JOIN `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.transactions_by_to_address` t
    ON t.to_address = e.address
  WHERE t.block_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    AND t.value > 0
  GROUP BY bucket_ts
),

outflows AS (
  SELECT
    TIMESTAMP_TRUNC(t.block_timestamp, HOUR) AS bucket_ts,
    SUM(SAFE_DIVIDE(t.value, 1e18)) AS exchange_outflow_eth
  FROM exchanges e
  JOIN `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.transactions_by_from_address` t
    ON t.from_address = e.address
  WHERE t.block_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    AND t.value > 0
  GROUP BY bucket_ts
)

SELECT
  COALESCE(i.bucket_ts, o.bucket_ts) AS bucket_ts,
  COALESCE(i.exchange_inflow_eth, 0) AS exchange_inflow_eth,
  COALESCE(o.exchange_outflow_eth, 0) AS exchange_outflow_eth,
  COALESCE(o.exchange_outflow_eth, 0) - COALESCE(i.exchange_inflow_eth, 0) AS net_flow_eth
FROM inflows i
FULL OUTER JOIN outflows o
  ON i.bucket_ts = o.bucket_ts;
