import {
  CreateLiquidityPoolParams,
  MintParams,
  TokenConfig,
} from "@/utils/contract";
import SuiCreator from "@/utils/creator";
import { BN } from "bn.js";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "POST") {
    try {
      const {
        baseToken,
        quoteToken,
        baseTokenAmount,
        quoteTokenAmount,
        feePercent,
        minPrice,
        maxPrice,
      }: CreateLiquidityPoolParams = req.body;

      const params: CreateLiquidityPoolParams = {
        baseToken,
        quoteToken,
        baseTokenAmount: new BN(baseTokenAmount),
        quoteTokenAmount: new BN(quoteTokenAmount),
        feePercent,
        minPrice,
        maxPrice
      };

      console.log(params)

      const suiCreator = new SuiCreator(
        process.env.NETWORK! as "mainnet" | "testnet",
        process.env.DEV_PRIVATE_KEY!
      );

      const response = await suiCreator.createLiquidityPool(params);

      return res.status(200).json({
        success: true,
        message: "Pool created successfully",
        ...response,
      });
    } catch (e: any) {
      console.log(e);
      return res.status(500).json({ success: false, message: e.message });
    }
  } else {
    return res
      .status(405)
      .json({ success: false, message: "Method not allowed" });
  }
}
