<h1 align="center">
  <img src="https://github.com/mqqz/whaleflow/blob/main/public/icons/logo_text.png" height=150px alt="WhaleFlow Logo">
  <br/>
  Live crypto on-chain flow intelligence
</h1>
<p align="center">
<a href="#project-overview">Overview</a> &nbsp;&bull;&nbsp;
<a href="#data-sources">Data Sources</a> &nbsp;&bull;&nbsp;
<a href="#methodology">Methodology</a> &nbsp;&bull;&nbsp;
<a href="#dashboard">Dashboard</a> &nbsp;&bull;&nbsp;
<a href="#design">Design</a> &nbsp;&bull;&nbsp;
<a href="#key-insights">Insights</a> &nbsp;&bull;&nbsp;
<a href="#limitations">Limitations</a>
<a 
</p>

## Project Overview

Blockchain markets provide a rare opportunity in finance: transactional transparency at scale. However, raw blockchain data is not inherently insightful. It arrives in base units, unstructured formats, and millions of records that say little on their own. The data is plentiful, almost excessive, so this end the goal was not to merely build a “crypto dashboard”, but to disentangle high-volume transactional data and into interpretable financial signals.

_WhaleFlow_ is a live analytics dashboard focused on analyzing capital flows within ETH blockchain. More specifically, we monitor how big players, e.g. [whales](https://bitcoinwiki.org/wiki/whales) or exchanges, play their hands. The dashboard examines how capital is moving in-and-out of exchanges/whales and at what scale, to understand shifts in market behavior before they fully materialise in visible trends.

The core question behind the project is straightforward:

> What does capital flow tell us about positioning, liquidity pressure, and potential market imbalance?

#### Main Functionality

- Live Transaction Feed Analytics
- Aggregated Summary of Network Flow Dynamics
- Key Market KPIs Derived from Flow Trends
- Wallet Explorer to Zoom-in Key Wallets

## Data Sources

- **CoinGecko Public API**  
  Used to retrieve real-time and historical market data including price, market capitalization, and trading volume for major cryptocurrencies.
  This data was integrated to contextualize on-chain capital flows against broader market conditions.  
  Documentation: https://www.coingecko.com/en/api/documentation  
  API Base: https://api.coingecko.com/api/v3/

- **PublicNode Ethereum RPC (WebSockets)**  
  Leveraged for streaming live Ethereum transaction data via WebSocket connections. This enabled monitoring of real-time transfers, particularly high-value transactions (“whale” activity), without maintaining a private node infrastructure.  
  Documentation: https://publicnode.com/  
  Ethereum WSS Endpoint: wss://ethereum.publicnode.com

- **Dune Address Labels**  
  Used exchange-labeled wallet datasets curated by the Dune community to classify transactions as exchange inflows or outflows.
  These labels were essential for transforming raw address-level transfers into meaningful liquidity flow metrics.  
  Platform: https://dune.com/  
  Example Labels Dataset: https://dune.com/labels

- **Google BigQuery (Public Blockchain Datasets)**  
  Queried Ethereum transaction data from Google BigQuery’s public crypto datasets to efficiently aggregate high-volume historical transaction records using SQL.
  BigQuery served as the primary data warehouse for large-scale transformations and time-based aggregations.  
  Public Datasets: https://cloud.google.com/bigquery/public-data  
  Crypto Ethereum Dataset: https://console.cloud.google.com/marketplace/product/ethereum/crypto-ethereum

## Methodology

This section outlines the analytical workflow used to transform raw blockchain transaction data into structured liquidity metrics and decision-support insights.

### Data Cleaning

Blockchain data is inherently raw and unstructured. Before analysis, the following cleaning steps were performed:

- **Unit Normalization:** Converted transaction values from wei to ETH to ensure interpretability and consistency.
- **Address Filtering:** Isolated transactions involving known exchange wallets using curated label datasets.
- **Duplicate Prevention:** Ensured transactions were not double-counted when aggregating inflows and outflows.
- **Timestamp Standardization:** Normalized block timestamps and aligned them into consistent hourly time buckets.
- **Outlier Inspection:** Reviewed extreme transaction values to confirm validity and distinguish genuine large transfers from anomalies.

The objective at this stage was structural correctness, ensuring that every downstream metric was built on reliable, validated data.

### Data Transformation

Once cleaned, the data was transformed into business-relevant financial signals.

Key transformations included:

- Aggregating transactions into **hourly inflow and outflow volumes**
- Computing **net exchange flow (inflow – outflow)**
- Identifying **large transaction thresholds** to flag potential whale activity
- Structuring derived metrics into time-series format for trend analysis

All transformations were implemented in SQL within a warehouse-style environment (Google BigQuery), simulating production-grade data workflows.

This layer served as the bridge between raw ledger entries and interpretable liquidity indicators.

### Analytical Approach

The analytical framework focused on capital positioning rather than price prediction.

Core principles included:

- **Flow-Based Interpretation:** Treating exchange inflows as potential liquidity supply and outflows as liquidity contraction.
- **Trend Identification:** Observing sustained inflow or outflow regimes rather than isolated spikes.
- **Momentum Shifts:** Monitoring net flow reversals as potential positioning changes.
- **Clustering Analysis:** Identifying periods where large transactions occur in concentrated intervals.

The analysis avoids over-attributing causality. Instead, it provides contextual signals that support informed interpretation and monitoring.

### Tool Selection

Tools were selected based on scalability, reliability, and alignment with modern analytics workflows:

- **Google BigQuery:** Chosen for efficient querying of large-scale Ethereum transaction datasets using SQL.
- **CoinGecko API:** Integrated for market data context (price, market cap).
- **PublicNode Ethereum WebSockets:** Used for real-time transaction streaming without maintaining a private node.
- **Dune Address Labels:** Leveraged for exchange wallet classification.

The stack reflects a practical, production-adjacent data analytics environment rather than a purely exploratory setup.

### Design Decisions

The dashboard was designed with clarity and stakeholder usability as primary constraints.

Key decisions included:

- **Hierarchy First:** High-level KPIs appear before detailed time-series charts.
- **Minimal Visual Noise:** Limited color palette (black + blue) to emphasize signal over decoration.
- **Clear Metric Naming:** Financial terminology over technical blockchain jargon.
- **Progressive Disclosure:** Allow users to move from summary metrics to granular trend inspection.

The aim was not to create a dense visualization, but to build a monitoring interface that supports rapid interpretation and informed decision-making.

### Summary

The methodology follows a structured analytical pipeline:

Raw Blockchain Data -> Cleaning & Validation -> Aggregation & KPI Construction -> Trend Analysis -> Dashboard Communication

Each stage was designed to ensure that insights are grounded in accurate data, clearly defined metrics, and stakeholder-oriented presentation.

## Dashboard

![Live Network Graph](https://github.com/mqqz/whaleflow/blob/main/screencaps/live_network.gif)

## Design

The dashboard follows three principles:

- Clarity over complexity

- Hierarchy over clutter

- Signal over spectacle

Color contrast (black + blue) was chosen to reinforce focus and reduce distraction.

Metrics are labeled in business terms, not technical jargon.

The layout moves from summary -> trend -> anomaly.

## Key Insights

Observations:

- Extended inflow regimes may signal accumulation of sell-side liquidity.
- Persistent net negative flow indicates capital leaving exchanges — potential supply tightening.
- Whale activity tends to cluster around inflection points.

Practical Recommendation

If integrated into a broader monitoring system:

- Track multi-hour inflow streaks as potential sell pressure indicators.
- Use net flow reversals as momentum alerts.
- Flag abnormal transaction clusters for deeper investigation.

This is best positioned as a monitoring complement, not a standalone trading model.

## Live Dashboard Link

Go ahead and try it out:
[Live Dashboard Link](https://mosadhan.com/whaleflow)

## Limitations

No dataset is complete.

This analysis assumes:

- Exchange wallet labels are sufficiently accurate
- On-chain activity reflects meaningful positioning
- Hourly aggregation captures relevant signal granularity

Limitations include:

- No integration of price correlation
- Off-chain or OTC activity is excluded
- Intent cannot be inferred from transaction alone
- Future iterations would incorporate price impact modeling and cross-asset correlation.
