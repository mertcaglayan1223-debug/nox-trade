import {
  Connection,
  VersionedTransaction,
} from "@solana/web3.js";
import { SubWallet, loadSubWallets } from "@/lib/multiWallet";
import { addActivity } from "@/lib/activity";

const PUMP_TRADE_URL = "https://pumpportal.fun/api/trade-local";

export type BundleBuyResult = {
  walletLabel: string;
  walletPubKey: string;
  signature?: string;
  error?: string;
  success: boolean;
};

// Alt cüzdanlar için Pump.fun üzerinden eşzamanlı toplu alım gerçekleştirir
export async function executeSubWalletBundleBuys(
  connection: Connection,
  mintAddress: string,
  wallets: SubWallet[],
  buyAmountSol: number,
  priorityFee = 0.001,
  onProgress?: (msg: string) => void
): Promise<{ results: BundleBuyResult[]; totalSuccess: number; totalSolSpent: number }> {
  // Yalnızca yeterli bakiyesi olan cüzdanları filtrele
  const eligibleWallets = wallets.filter((w) => (w.balanceSol || 0) >= buyAmountSol + 0.002);

  if (eligibleWallets.length === 0) {
    onProgress?.("Yeterli bakiyeye sahip alt cüzdan bulunamadı. Bundle alımı atlanıyor.");
    return { results: [], totalSuccess: 0, totalSolSpent: 0 };
  }

  onProgress?.(`${eligibleWallets.length} alt cüzdan için alım işlemleri hazırlanıyor…`);

  // Her cüzdan için paralel alım işlemi oluştur ve imzala
  const buyPromises = eligibleWallets.map(async (wallet): Promise<BundleBuyResult> => {
    try {
      const reqBody = {
        publicKey: wallet.publicKey,
        action: "buy",
        mint: mintAddress,
        denominatedInSol: "true",
        amount: buyAmountSol,
        slippage: 25, // İlk blok dalgalanmalarına karşı esnek slippage
        priorityFee: priorityFee,
        pool: "pump",
      };

      const res = await fetch(PUMP_TRADE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Pumpportal API hatası: ${errText.slice(0, 100)}`);
      }

      const txBytes = new Uint8Array(await res.arrayBuffer());
      const tx = VersionedTransaction.deserialize(txBytes);

      // Alt cüzdan kendi anahtarıyla hafızada otomatik imzalar (Phantom popup açılmaz)
      tx.sign([wallet.keypair]);

      const rawTx = tx.serialize();
      const sig = await connection.sendRawTransaction(rawTx, {
        skipPreflight: true, // Hız için preflight atlanır (Bundle tarzı)
        maxRetries: 3,
      });

      return {
        walletLabel: wallet.label,
        walletPubKey: wallet.publicKey,
        signature: sig,
        success: true,
      };
    } catch (err) {
      return {
        walletLabel: wallet.label,
        walletPubKey: wallet.publicKey,
        error: err instanceof Error ? err.message : String(err),
        success: false,
      };
    }
  });

  // Tüm cüzdanlardan aynı anda Solana ağına ateşle!
  const results = await Promise.all(buyPromises);
  const successList = results.filter((r) => r.success);

  // İşlem geçmişine kaydet
  if (successList.length > 0) {
    addActivity({
      type: "launch",
      mint: mintAddress,
      signature: successList[0].signature || "",
      label: `[Bundle] ${successList.length} alt cüzdandan toplam ${(
        successList.length * buyAmountSol
      ).toFixed(3)} SOL alım yapıldı`,
    });
  }

  return {
    results,
    totalSuccess: successList.length,
    totalSolSpent: successList.length * buyAmountSol,
  };
}
