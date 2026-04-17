import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import type { BorrowPosition } from "../types";

const DATA_PROVIDER = "0x0a16f2FCC0D44FaE41cc54e079281D84A363bECD" as const;
const ORACLE        = "0x54586bE62E3c3580375aE3723C145253060Ca0C2" as const;

// getAllReservesTokens returns a tuple array — JSON ABI required
const DATA_PROVIDER_ABI = [
  {
    name: "getAllReservesTokens",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{
      name: "",
      type: "tuple[]",
      components: [
        { name: "symbol", type: "string" },
        { name: "tokenAddress", type: "address" },
      ],
    }],
  },
  ...parseAbi([
    "function getUserReserveData(address asset, address user) external view returns (uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)",
    "function getReserveData(address asset) external view returns (uint256 unbacked, uint256 accruedToTreasuryScaled, uint256 totalAToken, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)",
  ]),
] as const;

const ORACLE_ABI = parseAbi([
  "function getAssetPrice(address asset) external view returns (uint256)",
  "function BASE_CURRENCY_UNIT() external view returns (uint256)",
]);

const ERC20_DECIMALS_ABI = parseAbi([
  "function decimals() external view returns (uint8)",
]);

// AaveProtocolDataProvider returns rates already annualised in RAY (1e27 = 100%)
// Just divide by 1e27 — do NOT multiply by SECONDS_PER_YEAR
function rayToApr(ray: bigint): number {
  return Number(ray) / 1e27;
}

// Minimum debt to bother showing (dust filter)
const MIN_DEBT_USD = 0.01;

export async function fetchAavePositions(address: string): Promise<BorrowPosition[]> {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL),
  });

  // 1. All reserve tokens
  const allReserves = await client.readContract({
    address: DATA_PROVIDER,
    abi: DATA_PROVIDER_ABI,
    functionName: "getAllReservesTokens",
  }) as { symbol: string; tokenAddress: `0x${string}` }[];

  // 2. User data for every reserve (parallel)
  const userDataResults = await Promise.all(
    allReserves.map((r) =>
      client.readContract({
        address: DATA_PROVIDER,
        abi: DATA_PROVIDER_ABI,
        functionName: "getUserReserveData",
        args: [r.tokenAddress, address as `0x${string}`],
      }).catch(() => null)
    )
  );

  // 3. Keep only reserves with non-zero debt
  const active = allReserves
    .map((r, i) => ({ reserve: r, ud: userDataResults[i] }))
    .filter(({ ud }) => {
      if (!ud) return false;
      const [, stableDebt, variableDebt] = ud as unknown as bigint[];
      return stableDebt > 0n || variableDebt > 0n;
    });

  if (active.length === 0) return [];

  // Detect ALL collateral types that map to a Liquity v2 branch
  // (user may have WETH + wstETH + rETH — each becomes a separate trove)
  const COLLATERAL_MAP: Record<string, string> = {
    WETH: "WETH", ETH: "WETH",
    wstETH: "wstETH", WSTETH: "wstETH",
    rETH: "rETH", RETH: "rETH",
    stETH: "wstETH",
  };

  const liquityCollaterals: string[] = [];
  for (let i = 0; i < allReserves.length; i++) {
    const ud = userDataResults[i];
    if (!ud) continue;
    const [aTokenBalance, , , , , , , , usageAsCollateral] = ud as unknown as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, boolean];
    if (!usageAsCollateral || aTokenBalance === 0n) continue;
    const sym = allReserves[i].symbol;
    const mapped = COLLATERAL_MAP[sym] ?? COLLATERAL_MAP[sym.toUpperCase()];
    if (mapped && !liquityCollaterals.includes(mapped)) {
      liquityCollaterals.push(mapped);
    }
  }
  // Fallback: if no recognized collateral found, default to WETH
  if (liquityCollaterals.length === 0) liquityCollaterals.push("WETH");

  // 4. Fetch reserve data (for variable rate), oracle prices, and decimals — all parallel
  const [reserveDataArr, baseCurrencyUnit, decimalsArr, ...oraclePrices] =
    await Promise.all([
      Promise.all(
        active.map(({ reserve }) =>
          client.readContract({
            address: DATA_PROVIDER,
            abi: DATA_PROVIDER_ABI,
            functionName: "getReserveData",
            args: [reserve.tokenAddress],
          }).catch(() => null)
        )
      ),
      client.readContract({ address: ORACLE, abi: ORACLE_ABI, functionName: "BASE_CURRENCY_UNIT" })
        .catch(() => BigInt(1e8)),
      Promise.all(
        active.map(({ reserve }) =>
          client.readContract({
            address: reserve.tokenAddress,
            abi: ERC20_DECIMALS_ABI,
            functionName: "decimals",
          }).catch(() => 18)
        )
      ),
      ...active.map(({ reserve }) =>
        client.readContract({
          address: ORACLE,
          abi: ORACLE_ABI,
          functionName: "getAssetPrice",
          args: [reserve.tokenAddress],
        }).catch(() => 0n)
      ),
    ]);

  const baseCurrencyUnitNum = Number(baseCurrencyUnit as bigint);

  const positions: BorrowPosition[] = [];

  active.forEach(({ reserve, ud }, i) => {
    const [, currentStableDebt, currentVariableDebt, , , stableBorrowRate] = ud as unknown as bigint[];
    const reserveData = reserveDataArr[i] as unknown as bigint[] | null;
    const variableBorrowRate = reserveData ? reserveData[6] : 0n;
    const decimals = Number((decimalsArr as (number | bigint)[])[i]);

    const totalDebt = currentVariableDebt + currentStableDebt;
    const debtAmount = Number(totalDebt) / 10 ** decimals;

    const priceUsd = Number(oraclePrices[i] as bigint) / baseCurrencyUnitNum;
    const debtUsd = debtAmount * priceUsd;

    // Skip dust positions
    if (debtUsd < MIN_DEBT_USD) return;

    // Weighted average rate (already annualised in RAY)
    let rateRay: bigint;
    if (currentVariableDebt === 0n) {
      rateRay = stableBorrowRate;
    } else if (currentStableDebt === 0n) {
      rateRay = variableBorrowRate;
    } else {
      const vw = Number(currentVariableDebt);
      const sw = Number(currentStableDebt);
      rateRay = BigInt(
        Math.round((Number(variableBorrowRate) * vw + Number(stableBorrowRate) * sw) / (vw + sw))
      );
    }

    // Emit one row per Liquity v2 collateral branch the user has deposited.
    // 2nd+ rows are alternatives (same debt, different branch) — excluded from totals.
    for (let ci = 0; ci < liquityCollaterals.length; ci++) {
      positions.push({
        protocol: "Aave v3",
        collateral: liquityCollaterals[ci],
        collateralUsd: 0,
        debtToken: reserve.symbol,
        debtTokenAddress: reserve.tokenAddress,
        debtAmount,
        debtUsd,
        currentRateApr: rayToApr(rateRay),
        isAlternativeCollateral: ci > 0,
      });
    }
  });

  return positions;
}
