import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

const STORAGE_KEY = "proxima_sub_wallets_v1";

export type SubWalletData = {
  id: string;
  label: string;
  publicKey: string;
  secretKey: number[]; // Uint8Array as array
};

export type SubWallet = {
  id: string;
  label: string;
  publicKey: string;
  keypair: Keypair;
  balanceSol: number | null;
};

// 1. Cüzdanları tarayıcıdan oku
export function loadSubWallets(): SubWallet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: SubWalletData[] = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item, index) => {
      const keypair = Keypair.fromSecretKey(Uint8Array.from(item.secretKey));
      return {
        id: item.id || `wallet-${index + 1}`,
        label: item.label || `Alt Cüzdan #${index + 1}`,
        publicKey: keypair.publicKey.toBase58(),
        keypair,
        balanceSol: null,
      };
    });
  } catch {
    return [];
  }
}

// 2. Yeni alt cüzdanlar üret
export function generateSubWallets(count: number): SubWallet[] {
  const existing = loadSubWallets();
  const nextWallets: SubWallet[] = [...existing];

  for (let i = 0; i < count; i++) {
    const num = nextWallets.length + 1;
    const kp = Keypair.generate();
    nextWallets.push({
      id: `wallet-${Date.now()}-${i}`,
      label: `Alt Cüzdan #${num}`,
      publicKey: kp.publicKey.toBase58(),
      keypair: kp,
      balanceSol: null,
    });
  }

  saveSubWallets(nextWallets);
  return nextWallets;
}

// 3. Cüzdanları tarayıcıya kaydet
export function saveSubWallets(wallets: SubWallet[]) {
  try {
    const data: SubWalletData[] = wallets.map((w) => ({
      id: w.id,
      label: w.label,
      publicKey: w.publicKey,
      secretKey: Array.from(w.keypair.secretKey),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

// 4. Tüm alt cüzdanları sil
export function clearAllSubWallets() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

// 5. Alt cüzdan bakiyelerini güncelle
export async function refreshSubWalletBalances(
  connection: Connection,
  wallets: SubWallet[]
): Promise<SubWallet[]> {
  const updated: SubWallet[] = [];
  for (const w of wallets) {
    try {
      const lamports = await connection.getBalance(w.keypair.publicKey);
      updated.push({ ...w, balanceSol: lamports / LAMPORTS_PER_SOL });
    } catch {
      updated.push({ ...w, balanceSol: null });
    }
  }
  return updated;
}

// 6. Toplu Fonlayıcı (Batch Funder): Ana cüzdandan TEK BİR Phantom onayıyla tüm cüzdanlara SOL dağıtır
export async function batchFundSubWallets(
  connection: Connection,
  payerPublicKey: PublicKey,
  sendTransaction: (tx: Transaction, connection: Connection) => Promise<string>,
  targets: SubWallet[],
  amountPerWalletSol: number
): Promise<{ signature: string; totalFunded: number }> {
  if (targets.length === 0) throw new Error("Fonlanacak alt cüzdan bulunamadı.");
  if (amountPerWalletSol <= 0) throw new Error("Cüzdan başı miktar 0'dan büyük olmalıdır.");

  const lamportsPerWallet = Math.round(amountPerWalletSol * LAMPORTS_PER_SOL);
  const tx = new Transaction();

  for (const w of targets) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: payerPublicKey,
        toPubkey: w.keypair.publicKey,
        lamports: lamportsPerWallet,
      })
    );
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payerPublicKey;

  const signature = await sendTransaction(tx, connection);
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed"
  );

  return {
    signature,
    totalFunded: amountPerWalletSol * targets.length,
  };
}

// 7. Tek Tıkla Süpürme (Sweeper): Alt cüzdanlardaki kalan tüm SOL'ları ana cüzdana çeker
export async function sweepAllSubWallets(
  connection: Connection,
  targetPublicKey: PublicKey,
  wallets: SubWallet[],
  onProgress?: (index: number, total: number) => void
): Promise<{ totalSwept: number; successCount: number }> {
  let totalSwept = 0;
  let successCount = 0;
  const gasFeeLamports = 5000; // Standart transfer gas ücreti

  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    onProgress?.(i + 1, wallets.length);

    try {
      const lamports = await connection.getBalance(w.keypair.publicKey);
      const transferable = lamports - gasFeeLamports;

      if (transferable > 0) {
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: w.keypair.publicKey,
            toPubkey: targetPublicKey,
            lamports: transferable,
          })
        );

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = w.keypair.publicKey;
        tx.sign(w.keypair);

        const rawTx = tx.serialize();
        const sig = await connection.sendRawTransaction(rawTx);
        await connection.confirmTransaction(
          { signature: sig, blockhash, lastValidBlockHeight },
          "confirmed"
        );

        totalSwept += transferable / LAMPORTS_PER_SOL;
        successCount++;
      }
    } catch {
      // Hata alan cüzdanı atla, diğerlerine devam et
    }
  }

  return { totalSwept, successCount };
}
