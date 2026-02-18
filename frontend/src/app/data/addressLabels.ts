export type AddressTag = "exchange" | "router" | "bridge" | "contract" | "unknown";

interface LabelConfig {
  exact: string[];
  contains: string[];
}

const LABELS: Record<AddressTag, LabelConfig> = {
  exchange: {
    exact: [],
    contains: ["binance", "coinbase", "kraken", "okx", "bybit", "kucoin", "gate", "exchange"],
  },
  router: {
    exact: [],
    contains: ["router", "uniswap", "sushiswap", "pancake", "curve"],
  },
  bridge: {
    exact: [],
    contains: ["bridge", "hop", "stargate", "wormhole"],
  },
  contract: {
    exact: [],
    contains: ["contract", "vault", "staking", "pool"],
  },
  unknown: {
    exact: [],
    contains: [],
  },
};

export function detectAddressTag(address: string): AddressTag {
  const raw = address.trim();
  const lower = raw.toLowerCase();
  if (!lower) {
    return "unknown";
  }

  for (const tag of ["exchange", "router", "bridge", "contract"] as const) {
    const config = LABELS[tag];
    if (config.exact.some((value) => value.toLowerCase() === lower)) {
      return tag;
    }
    if (config.contains.some((value) => lower.includes(value.toLowerCase()))) {
      return tag;
    }
  }

  return "unknown";
}

export function isExchangeAddress(address: string): boolean {
  return detectAddressTag(address) === "exchange";
}
