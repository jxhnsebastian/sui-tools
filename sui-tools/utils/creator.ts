import {
  SuiClient,
  getFullnodeUrl,
  SuiTransactionBlockResponse,
  GetDynamicFieldsParams,
  GetObjectParams,
  CoinMetadata,
  GetTransactionBlockParams,
  GetCoinMetadataParams,
  CoinStruct,
} from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { MIST_PER_SUI, normalizeSuiAddress } from "@mysten/sui/utils";
import { bcs } from "@mysten/sui/bcs";
import { SignatureScheme } from "@mysten/sui/cryptography";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { homedir } from "os";
import path from "path";
import fs from "fs";
import {
  CreateLiquidityPoolParams,
  Digest,
  DropAccounts,
  DropParams,
  MintParams,
  PoolData,
  PublishData,
  SwapParams,
  TokenConfig,
  TreasuryCap,
  intoBase64,
} from "./contract";
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
Decimal.set({ precision: 9 });

class TokenDeploymentError extends Error {
  constructor(message: string, public details?: any) {
    super(message);
    this.name = "TokenDeploymentError";
  }
}

class TokenMintingError extends Error {
  constructor(message: string, public details?: any) {
    super(message);
    this.name = "TokenMintingError";
  }
}

class SuiCreator {
  private client: SuiClient;
  private keypair: Ed25519Keypair;
  private cetusSDK: CetusClmmSDK;
  private network: "mainnet" | "testnet" | "devnet";
  private publicKey: string;

  constructor(
    network: "mainnet" | "testnet" | "devnet" = "testnet",
    privateKey?: string,
    sender?: string
  ) {
    if (!["mainnet", "testnet", "devnet"].includes(network)) {
      throw new Error(`Invalid network: ${network}`);
    }

    console.log(`In ${network}`);

    if (!privateKey) throw new Error(`Private key required!`);

    this.client = new SuiClient({
      url: getFullnodeUrl(network),
    });

    this.keypair = this.validateAndCreateKeypair(privateKey);

    this.cetusSDK = initCetusSDK({ network: network as "mainnet" | "testnet" });
    this.cetusSDK.senderAddress = sender ?? process.env.DEV_PUBLIC_KEY!;

    this.network = network;
    this.publicKey = this.keypair.getPublicKey().toSuiAddress();
  }

  private validateAndCreateKeypair(privateKey: string): Ed25519Keypair {
    try {
      return Ed25519Keypair.fromSecretKey(privateKey);
    } catch (error: any) {
      throw new Error(`Keypair creation failed: ${error?.message}`);
    }
  }

  private createTokenModule(config: TokenConfig): string {
    return `
  module sui_token::${config.symbol.toLowerCase()} {
      use sui::coin::{Self, TreasuryCap, Coin};
      use 0x2::url;
  
      public struct ${config.symbol.toUpperCase()} has drop {}
  
      fun init(witness: ${config.symbol.toUpperCase()}, ctx: &mut TxContext) {
          let (treasury, coin_metadata) = coin::create_currency(
              witness, 
              ${config.decimals}, 
              b"${config.symbol}", 
              b"${config.name}", 
              b"${config.description || ""}", 
              option::some(url::new_unsafe_from_bytes(b"${
                config.iconUrl || ""
              }")), 
              ctx
          );
  
          transfer::public_transfer(treasury, tx_context::sender(ctx));
          transfer::public_freeze_object(coin_metadata);
      }
  
      public fun mint(
          treasury_cap: &mut TreasuryCap<${config.symbol.toUpperCase()}>, 
          amount: u64, 
          ctx: &mut TxContext
      ): Coin<${config.symbol.toUpperCase()}> {
          coin::mint(treasury_cap, amount, ctx)
      }
  
      public fun burn(
          treasury_cap: &mut TreasuryCap<${config.symbol.toUpperCase()}>, 
          coin: Coin<${config.symbol.toUpperCase()}>
      ) {
          coin::burn(treasury_cap, coin);
      }
  }
      `.trim();
  }

