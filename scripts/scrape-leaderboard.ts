#!/usr/bin/env tsx
/**
 * Scrapes top Spark + Maker borrowers from defiexplore.com, calculates Liquity v2
 * savings for each, and writes public/leaderboard-data.json.
 *
 * Usage:  npx tsx scripts/scrape-leaderboard.ts
 */

import * as fs from "fs";
import * as path from "path";
import { chromium } from "playwright";
import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import { fetchSparkPositions } from "../lib/protocols/spark";
import { getLiquityV2Branches, mapToLiquityV2Branch } from "../lib/protocols/liquityV2";
import type { LeaderboardData, LeaderboardEntry } from "../lib/leaderboard";

// Load .env.local for local dev
try {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
} catch {}

// ── Constants ────────────────────────────────────────────────────────────────

const STABLECOINS = new Set([
  "USDC", "USDT", "DAI", "GHO", "USDS", "LUSD", "BOLD", "FRAX", "PYUSD", "CRVUSD",
]);

// Maker contract addresses
const CDP_MANAGER = "0x5ef30b9986345249bc32d8928b7ee64de9435e39" as const;
const VAT         = "0x35d1b3f3d7966a1dfe207aa4514c12a259a0492b" as const;
const JUG         = "0x19c0976f590d67707e62397c87829d896dc0f1f1" as const;

const CDP_MANAGER_ABI = parseAbi([
  "function ilks(uint256) external view returns (bytes32)",
  "function urns(uint256) external view returns (address)",
]);
const VAT_ABI = parseAbi([
  "function urns(bytes32,address) external view returns (uint256 ink, uint256 art)",
  "function ilks(bytes32) external view returns (uint256 Art, uint256 rate, uint256 spot, uint256 line, uint256 dust)",
]);
const JUG_ABI = parseAbi([
  "function ilks(bytes32) external view returns (uint256 duty, uint256 rho)",
]);

const RAY = 10n ** 27n;
const SECONDS_PER_YEAR = 365 * 24 * 3600;

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseMoney(s: string): number {
  const clean = s.replace(/[$,\s]/g, "");
  const m = clean.match(/^([0-9.]+)([KMBkmb]?)$/);
  if (!m) return 0;
  const mults: Record<string, number> = { k: 1e3, K: 1e3, m: 1e6, M: 1e6, b: 1e9, B: 1e9 };
  return parseFloat(m[1]) * (mults[m[2]] ?? 1);
}

function bytes32ToIlkName(b: `0x${string}`): string {
  const hex = b.slice(2);
  let str = "";
  for (let i = 0; i < hex.length; i += 2) {
    const code = parseInt(hex.slice(i, i + 2), 16);
    if (code === 0) break;
    str += String.fromCharCode(code);
  }
  return str;
}

function ilkToCollateral(ilk: string): string {
  const token = ilk.split("-")[0].toUpperCase();
  if (token === "ETH") return "WETH";
  if (token === "WSTETH") return "wstETH";
  if (token === "RETH") return "rETH";
  return token;
}

