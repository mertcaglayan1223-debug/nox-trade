import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  AuthorityType,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createBurnInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import { createMetadataInstruction } from "@/lib/metadata";

export type LaunchParams = {
  connection: Connection;
  payer: Keypair; // hızlı cüzdan (hem ücreti öder hem token sahibi olur)
  name: string;
  symbol: string;
  description: string;
  website: string;
  twitter: string;
  telegram: string;
  image: File;
  supply: string;
  decimals: number;
  burnPercent: number;
  revokeMint: boolean;
  revokeFreeze: boolean;
  immutable: boolean;
};

const MIN_SOL = 0.02;
const MAX_SUPPLY = 1000000000000;
const U64_MAX = BigInt("18446744073709551615");

export async function launchWithKeypair(
  p: LaunchParams,
  onStatus: (status: string) => void
): Promise<{ mint: string; signature: string }> {
  const name = p.name.trim();
  const symbol = p.symbol.trim().toUpperCase();
  if (!name || name.length > 32) {
    throw new Error("İsim 1 ile 32 karakter arasında olmalı.");
  }
  if (!symbol || symbol.length > 10) {
    throw new Error("Sembol 1 ile 10 karakter arasında olmalı.");
  }
  if (!/^\d+$/.test(p.supply) || Number(p.supply) < 1 || Number(p.supply) > MAX_SUPPLY) {
    throw new Error("Arz 1 ile 1.000.000.000.000 arasında bir tam sayı olmalı.");
  }
  if (p.decimals !== 6 && p.decimals !== 9) {
    throw new Error("Ondalık sayısı 6 ya da 9 olmalı.");
  }
  const unit = BigInt(10) ** BigInt(p.decimals);
  if (BigInt(p.supply) * unit > U64_MAX) {
    throw new Error("Bu arz, seçilen ondalıkla çok büyük.");
  }
  if (!Number.isInteger(p.burnPercent) || p.burnPercent < 0 || p.burnPercent > 99) {
    throw new Error("Yakılacak oran 0 ile 99 arasında olmalı.");
  }

  const payerKey = p.payer.publicKey;
  const balance = await p.connection.getBalance(payerKey);
  if (balance / LAMPORTS_PER_SOL < MIN_SOL) {
    throw new Error(
      `Hızlı cüzdanda yetersiz devnet SOL. En az ${MIN_SOL} SOL gerekiyor, şu an ${(
        balance / LAMPORTS_PER_SOL
      ).toFixed(4)} SOL var.`
    );
  }

  // 1) Görsel ve metadata'yı IPFS'e yükle
  onStatus("Görsel ve bilgiler IPFS'e yükleniyor…");
  const fd = new FormData();
  fd.append("image", p.image);
  fd.append("name", name);
  fd.append("symbol", symbol);
  fd.append("description", p.description);
  fd.append("website", p.website);
  fd.append("twitter", p.twitter);
  fd.append("telegram", p.telegram);
  const upload = await fetch("/api/upload", { method: "POST", body: fd });
  const uploadJson = await upload.json().catch(() => ({}));
  if (!upload.ok || !uploadJson.uri) {
    throw new Error(uploadJson.error || "Yükleme başarısız oldu.");
  }

  // 2) İşlemi hazırla
  onStatus("İşlem hazırlanıyor…");
  const mintKeypair = Keypair.generate();
  const rent = await getMinimumBalanceForRentExemptMint(p.connection);
  const ata = getAssociatedTokenAddressSync(mintKeypair.publicKey, payerKey);
  const amount = BigInt(p.supply) * unit;
  const burnAmount = (amount * BigInt(p.burnPercent)) / BigInt(100);

  const tx = new Transaction();
  tx.add(
    SystemProgram.createAccount({
      fromPubkey: payerKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: MINT_SIZE,
      lamports: rent,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(
      mintKeypair.publicKey,
      p.decimals,
      payerKey,
      p.revokeFreeze ? null : payerKey,
      TOKEN_PROGRAM_ID
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      payerKey,
      ata,
      payerKey,
      mintKeypair.publicKey
    ),
    createMetadataInstruction({
      mint: mintKeypair.publicKey,
      mintAuthority: payerKey,
      payer: payerKey,
      updateAuthority: payerKey,
      name,
      symbol,
      uri: uploadJson.uri,
      isMutable: !p.immutable,
    }),
    createMintToInstruction(mintKeypair.publicKey, ata, payerKey, amount)
  );
  if (burnAmount > BigInt(0)) {
    tx.add(
      createBurnInstruction(ata, mintKeypair.publicKey, payerKey, burnAmount)
    );
  }
  if (p.revokeMint) {
    tx.add(
      createSetAuthorityInstruction(
        mintKeypair.publicKey,
        payerKey,
        AuthorityType.MintTokens,
        null
      )
    );
  }

  const { blockhash, lastValidBlockHeight } =
    await p.connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payerKey;
  tx.sign(p.payer, mintKeypair);

  // 3) Gönder ve onayla (Phantom penceresi yok, hızlı cüzdan imzaladı)
  onStatus("İşlem gönderiliyor…");
  const signature = await p.connection.sendRawTransaction(tx.serialize());
  onStatus("Zincirde onaylanıyor…");
  const confirmation = await p.connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  if (confirmation.value.err) {
    throw new Error("İşlem zincirde başarısız oldu.");
  }
  return { mint: mintKeypair.publicKey.toBase58(), signature };
}
