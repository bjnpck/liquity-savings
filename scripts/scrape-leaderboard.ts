#!/usr/bin/env tsx
/**
 * Fetches top DeFi borrowers, calculates Liquity v2 savings for each, and writes
 * public/leaderboard-data.json.
 *
 * Usage:  npx tsx scripts/scrape-leaderboard.ts
 */

import * as fs from "fs";
import * as path from "path";
import { chromium } from "playwright";
import { createPublicClient, http, parseAbi, parseAbiItem } from "viem";
import { mainnet } from "viem/chains";
import { fetchAavePositions } from "../lib/protocols/aave";
import { fetchCompoundPositions } from "../lib/protocols/compound";
import { fetchCurvePositions } from "../lib/protocols/curve";
import { fetchSparkPositions } from "../lib/protocols/spark";
import { getLiquityV2Branches, mapToLiquityV2Branch } from "../lib/protocols/liquityV2";
import type { BorrowPosition } from "../lib/types";
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
const COMPOUND_LOG_CHUNK = 50_000n;
const COMPOUND_COMETS = [
  { address: "0xc3d688B66703497DAA19211EEdff47f25384cdc3", startBlock: 15_331_586n },
  { address: "0x3Afdc9BCA9213A35503b077a6072F3D0d5AB0840", startBlock: 20_101_800n },
] as const;
const COMET_ABI = parseAbi([
  "function borrowBalanceOf(address account) external view returns (uint256)",
]);
const COMET_WITHDRAW_EVENT = parseAbiItem(
  "event Withdraw(address indexed src, address indexed to, uint256 amount)"
);
const CURVE_CONTROLLER_FACTORY = "0xC9332fdCB1C491Dcc683bAe86Fe3cb70360738BC" as const;
const CURVE_FACTORY_ABI = parseAbi([
  "function n_collaterals() external view returns (uint256)",
  "function controllers(uint256) external view returns (address)",
]);
const CURVE_CONTROLLER_ABI = parseAbi([
  "function n_loans() external view returns (uint256)",
  "function loans(uint256) external view returns (address)",
  "function debt(address user) external view returns (uint256)",
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastError;
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

function positionsToEntries(
  address: string,
  positions: BorrowPosition[],
  branches: Awaited<ReturnType<typeof getLiquityV2Branches>>
): LeaderboardEntry[] {
  return positions.flatMap((pos) => {
    if (!STABLECOINS.has(pos.debtToken.toUpperCase()) || pos.isAlternativeCollateral) return [];
    const branch = mapToLiquityV2Branch(pos.collateral, branches);
    if (!branch) return [];
    return [{
      address,
      protocol: pos.protocol as LeaderboardEntry["protocol"],
      collateral: pos.collateral,
      debtToken: pos.debtToken,
      debtUsd: pos.debtUsd,
      currentRateApr: pos.currentRateApr,
      liquityCollateral: branch.collateral,
      liquityRateAvg: branch.avgRate,
      liquityRateP10: branch.p10Rate,
      liquityRate90dAvg: branch.avg90dRate,
      annualSavings: Math.max(0, pos.debtUsd * (pos.currentRateApr - branch.avgRate)),
    }];
  });
}

async function scanWallets(
  label: string,
  addresses: string[],
  fetchPositions: (address: string) => Promise<BorrowPosition[]>,
  branches: Awaited<ReturnType<typeof getLiquityV2Branches>>
): Promise<LeaderboardEntry[]> {
  console.log(`  Scanning ${addresses.length} ${label} wallets (3 concurrent)...`);
  const results = await runWithConcurrency(addresses, 3, async (address, i) => {
    process.stdout.write(`  [${i + 1}/${addresses.length}] ${address.slice(0, 10)}...\r`);
    return { address, positions: await withRetry(() => fetchPositions(address)) };
  });
  process.stdout.write("\n");

  return results
    .flatMap((result) => result ? positionsToEntries(result.address, result.positions, branches) : [])
    .sort((a, b) => b.debtUsd - a.debtUsd);
}

// ── DeFi Explore scraping ────────────────────────────────────────────────────

async function scrapeDefiExploreAddresses(
  label: string,
  baseUrl: string,
  limit: number
): Promise<string[]> {
  const browser = await chromium.launch({ headless: true });
  const results: string[] = [];
  try {
    const page = await browser.newPage();
    let pageNum = 1;
    while (results.length < limit) {
      const url = `${baseUrl}${pageNum > 1 ? `?page=${pageNum}` : ""}`;
      console.log(`  ${label} page ${pageNum}`);
      await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
      await page.waitForTimeout(3000);

      const rows = page.locator("tbody tr");
      const rowCount = await rows.count();
      if (rowCount === 0) break;

      for (let i = 0; i < rowCount && results.length < limit; i++) {
        await rows.nth(i).locator("[data-tooltipped]").first().hover();
        await page.waitForTimeout(300);
        const fullAddress = await page.evaluate(() => {
          const el = document.querySelector("[role='tooltip'], [class*='tooltip'], [class*='Tooltip']");
          const t = el?.textContent?.trim() ?? "";
          return /^0x[0-9a-fA-F]{40}$/.test(t) ? t : "";
        });
        if (fullAddress && !results.includes(fullAddress.toLowerCase())) {
          results.push(fullAddress.toLowerCase());
        }
      }

      const hasNext = (await page.locator(`a[href*="page=${pageNum + 1}"]`).count()) > 0;
      if (!hasNext) break;
      pageNum++;
    }
  } finally {
    await browser.close();
  }
  console.log(`  Found ${results.length} ${label} addresses`);
  return results;
}

// ── Compound borrower enumeration ────────────────────────────────────────────

async function getCompoundBorrowerAddresses(limit = 50): Promise<string[]> {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL),
  });
  const latestBlock = await client.getBlockNumber();
  const debtByAddress = new Map<string, bigint>();

  for (const comet of COMPOUND_COMETS) {
    const candidates = new Set<`0x${string}`>();
    console.log(`  Compound logs ${comet.address.slice(0, 10)}...`);
    const chunks: { fromBlock: bigint; toBlock: bigint }[] = [];
    for (let fromBlock = comet.startBlock; fromBlock <= latestBlock; fromBlock += COMPOUND_LOG_CHUNK) {
      chunks.push({
        fromBlock,
        toBlock: fromBlock + COMPOUND_LOG_CHUNK - 1n < latestBlock
          ? fromBlock + COMPOUND_LOG_CHUNK - 1n
          : latestBlock,
      });
    }
    const logChunks = await runWithConcurrency(chunks, 5, ({ fromBlock, toBlock }) =>
      withRetry(() => client.getLogs({
          address: comet.address,
          event: COMET_WITHDRAW_EVENT,
          fromBlock,
          toBlock,
        }))
    );
    for (const logs of logChunks) {
      if (!logs) continue;
      for (const log of logs) {
        if (log.args.src) candidates.add(log.args.src);
      }
    }

    const addresses = [...candidates];
    for (let i = 0; i < addresses.length; i += 500) {
      const batch = addresses.slice(i, i + 500);
      const balances = await withRetry(() => client.multicall({
        contracts: batch.map((address) => ({
          address: comet.address,
          abi: COMET_ABI,
          functionName: "borrowBalanceOf",
          args: [address],
        })),
        allowFailure: true,
      }));
      balances.forEach((result, j) => {
        if (result.status === "success" && result.result > 0n) {
          const address = batch[j].toLowerCase();
          debtByAddress.set(address, (debtByAddress.get(address) ?? 0n) + result.result);
        }
      });
    }
  }

  const addresses = [...debtByAddress.entries()]
    .sort((a, b) => a[1] === b[1] ? 0 : a[1] > b[1] ? -1 : 1)
    .slice(0, limit)
    .map(([address]) => address);
  console.log(`  Found ${addresses.length} Compound borrowers`);
  return addresses;
}

