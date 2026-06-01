import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import type { BorrowPosition } from "../types";

// Curve crvUSD ControllerFactory on Ethereum mainnet.
// Source: https://github.com/curvefi/curve-stablecoin
const CONTROLLER_FACTORY = "0xC9332fdCB1C491Dcc683bAe86Fe3cb70360738BC" as const;
const CRVUSD = "0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E" as const;

const FACTORY_ABI = parseAbi([
  "function n_collaterals() external view returns (uint256)",
  "function controllers(uint256) external view returns (address)",
]);

const CONTROLLER_ABI = parseAbi([
  "function loan_exists(address user) external view returns (bool)",
  "function debt(address user) external view returns (uint256)",
  "function collateral_token() external view returns (address)",
  "function monetary_policy() external view returns (address)",
]);

const ERC20_ABI = parseAbi([
  "function symbol() external view returns (string)",
]);

const MONETARY_POLICY_WITH_CONTROLLER_ABI = parseAbi([
  "function rate(address controller) external view returns (uint256)",
]);

const MONETARY_POLICY_ABI = parseAbi([
  "function rate() external view returns (uint256)",
]);

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
const MIN_DEBT_USD = 0.01;
let controllerCache: Promise<`0x${string}`[]> | null = null;

function rateToApr(rate: bigint): number {
  return (Number(rate) / 1e18) * SECONDS_PER_YEAR;
}

async function readPolicyRate(
  client: ReturnType<typeof createPublicClient>,
  monetaryPolicy: `0x${string}`,
  controller: `0x${string}`,
  blockNumber?: bigint
): Promise<bigint> {
  return client.readContract({
    address: monetaryPolicy,
    abi: MONETARY_POLICY_WITH_CONTROLLER_ABI,
    functionName: "rate",
    args: [controller],
    blockNumber,
  }).catch(() =>
    client.readContract({
      address: monetaryPolicy,
      abi: MONETARY_POLICY_ABI,
      functionName: "rate",
      blockNumber,
    })
  );
}

export async function fetchCurvePositions(address: string): Promise<BorrowPosition[]> {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL),
  });

  controllerCache ??= (async () => {
    const controllerCount = Number(
      await client.readContract({
        address: CONTROLLER_FACTORY,
        abi: FACTORY_ABI,
        functionName: "n_collaterals",
      })
    );
    const discovered = await Promise.all(
      Array.from({ length: controllerCount }, (_, i) =>
        client.readContract({
          address: CONTROLLER_FACTORY,
          abi: FACTORY_ABI,
          functionName: "controllers",
          args: [BigInt(i)],
        })
      )
    ) as `0x${string}`[];
    return discovered;
  })();
  const controllers = await controllerCache;

  const activeControllers = (
    await Promise.all(
      controllers.map(async (controller) => {
        const hasLoan = await client.readContract({
          address: controller,
          abi: CONTROLLER_ABI,
          functionName: "loan_exists",
          args: [address as `0x${string}`],
        }).catch(() => false);
        return hasLoan ? controller : null;
      })
    )
  ).filter((controller): controller is `0x${string}` => controller !== null);

  if (activeControllers.length === 0) return [];

  const latestBlock = await client.getBlockNumber();
  const historicalBlock = latestBlock - 648_000n; // ~90 days

  return (
    await Promise.all(
      activeControllers.map(async (controller): Promise<BorrowPosition | null> => {
        const [debt, collateralToken, monetaryPolicy] = await Promise.all([
          client.readContract({
            address: controller,
            abi: CONTROLLER_ABI,
            functionName: "debt",
            args: [address as `0x${string}`],
          }),
          client.readContract({
            address: controller,
            abi: CONTROLLER_ABI,
            functionName: "collateral_token",
          }),
          client.readContract({
            address: controller,
            abi: CONTROLLER_ABI,
            functionName: "monetary_policy",
          }),
        ]) as [bigint, `0x${string}`, `0x${string}`];

        const debtAmount = Number(debt) / 1e18;
        if (debtAmount < MIN_DEBT_USD) return null;

        const [collateral, currentRate, historicalRate] = await Promise.all([
          client.readContract({
            address: collateralToken,
            abi: ERC20_ABI,
            functionName: "symbol",
          }).catch(() => "unknown"),
          readPolicyRate(client, monetaryPolicy, controller),
          readPolicyRate(client, monetaryPolicy, controller, historicalBlock).catch(() => null),
        ]);

        const currentRateApr = rateToApr(currentRate);
        const historicalRateApr = historicalRate === null ? undefined : rateToApr(historicalRate);

        return {
          protocol: "Curve crvUSD",
          collateral,
          collateralUsd: 0,
          debtToken: "crvUSD",
          debtTokenAddress: CRVUSD,
          debtAmount,
          debtUsd: debtAmount, // crvUSD is treated as $1 for the comparison.
          currentRateApr,
          ...(historicalRateApr !== undefined && {
            currentRate90dAvg: (currentRateApr + historicalRateApr) / 2,
          }),
        };
      })
    )
  ).filter((position): position is BorrowPosition => position !== null);
}
