import { useWallet } from "@suiet/wallet-kit";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import {
  Digest,
  DropParams,
  intoBase64,
  MintParams,
  PublishData,
  TokenConfig,
} from "./helpers";
import { useEffect } from "react";
import { CoinStruct, SuiClient } from "@mysten/sui/client";

const useTokenCreator = () => {
  const wallet = useWallet();
  async function getCoins(address: string): Promise<CoinStruct[]> {
    try {
      const pageSize = 50;
      let hasNextPage = true;
      let cursor = null;
      let coins: CoinStruct[] = [];

      const client = new SuiClient({
        url: wallet.chain?.rpcUrl!,
      });

      while (hasNextPage) {
        const response = await client.getAllCoins({
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
      throw new Error(`Failed to fetch coins: ${error?.message}`, error);
    }
  }

  function validateTokenConfig(config: TokenConfig): void {
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

  async function deployToken(config: TokenConfig): Promise<PublishData> {
    try {
      if (
        !wallet.connected ||
        !wallet.account?.address ||
        !wallet.chain?.rpcUrl
      ) {
        throw new Error("Wallet not connected!");
      }

      validateTokenConfig(config);

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
        tx.pure(bcs.Address.serialize(wallet.account?.address))
      );

      tx.setGasBudget(100000000);

      const response = await wallet.signAndExecuteTransaction({
        transaction: tx,
      });

      const client = new SuiClient({
        url: wallet.chain.rpcUrl,
      });

      console.log("response", response);
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

      console.log("transactionData: ", transactionData);

      const {
        digest,
        objectChanges: maybeObjectChanges,
        effects,
      } = transactionData;

      if (effects?.status.status !== "success") {
        throw new Error("Token deployment failed: " + effects?.status);
      }

      const digestUrl = `https://suiscan.xyz/${wallet.chain.name.toLowerCase()}/tx/${digest}`;
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
      } else throw new Error("Missing publish data " + effects?.status);
    } catch (error: any) {
      throw new Error(`Token deployment failed: ${error?.message}`);
    }
  }

  async function mintTokens(params: MintParams): Promise<Digest> {
    try {
      if (
        !wallet.connected ||
        !wallet.account?.address ||
        !wallet.chain?.rpcUrl
      ) {
        throw new Error("Wallet not connected!");
      }

      const { treasury, coinType, amount, recipient } = params;

      console.log(treasury, coinType, amount, recipient);

      if (amount <= BigInt(0)) {
        throw new Error("Mint amount must be positive");
      }

      if (!treasury || !coinType || !recipient) {
        throw new Error("Missing parameters");
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

      const response = await wallet.signAndExecuteTransaction({
        transaction: tx,
      });

      const client = new SuiClient({
        url: wallet.chain.rpcUrl,
      });

      console.log("response", response);
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

      if (effects?.status.status !== "success") {
        throw new Error("Token minting failed " + effects?.status);
      }

      const digestUrl = `https://suiscan.xyz/${wallet.chain.name.toLowerCase()}/tx/${digest}`;
      console.log("Digest url: ", digestUrl);
      console.log("Token successfully minted!");

      return {
        digest,
        explorer: digestUrl,
      };
    } catch (error: any) {
      console.error("Minting Error:", error);
      throw new Error(`Token minting failed: ${error?.message}`, error);
    }
  }

  async function mergeMints(coinType: string): Promise<Digest> {
    try {
      if (
        !wallet.connected ||
        !wallet.account?.address ||
        !wallet.chain?.rpcUrl
      ) {
        throw new Error("Wallet not connected!");
      }

      if (!coinType) {
        throw new Error("Cointype is required");
      }

      const coins = await getCoins(wallet.account.address);
      const mergeObjectIds: string[] = coins
        .filter((coin) => coin.coinType === coinType)
        .map((coin) => coin.coinObjectId);

      console.log("Merge object IDs:", mergeObjectIds);

      if (mergeObjectIds && mergeObjectIds.length > 1) {
        const tx = new Transaction();
        tx.mergeCoins(mergeObjectIds[0], [...mergeObjectIds.slice(1)]);
        tx.setGasBudget(100000000);

        const response = await wallet.signAndExecuteTransaction({
          transaction: tx,
        });

        const client = new SuiClient({
          url: wallet.chain.rpcUrl,
        });

        console.log("merge response", response);
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

        if (effects?.status.status !== "success") {
          throw new Error("Token mint merge failed: " + effects?.status);
        }

        const digestUrl = `https://suiscan.xyz/${wallet.chain.name.toLowerCase()}/tx/${digest}`;
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
      throw new Error(`Token mint merging failed: ${error?.message}`, error);
    }
  }

  async function multiSender(params: DropParams): Promise<Digest> {
    try {
      if (
        !wallet.connected ||
        !wallet.account?.address ||
        !wallet.chain?.rpcUrl
      ) {
        throw new Error("Wallet not connected!");
      }

      const { token, accounts } = params;

      const client = new SuiClient({
        url: wallet.chain.rpcUrl,
      });

      const coinType =
        (
          (
            await client.getObject({
              id: token,
              options: {
                showContent: true,
                showType: true,
              },
            })
          ).data?.type as string | undefined
        )?.match(/<([^>]+)>/)?.[1] ?? null;

      if (!coinType) throw new Error("Failed to fetch coin type!");

      const ownedCoins = await getCoins(wallet.account.address);
      const coinId = ownedCoins.find(
        (coin) => coin.coinType === coinType
      )?.coinObjectId;

      if (!coinId) throw new Error("Failed to fetch coin object id!");

      const tx = new Transaction();

      for (const account of accounts) {
        if (account.amount <= BigInt(0)) {
          throw new Error("Mint amount must be positive");
        }
        const [splitCoin] = tx.splitCoins(coinId, [account.amount]);
        tx.transferObjects([splitCoin], account.address);
      }

      tx.setGasBudget(100000000);

      const response = await wallet.signAndExecuteTransaction({
        transaction: tx,
      });

      console.log(response);

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

      if (effects?.status.status !== "success") {
        throw new Error("Token minting failed: " + effects?.status);
      }

      const digestUrl = `https://suiscan.xyz/${wallet.chain.name.toLowerCase()}/tx/${digest}`;
      console.log("Digest url: ", digestUrl);
      console.log("Token successfully minted!");

      return {
        digest,
        explorer: digestUrl,
      };
    } catch (error: any) {
      console.error("Minting Error:", error);
      throw new Error(`Token minting failed: ${error?.message}`, error);
    }
  }

  return { deployToken, mintTokens, mergeMints, getCoins, multiSender };
};

export default useTokenCreator;