// ── Curve borrower enumeration ───────────────────────────────────────────────

async function getCurveBorrowerAddresses(limit = 50): Promise<string[]> {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL),
  });
  await sleep(3000);
  const controllerCount = Number(await withRetry(() => client.readContract({
    address: CURVE_CONTROLLER_FACTORY,
    abi: CURVE_FACTORY_ABI,
    functionName: "n_collaterals",
  })));
  const controllers = await withRetry(() => client.multicall({
    contracts: Array.from({ length: controllerCount }, (_, i) => ({
      address: CURVE_CONTROLLER_FACTORY,
      abi: CURVE_FACTORY_ABI,
      functionName: "controllers",
      args: [BigInt(i)],
    })),
    allowFailure: false,
  })) as unknown as `0x${string}`[];
  const debtByAddress = new Map<string, bigint>();

  for (const controller of controllers) {
    const loanCount = Number(await withRetry(() => client.readContract({
      address: controller,
      abi: CURVE_CONTROLLER_ABI,
      functionName: "n_loans",
    })));
    for (let offset = 0; offset < loanCount; offset += 100) {
      const size = Math.min(100, loanCount - offset);
      const addresses = await withRetry(() => client.multicall({
        contracts: Array.from({ length: size }, (_, i) => ({
          address: controller,
          abi: CURVE_CONTROLLER_ABI,
          functionName: "loans",
          args: [BigInt(offset + i)],
        })),
        allowFailure: false,
      })) as unknown as `0x${string}`[];
      const debts = await withRetry(() => client.multicall({
        contracts: addresses.map((address) => ({
          address: controller,
          abi: CURVE_CONTROLLER_ABI,
          functionName: "debt",
          args: [address],
        })),
        allowFailure: false,
      })) as unknown as bigint[];
      addresses.forEach((address, i) => {
        if (debts[i] > 0n) {
          const key = address.toLowerCase();
          debtByAddress.set(key, (debtByAddress.get(key) ?? 0n) + debts[i]);
        }
      });
      if (offset + size < loanCount) {
        await sleep(250);
      }
    }
  }

  const addresses = [...debtByAddress.entries()]
    .sort((a, b) => a[1] === b[1] ? 0 : a[1] > b[1] ? -1 : 1)
    .slice(0, limit)
    .map(([address]) => address);
  console.log(`  Found ${addresses.length} Curve borrowers`);
  return addresses;
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

  console.log("1/9 Fetching Liquity v2 branch rates...");
  const branches = await getLiquityV2Branches();
  console.log(`     ${branches.map((b) => `${b.collateral} avg=${(b.avgRate * 100).toFixed(2)}%`).join("  ")}`);

  // ── Spark ──────────────────────────────────────────────────────────────────
  console.log("2/9 Scraping Spark positions...");
  const sparkAddresses = await scrapeDefiExploreAddresses("Spark", "https://defiexplore.com/spark/positions/core", 50);
  const sparkEntries = await scanWallets("Spark", sparkAddresses, fetchSparkPositions, branches);

  console.log("3/9 Scraping Aave positions...");
  const aaveAddresses = await scrapeDefiExploreAddresses("Aave", "https://aave.defiexplore.com/positions/core", 50);
  const aaveEntries = await scanWallets("Aave", aaveAddresses, fetchAavePositions, branches);

  console.log("4/9 Enumerating Compound borrowers...");
  const compoundAddresses = await getCompoundBorrowerAddresses(50);
  const compoundEntries = await scanWallets("Compound", compoundAddresses, fetchCompoundPositions, branches);

  console.log("5/9 Enumerating Curve borrowers...");
  const curveAddresses = await getCurveBorrowerAddresses(50);
  const curveEntries = await scanWallets("Curve", curveAddresses, fetchCurvePositions, branches);

  // ── Maker ──────────────────────────────────────────────────────────────────
  console.log("6/9 Scraping Maker CDPs...");
  const makerScraped = await scrapeMakerCdpIds(20);

  console.log(`7/9 Fetching ${makerScraped.length} Maker positions on-chain (5 concurrent)...`);
  const makerResults = await runWithConcurrency(makerScraped, 5, async ({ cdpId }, i) => {
    process.stdout.write(`  [${i + 1}/${makerScraped.length}] CDP #${cdpId}\r`);
    return fetchMakerPositionByCdpId(cdpId, branches);
  });
  process.stdout.write("\n");

  const makerEntries = makerResults.filter((e): e is LeaderboardEntry => e !== null);
  makerEntries.sort((a, b) => b.debtUsd - a.debtUsd);

  // ── Write ──────────────────────────────────────────────────────────────────
  const data: LeaderboardData = {
    entries: [...sparkEntries, ...aaveEntries, ...compoundEntries, ...curveEntries, ...makerEntries],
    scrapedAt: new Date().toISOString(),
  };

  const outPath = path.join(process.cwd(), "public", "leaderboard-data.json");
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));

  const sparkSavings = sparkEntries.reduce((s, e) => s + e.annualSavings, 0);
  const aaveSavings = aaveEntries.reduce((s, e) => s + e.annualSavings, 0);
  const compoundSavings = compoundEntries.reduce((s, e) => s + e.annualSavings, 0);
  const curveSavings = curveEntries.reduce((s, e) => s + e.annualSavings, 0);
  const makerSavings = makerEntries.reduce((s, e) => s + e.annualSavings, 0);
  console.log(`\nDone — Spark: ${sparkEntries.length} entries ($${(sparkSavings / 1e6).toFixed(2)}M savings)`);
  console.log(`       Aave: ${aaveEntries.length} entries ($${(aaveSavings / 1e6).toFixed(2)}M savings)`);
  console.log(`       Compound: ${compoundEntries.length} entries ($${(compoundSavings / 1e6).toFixed(2)}M savings)`);
  console.log(`       Curve: ${curveEntries.length} entries ($${(curveSavings / 1e6).toFixed(2)}M savings)`);
  console.log(`       Maker: ${makerEntries.length} entries ($${(makerSavings / 1e6).toFixed(2)}M savings)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
