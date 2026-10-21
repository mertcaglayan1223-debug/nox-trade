import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  VersionedTransaction,
} from "@solana/web3.js";
import { addActivity } from "@/lib/activity";

const PUMP_TRADE_URL = "https://pumpportal.fun/api/trade-local";

export type PumpLaunchParams = {
  connection: Connection;
  payerPublicKey: string; // Base58 wallet public key
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  mintKeypair?: Keypair;
  name: string;
  symbol: string;
  description: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  image: File;
  devBuySol: number;
  priorityFee?: number;
  onStatus: (status: string) => void;
};

export async function launchOnPump(
  p: PumpLaunchParams
): Promise<{ mint: string; signature: string }> {
  const name = p.name.trim();
  const symbol = p.symbol.trim().toUpperCase();
  if (!name || name.length > 32) throw new Error("İsim 1-32 karakter olmalıdır.");
  if (!symbol || symbol.length > 10) throw new Error("Sembol 1-10 karakter olmalıdır.");

  // 1) Görsel ve metadata'yı IPFS'e yükle
  p.onStatus("Görsel ve bilgiler IPFS'e yükleniyor…");
  const fd = new FormData();
  fd.append("image", p.image);
  fd.append("name", name);
  fd.append("symbol", symbol);
  fd.append("description", p.description || "");
  fd.append("website", p.website || "");
  fd.append("twitter", p.twitter || "");
  fd.append("telegram", p.telegram || "");

  const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
  const uploadJson = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok || !uploadJson.uri) {
    throw new Error(uploadJson.error || "IPFS yüklemesi başarısız oldu.");
  }
  const metadataUri = uploadJson.uri;

  // 2) Mint Keypair üret
  const mintKeypair = p.mintKeypair || Keypair.generate();
  const mintAddress = mintKeypair.publicKey.toBase58();

  p.onStatus("Pump.fun bonding curve işlemi oluşturuluyor…");
  const reqBody = {
    publicKey: p.payerPublicKey,
    action: "create",
    tokenMetadata: {
      name,
      symbol,
      uri: metadataUri,
    },
    mint: mintAddress,
    denominatedInSol: "true",
    amount: p.devBuySol > 0 ? p.devBuySol : 0,
    slippage: 15,
    priorityFee: p.priorityFee || 0.0005,
    pool: "pump",
  };

  const tradeRes = await fetch(PUMP_TRADE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reqBody),
  });

  if (!tradeRes.ok) {
    const errText = await tradeRes.text();
    throw new Error(`Pump.fun API hatası (${tradeRes.status}): ${errText.slice(0, 200)}`);
  }

  const txBytes = new Uint8Array(await tradeRes.arrayBuffer());
  const tx = VersionedTransaction.deserialize(txBytes);

  // 3) Mint anahtarıyla ilk imzayı at
  tx.sign([mintKeypair]);

  // 4) Kullanıcı cüzdanıyla imzala
  p.onStatus("Cüzdanınızda işlemi onaylayın…");
  const signedTx = await p.signTransaction(tx);

  // 5) Zincire gönder ve bekle
  p.onStatus("İşlem Solana ağına iletiliyor…");
  const rawTx = signedTx.serialize();
  const signature = await p.connection.sendRawTransaction(rawTx, {
    skipPreflight: false,
    maxRetries: 3,
  });

  p.onStatus("İşlem onaylanıyor…");
  const latestBlockhash = await p.connection.getLatestBlockhash();
  const confirmation = await p.connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    "confirmed"
  );

  if (confirmation.value.err) {
    throw new Error("İşlem zincirde onaylanırken hata oluştu.");
  }

  // Geçmişe ekle
  addActivity({
    type: "launch",
    mint: mintAddress,
    signature,
    label: `[Pump.fun] ${name} (${symbol}) oluşturuldu`,
  });

  return { mint: mintAddress, signature };
}
