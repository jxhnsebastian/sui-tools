import {
  CreateLiquidityPoolParams,
  MintParams,
  SwapParams,
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
      const { poolAddress, amount } = req.body;
      const params: SwapParams = { poolAddress, amount: new BN(amount) };

      const suiCreator = new SuiCreator(
        process.env.NETWORK! as "mainnet" | "testnet",
        process.env.DEV_PRIVATE_KEY!
      );

      const response = await suiCreator.swap(params);

      return res.status(200).json({
        success: true,
        message: "Token swaped successfully",
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
