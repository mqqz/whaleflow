export type FlowTier = "shrimp" | "dolphin" | "shark" | "whale";

export type ExchangeFlowPoint = {
  bucket_ts: Date;
  exchange_inflow_eth: number;
  exchange_outflow_eth: number;
  net_flow_eth: number;
};

export type TierExchangeFlowPoint = {
  bucket_ts: Date;
  tier: FlowTier;
  tier_exchange_inflow_eth: number;
  tier_exchange_outflow_eth: number;
  tier_exchange_net_flow_eth: number;
};

export type TierExchangeEdge = {
  src_node: string;
  dst_node: string;
  src_type: "tier" | "exchange";
  dst_type: "tier" | "exchange";
  tier: FlowTier | string;
  cex_name: string;
  total_value_eth: number;
  tx_count: number;
};
