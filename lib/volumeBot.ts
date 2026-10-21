import {
  Connection,
  VersionedTransaction,
} from "@solana/web3.js";
import { SubWallet } from "@/lib/multiWallet";

const PUMP_TRADE_URL = "https://pumpportal.fun/api/trade-local";

export type BotTradeMode = "buy-only" | "buy-sell-cycle";

export type VolumeBotConfig = {
  mintAddress: string;
  minTradeSol: number;
  maxTradeSol: number;
  minIntervalSec: number;
  maxIntervalSec: number;
  maxBudgetSol: number;
  mode: BotTradeMode;
  priorityFee: number;
};

export type VolumeTradeLog = {
  id: string;
  time: number;
  action: "buy" | "sell";
  walletLabel: string;
  walletPubKey: string;
  amountSol: number;
  signature?: string;
  error?: string;
  success: boolean;
};

export type VolumeBotStats = {
  totalTrades: number;
  successfulTrades: number;
  totalVolumeSol: number;
  totalSpentSol: number;
  status: "idle" | "running" | "stopped" | "budget-exhausted";
};

// Rastgele sayı üreteci (min-max aralığı)
export function getRandomNumber(min: number, max: number, decimals = 3): number {
  const rand = Math.random() * (max - min) + min;
  return Number(rand.toFixed(decimals));
}

// Tek bir bot işlemini yürütür
export async function executeSingleBotTrade(
  connection: Connection,
  wallet: SubWallet,
  mintAddress: string,
  action: "buy" | "sell",
  amountSol: number,
  priorityFee = 0.0005
): Promise<VolumeTradeLog> {
  const logId = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  try {
    const isBuy = action === "buy";
    const reqBody = isBuy
      ? {
          publicKey: wallet.publicKey,
          action: "buy",
          mint: mintAddress,
          denominatedInSol: "true",
          amount: amountSol,
          slippage: 25,
          priorityFee,
          pool: "pump",
        }
      : {
          publicKey: wallet.publicKey,
          action: "sell",
          mint: mintAddress,
          denominatedInSol: "false",
          amount: "100%", // Cüzdandaki bot tokenlarını boşaltır
          slippage: 25,
          priorityFee,
          pool: "pump",
        };

    const res = await fetch(PUMP_TRADE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Pumpportal API: ${errText.slice(0, 80)}`);
    }

    const txBytes = new Uint8Array(await res.arrayBuffer());
    const tx = VersionedTransaction.deserialize(txBytes);

    // Otomatik anahtar imzası (sıfır popup)
    tx.sign([wallet.keypair]);

    const sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: true,
      maxRetries: 3,
    });

    return {
      id: logId,
      time: Date.now(),
      action,
      walletLabel: wallet.label,
      walletPubKey: wallet.publicKey,
      amountSol,
      signature: sig,
      success: true,
    };
  } catch (err) {
    return {
      id: logId,
      time: Date.now(),
      action,
      walletLabel: wallet.label,
      walletPubKey: wallet.publicKey,
      amountSol,
      error: err instanceof Error ? err.message : String(err),
      success: false,
    };
  }
}
