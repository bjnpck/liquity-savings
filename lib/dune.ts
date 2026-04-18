// Dune Analytics — Liquity V2 historical borrow rates (query 6776554)

const DUNE_QUERY_URL = "https://api.dune.com/api/v1/query/6776554/results?limit=1000";

interface DuneRow {
  month: string;
  WETH_avg: number | null;
  wstETH_avg: number | null;
  rETH_avg: number | null;
}

const COLLATERAL_COLUMN: Record<string, keyof DuneRow> = {
  WETH:   "WETH_avg",
  wstETH: "wstETH_avg",
  rETH:   "rETH_avg",
};

let cache: { data: DuneRow[]; ts: number } | null = null;

async function fetchDuneRows(): Promise<DuneRow[]> {
  const now = Date.now();
  if (cache && now - cache.ts < 10 * 60_000) return cache.data;

  const apiKey = process.env.DUNE_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch(DUNE_QUERY_URL, {
      headers: { "X-DUNE-API-KEY": apiKey },
      next: { revalidate: 600 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    const rows: DuneRow[] = json?.result?.rows ?? [];
    cache = { data: rows, ts: now };
    return rows;
  } catch {
    return cache?.data ?? [];
  }
}

// True time-weighted 90-day average rate for a Liquity V2 collateral branch.
// Dune rows are monthly; each row is clamped to the 90-day window and weighted
// by the number of days it contributes.
export async function getLiquity90dAvgRate(collateral: string): Promise<number | undefined> {
  const col = COLLATERAL_COLUMN[collateral];
  if (!col) return undefined;

  const rows = await fetchDuneRows();
  if (rows.length === 0) return undefined;

  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 90);

  let weightedSum = 0;
  let totalDays = 0;

  for (const row of rows) {
    const rate = row[col] as number | null;
    if (rate == null) continue;

    const monthStart = new Date(row.month);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    const windowStart = new Date(Math.max(monthStart.getTime(), cutoff.getTime()));
    const windowEnd   = new Date(Math.min(monthEnd.getTime(), now.getTime()));

    const days = (windowEnd.getTime() - windowStart.getTime()) / (86_400_000);
    if (days <= 0) continue;

    weightedSum += rate * days;
    totalDays   += days;
  }

  if (totalDays === 0) return undefined;
  return weightedSum / totalDays;
}