  async deployToken(config: TokenConfig): Promise<PublishData> {
    try {
      this.validateTokenConfig(config);

      const modules = [intoBase64(config)];
      const dependencies = [
        "0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000000000000000000000000000002",
      ];

      console.log("Publishing the Move module...");
      const tx = new Transaction();

      const [upgradeCap] = tx.publish({
        modules,
        dependencies,
      });
      tx.transferObjects(
        [upgradeCap],
        tx.pure(
          bcs.Address.serialize(this.keypair.getPublicKey().toSuiAddress())
        )
      );

      tx.setGasBudget(100000000);

      const response = await this.client.signAndExecuteTransaction({
        signer: this.keypair,
        transaction: tx,
        options: {
          showEffects: true,
          showInput: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });
      const { digest, objectChanges: maybeObjectChanges, effects } = response;

      if (effects?.status.status !== "success") {
        throw new TokenDeploymentError(
          "Token deployment failed",
          effects?.status
        );
      }

      const digestUrl = `https://suiscan.xyz/${this.network}/tx/${digest}`;
      console.log("Digest url: ", digestUrl);
      const objectChanges = maybeObjectChanges || [];

      const treasury = objectChanges.find(
        (o) =>
          o.type === "created" && o.objectType.includes("::coin::TreasuryCap<")
      );

      const meta = objectChanges.find(
        (o) =>
          o.type === "created" && o.objectType.includes("::coin::CoinMetadata<")
      );

      console.log("Token successfully deployed!");
      if (
        treasury &&
        treasury.type === "created" &&
        meta &&
        meta.type === "created"
      ) {
        return {
          digest,
          treasuryAddress: treasury.objectId,
          treasuryObjectType: treasury.objectType,
          coinType: treasury.objectType.match(/<([^>]+)>/)?.[1]!,
          coinAddress: meta.objectId,
          explorer: digestUrl,
        };
      } else
        throw new TokenDeploymentError("Missing publish data", effects?.status);
    } catch (error: any) {
      throw new TokenDeploymentError(
        `Token deployment failed: ${error?.message}`,
        error
      );
    }
  }

  private validateTokenConfig(config: TokenConfig): void {
    const validations = [
      {
        condition: config.name.length < 3 || config.name.length > 50,
        message: "Token name must be between 3 and 50 characters",
      },
      {
        condition: config.symbol.length < 2 || config.symbol.length > 5,
        message: "Token symbol must be between 2 and 5 characters",
      },
      {
        condition: config.decimals < 0 || config.decimals > 18,
        message: "Decimals must be between 0 and 18",
      },
      // {
      //   condition: config.totalSupply <= BigInt(0),
      //   message: "Total supply must be greater than zero",
      // },
    ];

    const failedValidation = validations.find((v) => v.condition);
    if (failedValidation) {
      throw new Error(failedValidation.message);
    }
  }

  async mintTokens(params: MintParams): Promise<Digest> {
    try {
      const { treasury, coinType, amount, recipient } = params;

      console.log(treasury, coinType, amount, recipient);

      if (amount <= BigInt(0)) {
        throw new TokenMintingError("Mint amount must be positive");
      }

      if (!treasury || !coinType || !recipient) {
        throw new TokenMintingError("Missing parameters");
      }

      const tx = new Transaction();

      const mint = tx.moveCall({
        target: `0x2::coin::mint_and_transfer`,
        arguments: [
          tx.object(treasury),
          tx.pure(bcs.U64.serialize(BigInt(amount))),
          tx.pure(bcs.Address.serialize(recipient)),
        ],
        typeArguments: [coinType],
      });

      tx.setGasBudget(100000000);

      const response = await this.client.signAndExecuteTransaction({
        signer: this.keypair,
        transaction: tx,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });

      const { digest, effects } = response;

      if (effects?.status.status !== "success") {
        throw new TokenMintingError(
          "Token minting failed",
          response.effects?.status
        );
      }

      const digestUrl = `https://suiscan.xyz/${this.network}/tx/${digest}`;
      console.log("Digest url: ", digestUrl);
      console.log("Token successfully minted!");

      return {
        digest,
        explorer: digestUrl,
      };
    } catch (error: any) {
      console.error("Minting Error:", error);
      throw new TokenMintingError(
        `Token minting failed: ${error?.message}`,
        error
      );
    }
  }

  async mergeMints(coinType: string): Promise<Digest> {
    try {
      if (!coinType) {
        throw new TokenMintingError("Cointype is required");
      }

      const coins = await this.getCoins(this.publicKey);
      const mergeObjectIds: string[] = coins
        .filter((coin) => coin.coinType === coinType)
        .map((coin) => coin.coinObjectId);

      console.log(mergeObjectIds);

      if (mergeObjectIds && mergeObjectIds.length > 1) {
        const tx = new Transaction();
        tx.mergeCoins(mergeObjectIds[0], [...mergeObjectIds.slice(1)]);
        tx.setGasBudget(100000000);

        const response = await this.client.signAndExecuteTransaction({
          signer: this.keypair,
          transaction: tx,
          options: {
            showEffects: true,
            showEvents: true,
          },
        });

        const { digest, effects } = response;

        if (effects?.status.status !== "success") {
          throw new TokenMintingError(
            "Token mint merge failed",
            response.effects?.status
          );
        }

        const digestUrl = `https://suiscan.xyz/${this.network}/tx/${digest}`;
        console.log("Digest url: ", digestUrl);
        console.log("Token mints successfully merged!");

        return {
          digest,
          explorer: digestUrl,
        };
      }

      return {} as Digest;
    } catch (error: any) {
      console.error("Mint merging Error:", error);
      throw new TokenMintingError(
        `Token mint merging failed: ${error?.message}`,
        error
      );
    }
  }

  private priceToTickIndex(
    price: number,
    decimalsA: number,
    decimalsB: number
  ): BN {
    // Convert price to sqrt price X64
    const sqrtPriceX64 = TickMath.priceToSqrtPriceX64(
      new Decimal(price),
      decimalsA,
      decimalsB
    );

    // Convert sqrt price to tick index
    return new BN(TickMath.sqrtPriceX64ToTickIndex(sqrtPriceX64));
  }

  async createLiquidityPool(
    params: CreateLiquidityPoolParams
  ): Promise<PoolData> {
    const {
      baseToken,
      quoteToken,
      baseTokenAmount,
      quoteTokenAmount,
      feePercent,
      minPrice,
      maxPrice,
    } = params;

    try {
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
            await this.client.getObject({
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
            await this.client.getObject({
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

      const existingPools = await this.getPoolByCoins(baseType, quoteType);

      const baseDecimals = (
        await this.client.getCoinMetadata({ coinType: baseType })
      )?.decimals;
      const quoteDecimals = (
        await this.client.getCoinMetadata({ coinType: quoteType })
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
      const tickLower = this.priceToTickIndex(
        minPrice,
        baseDecimals,
        quoteDecimals
      );
      const tickUpper = this.priceToTickIndex(
        maxPrice,
        baseDecimals,
        quoteDecimals
      );

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
        await this.cetusSDK.Pool.createPoolTransactionPayload({
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

      const response = await this.client.signAndExecuteTransaction({
        signer: this.keypair,
        transaction: createPoolPayload,
        options: {
          showEffects: true,
          showInput: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });

      const {
        digest,
        objectChanges: maybeObjectChanges,
        effects,
        events,
      } = response;
      const objectChanges = maybeObjectChanges || [];
      console.log(objectChanges, effects, events);

      if (effects?.status.status !== "success") {
        throw new Error("Pool creation transaction failed");
      }

      const pool = objectChanges.find(
        (o) => o.type === "created" && o.objectType.includes("::pool::Pool<")
      );

      const digestUrl = `https://suiscan.xyz/${this.network}/tx/${digest}`;
      console.log("Digest url: ", digestUrl);

      if (pool && pool.type === "created") {
        return { digest, explorer: digestUrl, pool: pool?.objectId };
      } else
        throw new TokenDeploymentError("Missing pool data", effects?.status);
    } catch (error) {
      console.error("Error creating liquidity pool:", error);
      throw error;
    }
  }

  async swap(params: SwapParams): Promise<Digest> {
    try {
      const { poolAddress, amount } = params;

      if (!poolAddress) {
        throw new Error("Pool address is required");
      }

      if (!amount || amount.lten(0)) {
        throw new Error("Invalid token amount!");
      }

      const a2b = true;
      const byAmountIn = true;
      const slippage = Percentage.fromDecimal(d(5));

      const pool = await this.cetusSDK.Pool.getPool(poolAddress);
      if (!pool) {
        throw new Error("Failed to retrieve pool details");
      }

      const baseDecimals = (
        await this.client.getCoinMetadata({ coinType: pool.coinTypeA })
      )?.decimals;
      const quoteDecimals = (
        await this.client.getCoinMetadata({ coinType: pool.coinTypeB })
      )?.decimals;

      if (!baseDecimals || !quoteDecimals) {
        throw new Error("Failed to retrieve coin details");
      }

      // Pre-swap estimation
      const estimatedResult = await this.cetusSDK.Swap.preswap({
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

      // const amountLimit = adjustForSlippage(toAmount, slippage, !byAmountIn);

      // if (!amountLimit) {
      //   throw new Error("Failed to calculate amount limit with slippage");
      // }

      const swapPayload = await this.cetusSDK.Swap.createSwapTransactionPayload(
        {
          pool_id: pool.poolAddress,
          coinTypeA: pool.coinTypeA,
          coinTypeB: pool.coinTypeB,
          a2b,
          by_amount_in: byAmountIn,
          amount: estimatedResult.amount.toString(),
          amount_limit: "0",
        }
      );

      swapPayload.setGasBudget(100000000);
      const response = await this.client.signAndExecuteTransaction({
        signer: this.keypair,
        transaction: swapPayload,
        options: {
          showEffects: true,
          showInput: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });

      console.log("Transaction response:", response);

      const { digest, objectChanges, effects } = response;

      if (!effects || effects.status.status !== "success") {
        throw new Error(
          "Swap transaction failed. Check the response for details."
        );
      }

      const digestUrl = `https://suiscan.xyz/${this.network}/tx/${digest}`;
      console.log("Digest URL:", digestUrl);

      return { digest, explorer: digestUrl };
    } catch (error) {
      console.error("Error during swap operation:", error);
      throw error;
    }
  }

  async multiSender(params: DropParams): Promise<Digest> {
    try {
      const { token, accounts } = params;

      const coinType =
        (
          (
            await this.client.getObject({
              id: token,
              options: {
                showContent: true,
                showType: true,
              },
            })
          ).data?.type as string | undefined
        )?.match(/<([^>]+)>/)?.[1] ?? null;

      if (!coinType) throw new Error("Failed to fetch coin type!");

      const ownedCoins = await this.getCoins(this.publicKey!);

      const coinId = ownedCoins.find(
        (coin) => coin.coinType === coinType
      )?.coinObjectId;

      if (!coinId) throw new Error("Failed to fetch coin object id!");

      const tx = new Transaction();

      for (const account of accounts) {
        if (account.amount <= BigInt(0)) {
          throw new TokenMintingError("Mint amount must be positive");
        }
        const [splitCoin] = tx.splitCoins(coinId, [account.amount]);
        tx.transferObjects([splitCoin], account.address);
      }

      tx.setGasBudget(100000000);

      const response = await this.client.signAndExecuteTransaction({
        signer: this.keypair,
        transaction: tx,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });

      console.log(response);

      const { digest, effects } = response;

      if (effects?.status.status !== "success") {
        throw new TokenMintingError(
          "Token minting failed",
          response.effects?.status
        );
      }

      const digestUrl = `https://suiscan.xyz/${this.network}/tx/${digest}`;
      console.log("Digest url: ", digestUrl);
      console.log("Token successfully minted!");

      return {
        digest,
        explorer: digestUrl,
      };
    } catch (error: any) {
      console.error("Minting Error:", error);
      throw new TokenMintingError(
        `Token minting failed: ${error?.message}`,
        error
      );
    }
  }

  async getCoins(address: string): Promise<CoinStruct[]> {
    try {
      const pageSize = 50;
      let hasNextPage = true;
      let cursor = null;
      let coins: CoinStruct[] = [];

      while (hasNextPage) {
        const response = await this.client.getAllCoins({
          owner: address,
          limit: pageSize,
          cursor: cursor,
        });

        const ownedCoins = response.data;
        const nextCursor = response.hasNextPage ? response.nextCursor : null;

        coins = coins.concat(ownedCoins);

        cursor = nextCursor;
        hasNextPage = nextCursor !== null;
      }

      return coins;
    } catch (error: any) {
      console.error("Failed to fetch coins:", error);
      throw new TokenMintingError(
        `Failed to fetch coins: ${error?.message}`,
        error
      );
    }
  }

  async getPoolByCoins(coinA: string, coinB: string) {
    console.log(coinA, coinB);
    const pools = await this.cetusSDK.Pool.getPoolByCoins([coinA, coinB]);
    console.log("Pool: ", pools);
  }

  async getTreasuryInfoForToken(digest: string): Promise<PublishData> {
    try {
      const treasuryObjects = await this.client.getTransactionBlock({
        digest,
        options: {
          showEffects: true,
          showInput: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });

      for (const obj of treasuryObjects.effects?.created || []) {
        const objectDetails = await this.client.getObject({
          id: obj.reference.objectId,
          options: {
            showContent: true,
            showType: true,
          },
        });
        console.log(objectDetails);
        if (
          objectDetails?.data &&
          objectDetails.data.type?.includes("::coin::TreasuryCap<")
        ) {
          console.log(objectDetails);
          return {
            digest,
            treasuryAddress: objectDetails.data.objectId,
            treasuryObjectType: objectDetails.data.type,
            coinType: objectDetails.data.type.match(/<([^>]+)>/)?.[1]!,
            coinAddress: "",
            explorer: `https://suiscan.xyz/${this.network}/tx/${digest}`,
          };
        }
      }

      throw new Error("No TreasuryCap found in the transaction block");
    } catch (error) {
      console.error("Error retrieving treasury information:", error);
      throw error;
    }
  }

  public getTreasury(data: PublishData): TreasuryCap {
    try {
      if (!data || !data.treasuryObjectType || !data.treasuryAddress) {
        throw new Error("Missing required fields in publish data.");
      }

      const [address, module, name] = data.treasuryObjectType
        .slice(
          data.treasuryObjectType.indexOf("<") + 1,
          data.treasuryObjectType.length - 1
        )
        .split("::");
      return {
        address: data.treasuryAddress,
        innerType: { address, module, name },
      };
    } catch (error: any) {
      throw new Error("Failed to get treasury details!");
    }
  }

  public async getBalance(address: string): Promise<number> {
    const suiAfter = await this.client.getBalance({
      owner: address,
    });
    return Number.parseInt(suiAfter.totalBalance) / Number(MIST_PER_SUI);
  }
}

export default SuiCreator;
