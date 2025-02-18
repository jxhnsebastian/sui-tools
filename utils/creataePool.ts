import { useWallet } from "@suiet/wallet-kit";
import CetusClmmSDK, {
  initCetusSDK,
  TickMath,
  ClmmPoolUtil,
  PreSwapParams,
  adjustForSlippage,
  Percentage,
  d,
} from "@cetusprotocol/cetus-sui-clmm-sdk";
import BN from "bn.js";
import Decimal from "decimal.js";
import { SuiClient } from "@mysten/sui/client";
import {
  CreateLiquidityPoolParams,
  Digest,
  PoolData,
  SwapParams,
} from "./helpers";

Decimal.set({ precision: 9 });

const useLpCreator = () => {
  const wallet = useWallet();

  const priceToTickIndex = (
    price: number,
    decimalsA: number,
    decimalsB: number
  ): BN => {
    // Convert price to sqrt price X64
    const sqrtPriceX64 = TickMath.priceToSqrtPriceX64(
      new Decimal(price),
      decimalsA,
      decimalsB
    );

    // Convert sqrt price to tick index
    return new BN(TickMath.sqrtPriceX64ToTickIndex(sqrtPriceX64));
  };

  const getPoolByCoins = async (
    coinA: string,
    coinB: string,
    sdk: CetusClmmSDK
  ) => {
    console.log(coinA, coinB);
    const pools = await sdk.Pool.getPoolByCoins([coinA, coinB]);
    console.log("Pool: ", pools);
    return pools;
  };

  const createLiquidityPool = async (
    params: CreateLiquidityPoolParams
  ): Promise<PoolData> => {
    try {
      if (
        !wallet.connected ||
        !wallet.account?.address ||
        !wallet.chain?.rpcUrl
      ) {
        throw new Error("Wallet not connected!");
      }

      const {
        baseToken,
        quoteToken,
        baseTokenAmount,
        quoteTokenAmount,
        feePercent,
        minPrice,
        maxPrice,
      } = params;

      const client = new SuiClient({
        url: wallet.chain.rpcUrl,
      });

      const cetusSDK = initCetusSDK({
        network: wallet.chain?.name.toLowerCase() as "mainnet" | "testnet",
      });
      cetusSDK.senderAddress = wallet.account.address;

      if (!baseToken || !quoteToken) {
        throw new Error("Base and quote token types are required");
      }

      if (baseTokenAmount.lten(0) || quoteTokenAmount.lten(0)) {
        throw new Error("Token amounts must be positive");
      }

      if (feePercent < 0 || feePercent > 1) {
        throw new Error("Fee percentage must be between 0 and 1");
      }

      if (minPrice >= maxPrice) {
        throw new Error("Minimum price must be less than maximum price");
      }

      let tickSpacing: number;
      switch (true) {
        case feePercent <= 0.0001:
          tickSpacing = 2;
          break;
        case feePercent <= 0.0005:
          tickSpacing = 10;
          break;
        case feePercent <= 0.0025:
          tickSpacing = 60;
          break;
        case feePercent <= 0.01:
          tickSpacing = 200;
          break;
        default:
          throw new Error("Invalid fee percentage");
      }

      const baseType =
        (
          (
            await client.getObject({
              id: baseToken,
              options: {
                showContent: true,
                showType: true,
              },
            })
          ).data?.type as string | undefined
        )?.match(/<([^>]+)>/)?.[1] ?? null;
      const quoteType =
        (
          (
            await client.getObject({
              id: quoteToken,
              options: {
                showContent: true,
                showType: true,
              },
            })
          ).data?.type as string | undefined
        )?.match(/<([^>]+)>/)?.[1] ?? null;

      if (!baseType || !quoteType) {
        throw new Error("Could not retrieve coin metadata");
      }

      console.log(baseType, quoteType);

      //   const existingPools = await getPoolByCoins(baseType, quoteType, cetusSDK);

      const baseDecimals = (
        await client.getCoinMetadata({ coinType: baseType })
      )?.decimals;
      const quoteDecimals = (
        await client.getCoinMetadata({ coinType: quoteType })
      )?.decimals;

      if (!baseDecimals || !quoteDecimals) {
        throw new Error("Failed to retrieve coin details");
      }
      const slippage = 0.05;

      // Calculate initial sqrt price (midpoint of the price range)
      const initialPrice = (minPrice + maxPrice) / 2;
      const initialize_sqrt_price = TickMath.priceToSqrtPriceX64(
        new Decimal(initialPrice),
        baseDecimals,
        quoteDecimals
      );

      // Calculate tick range based on min and max prices
      const tickLower = priceToTickIndex(minPrice, baseDecimals, quoteDecimals);
      const tickUpper = priceToTickIndex(maxPrice, baseDecimals, quoteDecimals);

      // Ensure ticks are multiples of tick spacing
      const normalizedTickLower = new BN(
        Math.floor(tickLower.toNumber() / tickSpacing) * tickSpacing
      );
      const normalizedTickUpper = new BN(
        Math.ceil(tickUpper.toNumber() / tickSpacing) * tickSpacing
      );

      // Estimate liquidity and coin amounts
      const liquidityInput =
        ClmmPoolUtil.estLiquidityAndcoinAmountFromOneAmounts(
          normalizedTickLower.toNumber(),
          normalizedTickUpper.toNumber(),
          baseTokenAmount,
          true,
          true,
          slippage,
          new BN(initialize_sqrt_price)
        );

      // Prepare transaction
      const createPoolPayload =
        await cetusSDK.Pool.createPoolTransactionPayload({
          coinTypeA: baseType,
          coinTypeB: quoteType,
          tick_spacing: tickSpacing,
          initialize_sqrt_price: initialize_sqrt_price.toString(),
          uri: "", // Optional pool icon URI
          amount_a: baseTokenAmount.toNumber(),
          amount_b: new BN(liquidityInput.tokenMaxB).toNumber(),
          fix_amount_a: true,
          tick_lower: normalizedTickLower.toNumber(),
          tick_upper: normalizedTickUpper.toNumber(),
          metadata_a: baseToken,
          metadata_b: quoteToken,
          slippage,
        });

      createPoolPayload.setGasBudget(100000000);

      const response = await wallet.signAndExecuteTransaction({
        transaction: createPoolPayload,
      });

      console.log("Transaction response:", response);

      await client.waitForTransaction({ digest: response.digest });

      const transactionData = await client.getTransactionBlock({
        digest: response.digest,
        options: {
          showEffects: true,
          showInput: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });

      const { digest, objectChanges, effects, events } = transactionData;

      if (!objectChanges || effects?.status.status !== "success") {
        throw new Error("Pool creation transaction failed");
      }

      const pool = objectChanges.find(
        (o) =>
          o.type === "created" &&
          (o as any).objectType.includes("::pool::Pool<")
      );

      const digestUrl = `https://suiscan.xyz/${wallet.chain?.name.toLowerCase()}/tx/${digest}`;
      console.log("Digest url: ", digestUrl);

      if (pool && pool.type === "created") {
        return { digest, explorer: digestUrl, pool: (pool as any)?.objectId };
      } else throw new Error("Missing pool data");
    } catch (error: any) {
      console.error("Error creating liquidity pool:", error);
      throw new Error(`Failed to create liquidity pool: ${error.message}`);
    }
  };

  const swap = async (params: SwapParams): Promise<Digest> => {
    try {
      if (
        !wallet.connected ||
        !wallet.account?.address ||
        !wallet.chain?.rpcUrl
      ) {
        throw new Error("Wallet not connected!");
      }

      const { poolAddress, amount } = params;

      if (!poolAddress) {
        throw new Error("Pool address is required");
      }

      if (!amount || amount.lten(0)) {
        throw new Error("Invalid token amount!");
      }

      const client = new SuiClient({
        url: wallet.chain.rpcUrl,
      });

      const cetusSDK = initCetusSDK({
        network: wallet.chain?.name.toLowerCase() as "mainnet" | "testnet",
      });
      cetusSDK.senderAddress = wallet.account.address;

      const a2b = false;
      const byAmountIn = true;
      const slippage = Percentage.fromDecimal(d(5));

      const pool = await cetusSDK.Pool.getPool(poolAddress);
      if (!pool) {
        throw new Error("Failed to retrieve pool details");
      }

      const baseDecimals = (
        await client.getCoinMetadata({ coinType: pool.coinTypeA })
      )?.decimals;
      const quoteDecimals = (
        await client.getCoinMetadata({ coinType: pool.coinTypeB })
      )?.decimals;

      if (!baseDecimals || !quoteDecimals) {
        throw new Error("Failed to retrieve coin details");
      }

      // Pre-swap estimation
      const estimatedResult = await cetusSDK.Swap.preswap({
        pool: pool,
        currentSqrtPrice: pool.current_sqrt_price,
        coinTypeA: pool.coinTypeA,
        coinTypeB: pool.coinTypeB,
        decimalsA: baseDecimals,
        decimalsB: quoteDecimals,
        a2b,
        byAmountIn,
        amount: amount.toString(),
      });

      const toAmount = byAmountIn
        ? estimatedResult?.estimatedAmountOut
        : estimatedResult?.estimatedAmountIn;

      if (!toAmount || !estimatedResult) {
        throw new Error("Failed to calculate preswap");
      }

      const swapPayload = await cetusSDK.Swap.createSwapTransactionPayload({
        pool_id: pool.poolAddress,
        coinTypeA: pool.coinTypeA,
        coinTypeB: pool.coinTypeB,
        a2b,
        by_amount_in: byAmountIn,
        amount: estimatedResult.amount.toString(),
        amount_limit: "0",
      });

      swapPayload.setGasBudget(100000000);

      const response = await wallet.signAndExecuteTransaction({
        transaction: swapPayload,
      });

      console.log("Transaction response:", response);

      await client.waitForTransaction({ digest: response.digest });

      const transactionData = await client.getTransactionBlock({
        digest: response.digest,
        options: {
          showEffects: true,
          showInput: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });

      const { digest, effects } = transactionData;

      if (!effects || effects.status.status !== "success") {
        throw new Error(
          "Swap transaction failed. Check the response for details."
        );
      }

      const digestUrl = `https://suiscan.xyz/${wallet.chain?.name.toLowerCase()}/tx/${digest}`;
      console.log("Digest URL:", digestUrl);

      return { digest, explorer: digestUrl };
    } catch (error: any) {
      console.error("Error during swap operation:", error);
      throw new Error(`Swap failed: ${error.message}`);
    }
  };

  return {
    createLiquidityPool,
    swap,
  };
};

export default useLpCreator;
