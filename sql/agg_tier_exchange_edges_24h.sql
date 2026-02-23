-- Tier ↔ Exchange network-graph edges (24h)
-- Output is directly usable by your frontend graph:
--   src_node, dst_node, src_type, dst_type, tier, cex_name, total_value_eth, tx_count
--
-- Uses Google Blockchain Analytics tables + your cex.labels:
-- - transactions_by_to_address / transactions_by_from_address for cheap address filtering
-- - accounts_state_by_address pruned to only exchange counterparties in last 24h
-- - tiers computed from latest balance (ETH) and exchanges excluded from tiering

CREATE OR REPLACE TABLE `whaleflow.agg_tier_exchange_edges_24h`
AS
WITH
-- Exchange dimension (small)
exchanges AS (
  SELECT DISTINCT
    LOWER(CAST(address AS STRING)) AS address,
    CAST(cex_name AS STRING) AS cex_name
  FROM `cex.labels`
  WHERE address IS NOT NULL
),

-- Candidate counterparties (prunes the state scan)
candidate_counterparties AS (
  SELECT DISTINCT t.from_address AS address
  FROM `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.transactions_by_to_address` t
  JOIN exchanges e
    ON t.to_address = e.address
  WHERE t.block_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
    AND t.value > 0

  UNION DISTINCT

  SELECT DISTINCT t.to_address AS address
  FROM `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.transactions_by_from_address` t
  JOIN exchanges e
    ON t.from_address = e.address
  WHERE t.block_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
    AND t.value > 0
),

-- Latest balance only for candidates
candidate_latest_state AS (
  SELECT
    s.address,
    SAFE_DIVIDE(CAST(s.balance AS BIGNUMERIC), CAST(1e18 AS BIGNUMERIC)) AS balance_eth
  FROM `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.accounts_state_by_address` s
  JOIN candidate_counterparties c
    ON s.address = c.address
  QUALIFY ROW_NUMBER() OVER (PARTITION BY s.address ORDER BY s.block_timestamp DESC) = 1
),

-- Tier assignment (exclude exchanges so they don't become "whales")
tiers AS (
  SELECT
    s.address,
    CASE
      WHEN s.balance_eth < 100 THEN 'shrimp'
      WHEN s.balance_eth < 1000 THEN 'dolphin'
      WHEN s.balance_eth < 10000 THEN 'shark'
      ELSE 'whale'
    END AS tier
  FROM candidate_latest_state s
  LEFT JOIN exchanges e
    ON s.address = e.address
  WHERE e.address IS NULL
),

-- Deposits: tier -> exchange  (from = tier address, to = exchange address)
tier_to_exchange AS (
  SELECT
    CONCAT('tier:', tr.tier) AS src_node,
    CONCAT('cex:', e.cex_name) AS dst_node,
    'tier' AS src_type,
    'exchange' AS dst_type,
    tr.tier AS tier,
    e.cex_name AS cex_name,
    SUM(SAFE_DIVIDE(t.value, 1e18)) AS total_value_eth,
    COUNT(*) AS tx_count
  FROM `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.transactions_by_to_address` t
  JOIN exchanges e
    ON t.to_address = e.address
  JOIN tiers tr
    ON t.from_address = tr.address
  WHERE t.block_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
    AND t.value > 0
  GROUP BY src_node, dst_node, src_type, dst_type, tier, cex_name
),

-- Withdrawals: exchange -> tier (from = exchange address, to = tier address)
exchange_to_tier AS (
  SELECT
    CONCAT('cex:', e.cex_name) AS src_node,
    CONCAT('tier:', tr.tier) AS dst_node,
    'exchange' AS src_type,
    'tier' AS dst_type,
    tr.tier AS tier,
    e.cex_name AS cex_name,
    SUM(SAFE_DIVIDE(t.value, 1e18)) AS total_value_eth,
    COUNT(*) AS tx_count
  FROM `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.transactions_by_from_address` t
  JOIN exchanges e
    ON t.from_address = e.address
  JOIN tiers tr
    ON t.to_address = tr.address
  WHERE t.block_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
    AND t.value > 0
  GROUP BY src_node, dst_node, src_type, dst_type, tier, cex_name
)

SELECT * FROM tier_to_exchange
UNION ALL
SELECT * FROM exchange_to_tier;