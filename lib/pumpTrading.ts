import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";
import { SubWallet } from "@/lib/multiWallet";
import { addActivity } from "@/lib/activity";

const PUMP_TRADE_URL = "https://pumpportal.fun/api/trade-local";

export type BondingCurveInfo = {
  mint: string;
  progressPercent: number; // 0 to 100
  marketCapSol: number;
  solInCurve: number;
  raydiumTargetSol: number; // 85 SOL default pump.fun target
  kingOfTheHill: boolean;
};

export type TradeResult = {
  success: boolean;
  signature?: string;
  error?: string;
};

export type SubWalletDumpResult = {
  walletLabel: string;
  walletPubKey: string;
  success: boolean;
  signature?: string;
  error?: string;
};

// Tek cüzdanla alım işlemi (Ana cüzdan veya Hot Wallet)
export async function executePumpBuy(
  connection: Connection,
  payerPubKey: string,
  signTx: (tx: VersionedTransaction) => Promise<VersionedTransaction>,
  mintAddress: string,
  amountSol: number,
  slippage = 15,
  priorityFee = 0.0005
): Promise<TradeResult> {
  try {
    const res = await fetch(PUMP_TRADE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: payerPubKey,
        action: "buy",
        mint: mintAddress,
        denominatedInSol: "true",
        amount: amountSol,
        slippage,
        priorityFee,
        pool: "pump",
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Alım API hatası: ${errText.slice(0, 100)}`);
    }

    const txBytes = new Uint8Array(await res.arrayBuffer());
    const tx = VersionedTransaction.deserialize(txBytes);
    const signed = await signTx(tx);

    const sig = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    addActivity({
      type: "buy",
      mint: mintAddress,
      signature: sig,
      label: `Pump.fun Hızlı Alım: ${amountSol} SOL`,
    });

    return { success: true, signature: sig };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Tek cüzdanla satış işlemi (% cinsinden veya adet)
export async function executePumpSell(
  connection: Connection,
  payerPubKey: string,
  signTx: (tx: VersionedTransaction) => Promise<VersionedTransaction>,
  mintAddress: string,
  amountPercentOrTokens: number | string, // "%100" veya sayı
  slippage = 15,
  priorityFee = 0.0005
): Promise<TradeResult> {
  try {
    const isPercent = String(amountPercentOrTokens).endsWith("%");
    const amountVal = isPercent
      ? String(amountPercentOrTokens)
      : Number(amountPercentOrTokens);

    const res = await fetch(PUMP_TRADE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: payerPubKey,
        action: "sell",
        mint: mintAddress,
        denominatedInSol: "false",
        amount: amountVal,
        slippage,
        priorityFee,
        pool: "pump",
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Satış API hatası: ${errText.slice(0, 100)}`);
    }

    const txBytes = new Uint8Array(await res.arrayBuffer());
    const tx = VersionedTransaction.deserialize(txBytes);
    const signed = await signTx(tx);

    const sig = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    addActivity({
      type: "sell",
      mint: mintAddress,
      signature: sig,
      label: `Pump.fun Hızlı Satış: ${amountPercentOrTokens}`,
    });

    return { success: true, signature: sig };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ⚡ TÜM ALT CÜZDANLARDAN TOPLU SATIŞ (SUB-WALLET DUMP & PROFIT-TAKE)
export async function executeSubWalletBatchSell(
  connection: Connection,
  mintAddress: string,
  wallets: SubWallet[],
  sellPercentage = "100%",
  priorityFee = 0.001,
  onProgress?: (msg: string) => void
): Promise<{ results: SubWalletDumpResult[]; successCount: number }> {
  if (wallets.length === 0) {
    return { results: [], successCount: 0 };
  }

  onProgress?.(`${wallets.length} alt cüzdan için toplu satış hazırlanıyor…`);

  const dumpPromises = wallets.map(async (w): Promise<SubWalletDumpResult> => {
    try {
      const res = await fetch(PUMP_TRADE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: w.publicKey,
          action: "sell",
          mint: mintAddress,
          denominatedInSol: "false",
          amount: sellPercentage,
          slippage: 30, // Hızlı çıkış için yüksek tolerans
          priorityFee,
          pool: "pump",
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText.slice(0, 80));
      }

      const txBytes = new Uint8Array(await res.arrayBuffer());
      const tx = VersionedTransaction.deserialize(txBytes);

      // Kendi özel anahtarıyla sessizce imzala
      tx.sign([w.keypair]);

      const sig = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
        maxRetries: 3,
      });

      return {
        walletLabel: w.label,
        walletPubKey: w.publicKey,
        signature: sig,
        success: true,
      };
    } catch (err) {
      return {
        walletLabel: w.label,
        walletPubKey: w.publicKey,
        error: err instanceof Error ? err.message : String(err),
        success: false,
      };
    }
  });

  const results = await Promise.all(dumpPromises);
  const successCount = results.filter((r) => r.success).length;

  if (successCount > 0) {
    addActivity({
      type: "sell",
      mint: mintAddress,
      signature: results.find((r) => r.success)?.signature || "",
      label: `[Toplu Çıkış] ${successCount} alt cüzdandan %${sellPercentage} satış yapıldı`,
    });
  }

  return { results, successCount };
}
