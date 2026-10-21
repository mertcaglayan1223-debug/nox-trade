import { Keypair } from "@solana/web3.js";

// Hızlı cüzdan: anahtar bu tarayıcıda (localStorage) düz metin olarak saklanır.
// Bu yüzden yalnızca Devnet'te ve küçük bakiyeyle kullanılmalı.
const KEY = "hot-wallet-secret";

export function loadHotWallet(): Keypair | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== 64) return null;
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  } catch {
    return null;
  }
}

export function createHotWallet(): Keypair {
  const keypair = Keypair.generate();
  localStorage.setItem(KEY, JSON.stringify(Array.from(keypair.secretKey)));
  return keypair;
}

export function deleteHotWallet() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // sessizce geç
  }
}
