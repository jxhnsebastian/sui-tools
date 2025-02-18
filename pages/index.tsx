import React, { useState, ChangeEvent, FormEvent } from "react";
import { ConnectButton, useWallet } from "@suiet/wallet-kit";
import useTokenCreator from "../utils/createToken";
import useLpCreator from "../utils/creataePool";
import {
  DropParams,
  PoolData,
  PublishData,
  TokenConfig,
} from "@/utils/helpers";
import BN from "bn.js";

interface TokenFormData {
  name: string;
  symbol: string;
  decimals: number;
  description: string;
  iconUrl: string;
}

interface MintFormData {
  treasury: string;
  coinType: string;
  amount: string;
  recipient: string;
}

interface LpFormData {
  baseToken: string;
  quoteToken: string;
  baseTokenAmount: string;
  quoteTokenAmount: string;
  feePercent: number;
  minPrice: number;
  maxPrice: number;
}

interface SwapFormData {
  poolAddress: string;
  amount: string;
}

interface DropFormData {
  token: string;
  accounts: Array<{
    address: string;
    amount: string;
  }>;
}

const TokenDeployPage = () => {
  const { account } = useWallet();
  const { deployToken, mergeMints, mintTokens, multiSender } =
    useTokenCreator();
  const [isDeploying, setIsDeploying] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [currentTab, setCurrentTab] = useState("deploy");
  const [publishData, setPublishData] = useState<PublishData[]>([]);
  const { createLiquidityPool, swap } = useLpCreator();
  const [isCreatingPool, setIsCreatingPool] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [poolData, setPoolData] = useState<PoolData[]>([]);
  const [a2b, setA2b] = useState(false);
  const [isDropping, setIsDropping] = useState<boolean>(false);
  const [dropFormData, setDropFormData] = useState<DropFormData>({
    token: "",
    accounts: [{ address: "", amount: "" }],
  });

  const [formData, setFormData] = useState<TokenFormData>({
    name: "MEGH Quote",
    symbol: "MCCQ",
    decimals: 9,
    description: "Token creator token.",
    iconUrl:
      "https://pbs.twimg.com/profile_images/1792571582902095872/1h0Tm7RU_400x400.jpg",
  });

  const [mintData, setMintData] = useState<MintFormData>({
    treasury: "",
    coinType: "",
    amount: "10000000000",
    recipient: account?.address || "",
  });

  const [coinType, setCoinType] = useState("");

  const [lpFormData, setLpFormData] = useState<LpFormData>({
    baseToken: "",
    quoteToken: "",
    baseTokenAmount: "10000000000",
    quoteTokenAmount: "10000000000",
    feePercent: 0.0025,
    minPrice: 0,
    maxPrice: 0,
  });

  const [swapFormData, setSwapFormData] = useState<SwapFormData>({
    poolAddress: "",
    amount: "0",
  });

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "decimals" ? Number(value) : value,
    }));
  };

  const handleDeploy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsDeploying(true);

    try {
      if (!account?.address) {
        throw new Error("Please connect your wallet first");
      }

      const result = await deployToken(formData);
      console.log(result);
      setPublishData((prev) => [...prev, result]);
      setSuccess(
        `Token deployed successfully! Transaction: ${result.explorer}`
      );
    } catch (err: any) {
      setError(err.message || "An error occurred during deployment");
    } finally {
      setIsDeploying(false);
    }
  };

  const handleMintInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setMintData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleMint = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsMinting(true);

    try {
      if (!account?.address) {
        throw new Error("Please connect your wallet first");
      }

      const result = await mintTokens({
        treasury: mintData.treasury,
        coinType: mintData.coinType,
        amount: BigInt(mintData.amount),
        recipient: mintData.recipient || account.address,
      });

      setSuccess(`Tokens minted successfully! Transaction: ${result.explorer}`);
    } catch (err: any) {
      setError(err.message || "An error occurred during minting");
    } finally {
      setIsMinting(false);
    }
  };

  const handleMerge = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsMerging(true);

    try {
      if (!account?.address) {
        throw new Error("Please connect your wallet first");
      }

      if (!coinType) {
        throw new Error("Please enter a valid coin type to merge");
      }

      const result = await mergeMints(coinType);
      if (result.digest) {
        setSuccess(
          `Coins merged successfully! Transaction: ${result.explorer}`
        );
      } else {
        setSuccess("No coins to merge or only one coin found");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during merging");
    } finally {
      setIsMerging(false);
    }
  };

  const handleLpInputChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;
    setLpFormData((prev) => ({
      ...prev,
      [name]:
        name === "feePercent" || name === "minPrice" || name === "maxPrice"
          ? parseFloat(value)
          : value,
    }));
  };

  const handleSwapInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setSwapFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCreatePool = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsCreatingPool(true);

    try {
      if (!account?.address) {
        throw new Error("Please connect your wallet first");
      }

      const result = await createLiquidityPool({
        baseToken: lpFormData.baseToken,
        quoteToken: lpFormData.quoteToken,
        baseTokenAmount: new BN(lpFormData.baseTokenAmount),
        quoteTokenAmount: new BN(lpFormData.quoteTokenAmount),
        feePercent: lpFormData.feePercent,
        minPrice: lpFormData.minPrice,
        maxPrice: lpFormData.maxPrice,
      });
      setPoolData((prev) => [...prev, result]);
      setSuccess(
        `Liquidity pool created successfully! Pool ID: ${result.pool}. Transaction: ${result.explorer}`
      );
    } catch (err: any) {
      setError(err.message || "An error occurred during pool creation");
    } finally {
      setIsCreatingPool(false);
    }
  };

  const handleSwap = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsSwapping(true);

    try {
      if (!account?.address) {
        throw new Error("Please connect your wallet first");
      }

      const result = await swap({
        poolAddress: swapFormData.poolAddress,
        amount: new BN(swapFormData.amount),
      });

      setSuccess(`Swap executed successfully! Transaction: ${result.explorer}`);
    } catch (err: any) {
      setError(err.message || "An error occurred during swap");
    } finally {
      setIsSwapping(false);
    }
  };

  const handleDropInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setDropFormData({
      ...dropFormData,
      [name]: value,
    });
  };

  const handleAccountChange = (
    index: number,
    field: "address" | "amount",
    value: string
  ) => {
    const updatedAccounts = [...dropFormData.accounts];
    updatedAccounts[index] = {
      ...updatedAccounts[index],
      [field]: value,
    };

    setDropFormData({
      ...dropFormData,
      accounts: updatedAccounts,
    });
  };

  const addAccount = () => {
    setDropFormData({
      ...dropFormData,
      accounts: [...dropFormData.accounts, { address: "", amount: "" }],
    });
  };

  const removeAccount = (index: number) => {
    const updatedAccounts = dropFormData.accounts.filter((_, i) => i !== index);
    setDropFormData({
      ...dropFormData,
      accounts: updatedAccounts,
    });
  };

  const handleDrop = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsDropping(true);

    const formattedData: DropParams = {
      token: dropFormData.token,
      accounts: dropFormData.accounts.map((acc) => ({
        address: acc.address,
        amount: BigInt(acc.amount || "0"),
      })),
    };

    try {
      if (!account?.address) {
        throw new Error("Please connect your wallet first");
      }

      if (
        !formattedData.token ||
        formattedData.accounts.some((acc) => !acc.address || !acc.amount)
      ) {
        throw new Error("Invalid inputs");
      }

      const result = await multiSender(formattedData);
      if (result.digest) {
        setSuccess(`Coins sent successfully! Transaction: ${result.explorer}`);
      } else {
        setSuccess("Failed to send coins!");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred while sending coins");
    } finally {
      setIsDropping(false);
    }
  };

  const truncateAddress = (address: string) => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 text-black/80">
      <div className="max-w-[50rem] mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h1 className="text-2xl font-bold mb-6">Sui Token Manager</h1>

          <div className="mb-6">
            <ConnectButton />
          </div>

          <div className="mb-6">
            <div className="flex border-b border-gray-200">
              <button
                className={`py-2 px-4 font-medium ${
                  currentTab === "deploy"
                    ? "border-b-2 border-blue-500 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
                onClick={() => setCurrentTab("deploy")}
              >
                Deploy Token
              </button>
              <button
                className={`py-2 px-4 font-medium ${
                  currentTab === "mint"
                    ? "border-b-2 border-blue-500 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
                onClick={() => setCurrentTab("mint")}
              >
                Mint Tokens
              </button>
              <button
                className={`py-2 px-4 font-medium ${
                  currentTab === "merge"
                    ? "border-b-2 border-blue-500 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
                onClick={() => setCurrentTab("merge")}
              >
                Merge Coins
              </button>
              <button
                className={`py-2 px-4 font-medium ${
                  currentTab === "createPool"
                    ? "border-b-2 border-blue-500 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
                onClick={() => setCurrentTab("createPool")}
              >
                Create LP
              </button>
              <button
                className={`py-2 px-4 font-medium ${
                  currentTab === "swap"
                    ? "border-b-2 border-blue-500 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
                onClick={() => setCurrentTab("swap")}
              >
                Swap
              </button>
              <button
                className={`py-2 px-4 font-medium ${
                  currentTab === "swap"
                    ? "border-b-2 border-blue-500 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
                onClick={() => setCurrentTab("multi-sender")}
              >
                Multi Sender
              </button>
            </div>
          </div>

          {currentTab === "deploy" && (
            <form onSubmit={handleDeploy} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  minLength={3}
                  maxLength={50}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Symbol
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  name="symbol"
                  value={formData.symbol}
                  onChange={handleInputChange}
                  required
                  minLength={2}
                  maxLength={5}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Decimals
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  type="number"
                  name="decimals"
                  value={formData.decimals}
                  onChange={handleInputChange}
                  required
                  min={0}
                  max={18}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Icon URL
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  name="iconUrl"
                  value={formData.iconUrl}
                  onChange={handleInputChange}
                  type="url"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isDeploying || !account?.address}
                className={`w-full py-2 px-4 rounded-md text-white font-medium 
                ${
                  isDeploying || !account?.address
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {isDeploying ? (
                  <div className="flex items-center justify-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Deploying...
                  </div>
                ) : (
                  "Deploy Token"
                )}
              </button>
            </form>
          )}

          {currentTab === "mint" && (
            <form onSubmit={handleMint} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Treasury (Object ID)
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  name="treasury"
                  value={mintData.treasury}
                  onChange={handleMintInputChange}
                  required
                  placeholder="0x..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Coin Type
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  name="coinType"
                  value={mintData.coinType}
                  onChange={handleMintInputChange}
                  required
                  placeholder="0x2::sui::SUI"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  type="number"
                  name="amount"
                  value={mintData.amount}
                  onChange={handleMintInputChange}
                  required
                  min="1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Recipient (leave empty for self)
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  name="recipient"
                  value={mintData.recipient}
                  onChange={handleMintInputChange}
                  placeholder={account?.address}
                />
              </div>

              <button
                type="submit"
                disabled={isMinting || !account?.address}
                className={`w-full py-2 px-4 rounded-md text-white font-medium 
                  ${
                    isMinting || !account?.address
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
              >
                {isMinting ? (
                  <div className="flex items-center justify-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Minting...
                  </div>
                ) : (
                  "Mint Tokens"
                )}
              </button>
            </form>
          )}

          {currentTab === "merge" && (
            <form onSubmit={handleMerge} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Coin Type to Merge
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  name="coinType"
                  value={coinType}
                  onChange={(e) => setCoinType(e.target.value)}
                  required
                  placeholder="0x2::sui::SUI"
                />
              </div>

              <button
                type="submit"
                disabled={isMerging || !account?.address}
                className={`w-full py-2 px-4 rounded-md text-white font-medium 
                  ${
                    isMerging || !account?.address
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
              >
                {isMerging ? (
                  <div className="flex items-center justify-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Merging...
                  </div>
                ) : (
                  "Merge Coins"
                )}
              </button>
            </form>
          )}

          {currentTab === "createPool" && (
            <form onSubmit={handleCreatePool} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Base Token (Metadata Object ID)
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  name="baseToken"
                  value={lpFormData.baseToken}
                  onChange={handleLpInputChange}
                  required
                  placeholder="0x..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quote Token (Metadata Object ID)
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  name="quoteToken"
                  value={lpFormData.quoteToken}
                  onChange={handleLpInputChange}
                  required
                  placeholder="0x..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Base Token Amount
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  type="number"
                  name="baseTokenAmount"
                  value={lpFormData.baseTokenAmount}
                  onChange={handleLpInputChange}
                  required
                  min="1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quote Token Amount
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  type="number"
                  name="quoteTokenAmount"
                  value={lpFormData.quoteTokenAmount}
                  onChange={handleLpInputChange}
                  required
                  min="1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fee Percentage
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  name="feePercent"
                  value={lpFormData.feePercent}
                  onChange={handleLpInputChange}
                  required
                >
                  <option value="0.0001">0.01% (Stable pairs)</option>
                  <option value="0.0005">0.05% (Correlated tokens)</option>
                  <option value="0.0025">0.25% (Standard pairs)</option>
                  <option value="0.01">1% (Exotic pairs)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Minimum Price
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  type="number"
                  name="minPrice"
                  value={lpFormData.minPrice}
                  onChange={handleLpInputChange}
                  required
                  min="0.000001"
                  step="0.000001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Maximum Price
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  type="number"
                  name="maxPrice"
                  value={lpFormData.maxPrice}
                  onChange={handleLpInputChange}
                  required
                  min="0.000001"
                  step="0.000001"
                />
              </div>

              <button
                type="submit"
                disabled={isCreatingPool || !account?.address}
                className={`w-full py-2 px-4 rounded-md text-white font-medium 
                  ${
                    isCreatingPool || !account?.address
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
              >
                {isCreatingPool ? (
                  <div className="flex items-center justify-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Creating Pool...
                  </div>
                ) : (
                  "Create Liquidity Pool"
                )}
              </button>
            </form>
          )}

          {currentTab === "swap" && (
            <form onSubmit={handleSwap} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pool Address
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  name="poolAddress"
                  value={swapFormData.poolAddress}
                  onChange={handleSwapInputChange}
                  required
                  placeholder="0x..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount to Swap (Base Token)
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  type="number"
                  name="amount"
                  value={swapFormData.amount}
                  onChange={handleSwapInputChange}
                  required
                  min="1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Base to Quote
                </label>
                <div
                  className={`w-14 h-8 flex items-center rounded-full p-1 cursor-pointer transition-all ${
                    a2b ? "bg-blue-600" : "bg-gray-300"
                  }`}
                  onClick={() => setA2b(!a2b)}
                >
                  <div
                    className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-all ${
                      a2b ? "translate-x-6" : "translate-x-0"
                    }`}
                  ></div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSwapping || !account?.address}
                className={`w-full py-2 px-4 rounded-md text-white font-medium 
                  ${
                    isSwapping || !account?.address
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
              >
                {isSwapping ? (
                  <div className="flex items-center justify-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Swapping...
                  </div>
                ) : (
                  "Swap Tokens"
                )}
              </button>
            </form>
          )}

          {currentTab === "multi-sender" && (
            <form onSubmit={handleDrop} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Token Address
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  name="token"
                  value={dropFormData.token}
                  onChange={handleDropInputChange}
                  required
                  placeholder="0x..."
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Recipients
                </label>

                {dropFormData.accounts.map((account, index) => (
                  <div key={index} className="flex space-x-2">
                    <div className="flex-grow">
                      <input
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Recipient address"
                        value={account.address}
                        onChange={(e) =>
                          handleAccountChange(index, "address", e.target.value)
                        }
                        required
                      />
                    </div>
                    <div className="w-1/3">
                      <input
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        type="number"
                        placeholder="Amount"
                        value={account.amount}
                        onChange={(e) =>
                          handleAccountChange(index, "amount", e.target.value)
                        }
                        required
                        min="1"
                      />
                    </div>
                    {index > 0 && (
                      <button
                        type="button"
                        onClick={() => removeAccount(index)}
                        className="p-2 text-red-500 hover:text-red-700"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addAccount}
                  className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 mr-1"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Add Recipient
                </button>
              </div>

              <button
                type="submit"
                disabled={isDropping}
                className={`w-full py-2 px-4 rounded-md text-white font-medium
          ${
            isDropping
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
              >
                {isDropping ? (
                  <div className="flex items-center justify-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Processing Drop...
                  </div>
                ) : (
                  "Execute Token Drop"
                )}
              </button>
            </form>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {success && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
              <p className="text-green-600">{success}</p>
            </div>
          )}

          <h2 className="text-xl font-semibold mb-4">Tokens:</h2>
          <div className="space-y-3">
            {publishData.map((token, index) => (
              <div key={index} className="flex flex-col sm:flex-row gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium">address:</span>
                  <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                    {truncateAddress(token.coinAddress)}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(token.coinAddress)}
                    className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                  >
                    <Copy />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">coinType:</span>
                  <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                    {truncateAddress(token.coinType)}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(token.coinType)}
                    className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                  >
                    <Copy />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">treasury:</span>
                  <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                    {truncateAddress(token.treasuryAddress)}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(token.treasuryAddress)}
                    className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                  >
                    <Copy />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <h2 className="text-xl font-semibold my-4">Pools:</h2>
          <div className="space-y-3">
            {poolData.map((pool, index) => (
              <div key={index} className="flex flex-col sm:flex-row gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Pool:</span>
                  <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                    {truncateAddress(pool.pool)}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(pool.pool)}
                    className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                  >
                    <Copy />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TokenDeployPage;

const Copy = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
};