function dutyToApr(duty: bigint): number {
  const ratePerSecond = Number(duty - RAY) / 1e27;
  return Math.pow(1 + ratePerSecond, SECONDS_PER_YEAR) - 1;
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, i: number) => Promise<R | null>
): Promise<(R | null)[]> {
  const results: (R | null)[] = new Array(items.length).fill(null);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      try { results[i] = await fn(items[i], i); }
      catch (e) { console.error(`  Error item ${i}:`, e instanceof Error ? e.message : e); }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// ── Spark scraping ───────────────────────────────────────────────────────────

async function scrapeSparkAddresses(limit = 50): Promise<{ address: string; debtUsd: number }[]> {
  const browser = await chromium.launch({ headless: true });
  const results: { address: string; debtUsd: number }[] = [];
  try {
    const page = await browser.newPage();
    let pageNum = 1;
    while (results.length < limit) {
      const url = `https://defiexplore.com/spark/positions/core${pageNum > 1 ? `?page=${pageNum}` : ""}`;
      console.log(`  Spark page ${pageNum}`);
      await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
      await page.waitForTimeout(3000);

      const rows = page.locator("tbody tr");
      const rowCount = await rows.count();
      if (rowCount === 0) break;

      for (let i = 0; i < rowCount && results.length < limit; i++) {
        const borrowText = (await rows.nth(i).locator("td").nth(3).textContent()) ?? "";
        const debtUsd = parseMoney(borrowText.trim());
        if (debtUsd <= 0) continue;

        await rows.nth(i).locator("[data-tooltipped]").first().hover();
        await page.waitForTimeout(300);
        const fullAddress = await page.evaluate(() => {
          const el = document.querySelector("[role='tooltip'], [class*='tooltip'], [class*='Tooltip']");
          const t = el?.textContent?.trim() ?? "";
          return /^0x[0-9a-fA-F]{40}$/.test(t) ? t : "";
        });
        if (fullAddress) results.push({ address: fullAddress.toLowerCase(), debtUsd });
      }

      const hasNext = (await page.locator(`a[href*="page=${pageNum + 1}"]`).count()) > 0;
      if (!hasNext) break;
      pageNum++;
    }
  } finally {
    await browser.close();
  }
  console.log(`  Found ${results.length} Spark addresses`);
  return results;
}

// ── Maker scraping ───────────────────────────────────────────────────────────

async function scrapeMakerCdpIds(limit = 20): Promise<{ cdpId: number; debtUsd: number }[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    console.log("  Maker page 1");
    await page.goto("https://defiexplore.com/maker", { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(3000);

    const results = await page.evaluate((limit: number) => {
      const rows = Array.from(document.querySelectorAll("tbody tr")).slice(0, limit);
      return rows.map((row) => {
        const cells = row.querySelectorAll("td");
        const cdpId = parseInt(cells[0]?.textContent?.trim() ?? "0", 10);
        // cell[1] looks like "151.1M DAI" — extract the number part
        const debtText = (cells[1]?.textContent?.trim() ?? "").replace(/[A-Za-z\s]/g, "");
        const m = debtText.match(/^([0-9.]+)([KMBkmb]?)$/);
        let debtUsd = 0;
        if (m) {
          const mults: Record<string, number> = { k: 1e3, K: 1e3, m: 1e6, M: 1e6, b: 1e9, B: 1e9 };
          debtUsd = parseFloat(m[1]) * (mults[m[2]] ?? 1);
        }
        return { cdpId, debtUsd };
      }).filter(r => r.cdpId > 0 && r.debtUsd > 0);
    }, limit);

    console.log(`  Found ${results.length} Maker CDPs`);
    return results;
  } finally {
    await browser.close();
  }
}

// ── Maker on-chain fetch by CDP ID ───────────────────────────────────────────

async function fetchMakerPositionByCdpId(
  cdpId: number,
  branches: Awaited<ReturnType<typeof getLiquityV2Branches>>
): Promise<LeaderboardEntry | null> {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL),
  });

  const [ilkBytes, urn] = await Promise.all([
    client.readContract({ address: CDP_MANAGER, abi: CDP_MANAGER_ABI, functionName: "ilks", args: [BigInt(cdpId)] }),
    client.readContract({ address: CDP_MANAGER, abi: CDP_MANAGER_ABI, functionName: "urns", args: [BigInt(cdpId)] }),
  ]) as [`0x${string}`, `0x${string}`];

  const [[, rate], [, art], [duty]] = await Promise.all([
    client.readContract({ address: VAT, abi: VAT_ABI, functionName: "ilks", args: [ilkBytes] }),
    client.readContract({ address: VAT, abi: VAT_ABI, functionName: "urns", args: [ilkBytes, urn] }),
    client.readContract({ address: JUG, abi: JUG_ABI, functionName: "ilks", args: [ilkBytes] }),
  ]) as [[bigint, bigint, bigint, bigint, bigint], [bigint, bigint], [bigint, bigint]];

  if (art === 0n) return null;

  const debtUsd = Number((art * rate) / RAY) / 1e18; // DAI ≈ $1
  const ilkName = bytes32ToIlkName(ilkBytes);
  const collateral = ilkToCollateral(ilkName);
  const currentRateApr = dutyToApr(duty);

  const branch = mapToLiquityV2Branch(collateral, branches);
  if (!branch) return null;

  return {
    address: `CDP #${cdpId}`,
    cdpId,
    protocol: "Maker MCD",
    collateral,
    debtToken: "DAI",
    debtUsd,
    currentRateApr,
    liquityCollateral: branch.collateral,
    liquityRateAvg: branch.avgRate,
    liquityRateP10: branch.p10Rate,
    liquityRate90dAvg: branch.avg90dRate,
    annualSavings: Math.max(0, debtUsd * (currentRateApr - branch.avgRate)),
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.NEXT_PUBLIC_RPC_URL) {
    console.error("NEXT_PUBLIC_RPC_URL is not set");
    process.exit(1);
  }

  console.log("1/5 Fetching Liquity v2 branch rates...");
  const branches = await getLiquityV2Branches();
  console.log(`     ${branches.map((b) => `${b.collateral} avg=${(b.avgRate * 100).toFixed(2)}%`).join("  ")}`);

  // ── Spark ──────────────────────────────────────────────────────────────────
  console.log("2/5 Scraping Spark positions...");
  const sparkScraped = await scrapeSparkAddresses(50);

  console.log(`3/5 Scanning ${sparkScraped.length} Spark addresses (10 concurrent)...`);
  const sparkResults = await runWithConcurrency(sparkScraped, 10, async ({ address }, i) => {
    process.stdout.write(`  [${i + 1}/${sparkScraped.length}] ${address.slice(0, 10)}...\r`);
    const positions = await fetchSparkPositions(address);
    return { address, positions };
  });
  process.stdout.write("\n");

  const sparkEntries: LeaderboardEntry[] = [];
  for (const result of sparkResults) {
    if (!result) continue;
    for (const pos of result.positions) {
      if (!STABLECOINS.has(pos.debtToken) || pos.isAlternativeCollateral) continue;
      const branch = mapToLiquityV2Branch(pos.collateral, branches);
      if (!branch) continue;
      sparkEntries.push({
        address: result.address,
        protocol: "Spark",
        collateral: pos.collateral,
        debtToken: pos.debtToken,
        debtUsd: pos.debtUsd,
        currentRateApr: pos.currentRateApr,
        liquityCollateral: branch.collateral,
        liquityRateAvg: branch.avgRate,
        liquityRateP10: branch.p10Rate,
        liquityRate90dAvg: branch.avg90dRate,
        annualSavings: Math.max(0, pos.debtUsd * (pos.currentRateApr - branch.avgRate)),
      });
    }
  }
  sparkEntries.sort((a, b) => b.debtUsd - a.debtUsd);

  // ── Maker ──────────────────────────────────────────────────────────────────
  console.log("4/5 Scraping Maker CDPs...");
  const makerScraped = await scrapeMakerCdpIds(20);

  console.log(`5/5 Fetching ${makerScraped.length} Maker positions on-chain (5 concurrent)...`);
  const makerResults = await runWithConcurrency(makerScraped, 5, async ({ cdpId }, i) => {
    process.stdout.write(`  [${i + 1}/${makerScraped.length}] CDP #${cdpId}\r`);
    return fetchMakerPositionByCdpId(cdpId, branches);
  });
  process.stdout.write("\n");

  const makerEntries = makerResults.filter((e): e is LeaderboardEntry => e !== null);
  makerEntries.sort((a, b) => b.debtUsd - a.debtUsd);

  // ── Write ──────────────────────────────────────────────────────────────────
  const data: LeaderboardData = {
    entries: [...sparkEntries, ...makerEntries],
    scrapedAt: new Date().toISOString(),
  };

  const outPath = path.join(process.cwd(), "public", "leaderboard-data.json");
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));

  const sparkSavings = sparkEntries.reduce((s, e) => s + e.annualSavings, 0);
  const makerSavings = makerEntries.reduce((s, e) => s + e.annualSavings, 0);
  console.log(`\nDone — Spark: ${sparkEntries.length} entries ($${(sparkSavings / 1e6).toFixed(2)}M savings)`);
  console.log(`       Maker: ${makerEntries.length} entries ($${(makerSavings / 1e6).toFixed(2)}M savings)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
