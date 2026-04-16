// CoinGecko free API for token prices
const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

const TOKEN_IDS: Record<string, string> = {
  ETH: "ethereum",
  WETH: "weth",
  wstETH: "wrapped-steth",
  rETH: "rocket-pool-eth",
  stETH: "staked-ether",
  cbETH: "coinbase-wrapped-staked-eth",
  WBTC: "wrapped-bitcoin",
  USDC: "usd-coin",
  USDT: "tether",
  DAI: "dai",
  LUSD: "liquity-usd",
  BOLD: "liquity-bold",
  GHO: "gho",
  USDS: "sky",
};

let priceCache: Record<string, number> = {};
let lastFetch = 0;

export async function getTokenPrices(symbols: string[]): Promise<Record<string, number>> {
  const now = Date.now();
  // 60s cache
  if (now - lastFetch < 60_000 && Object.keys(priceCache).length > 0) {
    return priceCache;
  }

  const ids = Array.from(new Set(symbols.map((s) => TOKEN_IDS[s]).filter(Boolean)));
  if (ids.length === 0) return {};

  try {
    const res = await fetch(
      `${COINGECKO_BASE}/simple/price?ids=${ids.join(",")}&vs_currencies=usd`,
      { next: { revalidate: 60 } }
    );
    const data = await res.json();

    const result: Record<string, number> = {};
    for (const [symbol, id] of Object.entries(TOKEN_IDS)) {
      if (data[id]?.usd) {
        result[symbol] = data[id].usd;
        priceCache[symbol] = data[id].usd;
      }
    }
    lastFetch = now;
    return result;
  } catch {
    return priceCache;
  }
}

export async function getTokenPrice(symbol: string): Promise<number> {
  const prices = await getTokenPrices([symbol]);
  return prices[symbol] ?? 0;
}
