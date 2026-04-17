import { getTokenPrices } from "../prices";
import type { BorrowPosition } from "../types";

// Compound v3 API
const COMPOUND_API = "https://api.compound.finance/api/v2/account";

// Known Compound v3 comet addresses and their base assets
const COMETS: { address: string; baseAsset: string; baseAddress: string }[] = [
  { address: "0xc3d688B66703497DAA19211EEdff47f25384cdc3", baseAsset: "USDC", baseAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" },
  { address: "0xA17581A9E3356d9A858b789D68B4d866e593aE94", baseAsset: "WETH", baseAddress: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" },
  { address: "0x3Afdc9BCA9213A35503b077a6072F3D0d5AB0840", baseAsset: "USDT", baseAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7" },
];

// Compound v3 on-chain approach via Comet ABI
import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";

const COMET_ABI = parseAbi([
  "function borrowBalanceOf(address account) external view returns (uint256)",
  "function getBorrowRate(uint256 utilization) external view returns (uint64)",
  "function getUtilization() external view returns (uint256)",
  "function baseTokenPriceFeed() external view returns (address)",
  "function baseScale() external view returns (uint256)",
  "function numAssets() external view returns (uint8)",
  "function getAssetInfo(uint8 i) external view returns (uint8 offset, address asset, address priceFeed, uint64 scale, uint64 borrowCollateralFactor, uint64 liquidateCollateralFactor, uint64 liquidationFactor, uint128 supplyCap)",
  "function collateralBalanceOf(address account, address asset) external view returns (uint128)",
]);

const SECONDS_PER_YEAR = 365 * 24 * 3600;

export async function fetchCompoundPositions(address: string): Promise<BorrowPosition[]> {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL),
  });

  const TOKEN_SYMBOLS: Record<string, string> = {
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "WETH",
    "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0": "wstETH",
    "0xae78736cd615f374d3085123a210448e74fc6393": "rETH",
    "0xbe9895146f7af43049ca1c1ae358b0541ea49704": "cbETH",
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
    "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": "WBTC",
    "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
  };

  const positions: BorrowPosition[] = [];

  await Promise.all(
    COMETS.map(async ({ address: cometAddr, baseAsset, baseAddress }) => {
      try {
        const cometAddress = cometAddr as `0x${string}`;

        const [borrowBalance, utilization, baseScale] = await Promise.all([
          client.readContract({
            address: cometAddress,
            abi: COMET_ABI,
            functionName: "borrowBalanceOf",
            args: [address as `0x${string}`],
          }),
          client.readContract({
            address: cometAddress,
            abi: COMET_ABI,
            functionName: "getUtilization",
          }),
          client.readContract({
            address: cometAddress,
            abi: COMET_ABI,
            functionName: "baseScale",
          }),
        ]);

        if ((borrowBalance as bigint) === 0n) return;

        const borrowRate = (await client.readContract({
          address: cometAddress,
          abi: COMET_ABI,
          functionName: "getBorrowRate",
          args: [utilization as bigint],
        })) as bigint;

        const decimals = Math.log10(Number(baseScale as bigint));
        const debtAmount = Number(borrowBalance as bigint) / 10 ** decimals;
        const prices = await getTokenPrices([baseAsset]);
        const debtUsd = debtAmount * (prices[baseAsset] ?? 0);

        // borrowRate is per second in 1e18
        const currentRateApr = (Number(borrowRate) / 1e18) * SECONDS_PER_YEAR;

        // Find primary collateral (largest balance)
        let topCollateral = "WETH";
        try {
          const numAssets = (await client.readContract({
            address: cometAddress,
            abi: COMET_ABI,
            functionName: "numAssets",
          })) as number;

          let maxBal = 0n;
          for (let i = 0; i < numAssets; i++) {
            const info = (await client.readContract({
              address: cometAddress,
              abi: COMET_ABI,
              functionName: "getAssetInfo",
              args: [i],
            })) as [number, string, string, bigint, bigint, bigint, bigint, bigint];

            const assetAddr = info[1];
            const bal = (await client.readContract({
              address: cometAddress,
              abi: COMET_ABI,
              functionName: "collateralBalanceOf",
              args: [address as `0x${string}`, assetAddr as `0x${string}`],
            })) as bigint;

            if (bal > maxBal) {
              maxBal = bal;
              topCollateral = TOKEN_SYMBOLS[assetAddr.toLowerCase()] ?? assetAddr.slice(0, 8);
            }
          }
        } catch {
          // non-critical
        }

        positions.push({
          protocol: "Compound v3",
          collateral: topCollateral,
          collateralUsd: 0,
          debtToken: baseAsset,
          debtTokenAddress: baseAddress,
          debtAmount,
          debtUsd,
          currentRateApr,
        });
      } catch {
        // skip this comet if it errors
      }
    })
  );

  return positions;
}
