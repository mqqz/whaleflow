-- queries used for dune analytics

-- query 1: hourly exchange flow time series (7d)
WITH exchange_labels AS (
  SELECT
    address,
    cex_name
  FROM cex.addresses
  WHERE blockchain = 'ethereum'
),
inflows AS (
  SELECT
    date_trunc('hour', t.block_time) AS bucket_ts,
    SUM(CAST(t.value AS DOUBLE) / 1e18) AS exchange_inflow_eth
  FROM ethereum.transactions t
  JOIN exchange_labels e ON t."to" = e.address
  WHERE t.block_time >= NOW() - INTERVAL '7' day
  GROUP BY date_trunc('hour', t.block_time)
),
outflows AS (
  SELECT
    date_trunc('hour', t.block_time) AS bucket_ts,
    SUM(CAST(t.value AS DOUBLE) / 1e18) AS exchange_outflow_eth
  FROM ethereum.transactions t
  JOIN exchange_labels e ON t."from" = e.address
  WHERE t.block_time >= NOW() - INTERVAL '7' day
  GROUP BY date_trunc('hour', t.block_time)
)
SELECT
  COALESCE(i.bucket_ts, o.bucket_ts) AS bucket_ts,
  COALESCE(i.exchange_inflow_eth, 0) AS exchange_inflow_eth,
  COALESCE(o.exchange_outflow_eth, 0) AS exchange_outflow_eth,
  COALESCE(o.exchange_outflow_eth, 0) - COALESCE(i.exchange_inflow_eth, 0) AS net_flow_eth
FROM inflows i
FULL OUTER JOIN outflows o ON i.bucket_ts = o.bucket_ts
ORDER BY bucket_ts;

-- query 2: per-exchange hourly net flow (top N exchanges, 7d)
WITH exchange_labels AS (
  SELECT address, cex_name
  FROM cex_ethereum.addresses
  WHERE blockchain = 'ethereum'
),
x AS (
  SELECT
    date_trunc('hour', t.block_time) AS bucket_ts,
    e.cex_name,
    SUM(CASE WHEN t."to" = CAST(e.address AS varbinary) THEN CAST(t.value AS DOUBLE)/1e18 ELSE 0 END) AS inflow_eth,
    SUM(CASE WHEN t."from" = CAST(e.address AS varbinary) THEN CAST(t.value AS DOUBLE)/1e18 ELSE 0 END) AS outflow_eth
  FROM ethereum.transactions t
  JOIN exchange_labels e
    ON t."to" = CAST(e.address AS varbinary) OR t."from" = CAST(e.address AS varbinary)
  WHERE t.block_time >= NOW() - INTERVAL '7' day
  GROUP BY 1, 2
)
SELECT
  bucket_ts,
  cex_name,
  inflow_eth,
  outflow_eth,
  outflow_eth - inflow_eth AS net_flow_eth
FROM x
ORDER BY bucket_ts, cex_name;

-- query 3: exchange-centric network edges (24h)
WITH exchange_labels AS (
  SELECT address, cex_name
  FROM cex.addresses
  WHERE blockchain = 'ethereum'
),
tx AS (
  SELECT
    t."from" AS src,
    t."to" AS dst,
    CAST(t.value AS DOUBLE)/1e18 AS value_eth
  FROM ethereum.transactions t
  WHERE t.block_time >= NOW() - INTERVAL '24' hour
    AND t.value > 0
),
enriched AS (
  SELECT
    tx.src, tx.dst, tx.value_eth,
    el_from.cex_name AS src_label,
    el_to.cex_name AS dst_label
  FROM tx
  LEFT JOIN exchange_labels el_from ON tx.src = el_from.address
  LEFT JOIN exchange_labels el_to ON tx.dst = el_to.address
)
SELECT
  src, dst,
  COALESCE(src_label, 'unlabeled') AS src_label,
  COALESCE(dst_label, 'unlabeled') AS dst_label,
  SUM(value_eth) AS total_value_eth,
  COUNT(*) AS tx_count
FROM enriched
WHERE src_label IS NOT NULL OR dst_label IS NOT NULL
GROUP BY 1, 2, 3, 4
ORDER BY total_value_eth DESC
LIMIT 500;
