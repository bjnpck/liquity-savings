// Blockanalitica Sphere API — historical borrow rates
// https://sphere.data.blockanalitica.com/markets/

const SPHERE_API = "https://sphere.data.blockanalitica.com/markets/?sort=-total_supply&page=1&limit=1000";

interface SphereMarket {
  pool_id: string;
  protocol: string;
  network: string;
  underlying_address: string;
  underlying_symbol: string;
  borrow_apy_90d: string | null;
}

// Map our Protocol names to Sphere protocol slugs
const PROTOCOL_MAP: Record<string, string[]> = {
  "Aave v3":     ["aave_v3_core", "aave_v3"],
  "Spark":       ["sparklend"],
  "Compound v3": ["compound_v3"],
  "Maker MCD":   [], // not in Sphere
};

let cache: { data: SphereMarket[]; ts: number } | null = null;

async function fetchSphereMarkets(): Promise<SphereMarket[]> {
  const now = Date.now();
  if (cache && now - cache.ts < 10 * 60_000) return cache.data;

  try {
    const res = await fetch(SPHERE_API, { next: { revalidate: 600 } });
    if (!res.ok) return [];
    const json = await res.json();
    const results: SphereMarket[] = json?.data?.results ?? [];
    cache = { data: results, ts: now };
    return results;
  } catch {
    return cache?.data ?? [];
  }
}

// Returns borrow_apy_90d for a given protocol + underlying token address
export async function get90dBorrowRate(
  protocol: string,
  underlyingAddress: string
): Promise<number | null> {
  const slugs = PROTOCOL_MAP[protocol];
  if (!slugs || slugs.length === 0) return null;

  const markets = await fetchSphereMarkets();
  const match = markets.find(
    (m) =>
      slugs.includes(m.protocol) &&
      m.network === "ethereum" &&
      m.underlying_address.toLowerCase() === underlyingAddress.toLowerCase()
  );

  if (!match?.borrow_apy_90d) return null;
  return parseFloat(match.borrow_apy_90d);
}

// Fetch 90d rates for multiple (protocol, address) pairs at once
export async function get90dBorrowRates(
  queries: { protocol: string; underlyingAddress: string; key: string }[]
): Promise<Record<string, number>> {
  const markets = await fetchSphereMarkets();
  const result: Record<string, number> = {};

  for (const q of queries) {
    const slugs = PROTOCOL_MAP[q.protocol] ?? [];
    const match = markets.find(
      (m) =>
        slugs.includes(m.protocol) &&
        m.network === "ethereum" &&
        m.underlying_address.toLowerCase() === q.underlyingAddress.toLowerCase()
    );
    if (match?.borrow_apy_90d) {
      result[q.key] = parseFloat(match.borrow_apy_90d);
    }
  }

  return result;
}
