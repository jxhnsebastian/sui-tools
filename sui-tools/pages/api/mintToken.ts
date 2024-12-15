import { MintParams, TokenConfig } from "@/utils/contract";
import SuiCreator from "@/utils/creator";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "POST") {
    try {
      const { treasury, coinType, amount, recipient } = req.body;

      const params: MintParams = {
        treasury,
        coinType,
        amount: BigInt(amount),
        recipient,
      };

      const suiCreator = new SuiCreator(
        process.env.NETWORK! as "mainnet" | "testnet",
        process.env.DEV_PRIVATE_KEY!
      );

      const response = await suiCreator.mintTokens(params);

      return res.status(200).json({
        success: true,
        message: "Token minted successfully",
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
