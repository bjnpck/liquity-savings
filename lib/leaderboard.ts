import * as fs from "fs";
import * as path from "path";

export interface LeaderboardEntry {
  address: string;       // EOA for wallet protocols, "CDP #N" for Maker
  cdpId?: number;        // Maker only
  protocol: "Aave v3" | "Spark" | "Maker MCD" | "Compound v3" | "Curve crvUSD";
  collateral: string;
  debtToken: string;
  debtUsd: number;
  currentRateApr: number;
  liquityCollateral: string;
  liquityRateAvg: number;
  liquityRateP10: number;
  liquityRate90dAvg?: number;
  annualSavings: number;
}

export interface LeaderboardData {
  entries: LeaderboardEntry[];
  scrapedAt: string;
}

export function readLeaderboardData(): LeaderboardData | null {
  try {
    const raw = fs.readFileSync(
      path.join(process.cwd(), "public", "leaderboard-data.json"),
      "utf8"
    );
    return JSON.parse(raw) as LeaderboardData;
  } catch {
    return null;
  }
}
