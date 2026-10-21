"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction } from "@solana/web3.js";
import { createHotWallet, deleteHotWallet, loadHotWallet } from "@/lib/hotWallet";
import { buttonClass, ghostButtonClass, shorten } from "@/components/ui";

export default function HotWalletStation() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [hot, setHot] = useState<Keypair | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHot(loadHotWallet());
  }, []);

  useEffect(() => {
    if (!hot) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    connection.getBalance(hot.publicKey).then((lamports) => {
      if (!cancelled) setBalance(lamports / LAMPORTS_PER_SOL);
    }).catch(() => {
      if (!cancelled) setBalance(null);
    });
    return () => {
      cancelled = true;
    };
  }, [connection, hot, busy]);

  function handleCreate() {
    setError(null);
    setStatus(null);
    const nw = createHotWallet();
    setHot(nw);
    setStatus("Yeni hızlı cüzdan oluşturuldu ve tarayıcınıza kaydedildi.");
  }

  function handleDelete() {
    if (!window.confirm("Hızlı cüzdan silinecek. İçinde bakiye varsa erişiminizi kaybedersiniz. Devam edilsin mi?")) {
      return;
    }
    deleteHotWallet();
    setHot(null);
    setBalance(null);
    setStatus("Hızlı cüzdan başarıyla silindi.");
  }

  async function handleAirdrop() {
    if (!hot || busy) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const sig = await connection.requestAirdrop(hot.publicKey, LAMPORTS_PER_SOL);
      const bh = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
      setStatus("1 Devnet SOL başarıyla aktarıldı!");
    } catch {
      setError("Devnet airdrop limiti dolmuş olabilir. Lütfen cüzdan adresinize faucet.solana.com üzerinden SOL gönderin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleFundFromPhantom() {
    if (!hot || !publicKey || busy) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: hot.publicKey,
          lamports: Math.round(0.1 * LAMPORTS_PER_SOL),
        })
      );
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      setStatus("Phantom'dan hızlı cüzdana 0.1 SOL başarıyla aktarıldı.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(/reject/i.test(msg) ? "Cüzdanda transfer işlemini reddettiniz." : msg);
    } finally {
      setBusy(false);
    }
  }

  function copyAddress() {
    if (!hot) return;
    navigator.clipboard.writeText(hot.publicKey.toBase58());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="w-full space-y-6 rounded-xl border border-border bg-panel p-6 text-left">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="rounded bg-violet-500/20 px-2.5 py-0.5 text-xs font-bold text-violet-400">
            HIZLI İŞLEM İSTASYONU
          </span>
          <h2 className="text-2xl font-bold">⚡ Hızlı Hot Wallet İstasyonu</h2>
        </div>
        <p className="text-sm text-dim leading-relaxed">
          Token çıkarırken her işlemde Phantom cüzdan açılır penceresini beklemek istemiyorsanız, 
          tarayıcıda saklanan bir <strong>Hot Wallet</strong> kullanabilirsiniz. Tek tıkla anında imzalama 
          ve deploy sağlar.
        </p>
      </div>

      {!hot ? (
        <div className="rounded-xl border border-dashed border-border bg-ink/40 p-8 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-signal/15 text-2xl">
            ⚡
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-mist">Aktif Hızlı Cüzdan Bulunmuyor</h3>
            <p className="text-sm text-dim max-w-md mx-auto">
              Birkaç saniyede yeni bir geçici cüzdan oluşturabilir ve Devnet SOL yükleyerek lansman yapabilirsiniz.
            </p>
          </div>
          <button
            onClick={handleCreate}
            className="rounded-lg bg-signal px-6 py-2.5 font-bold text-ink text-sm shadow-glow-sm hover:brightness-110 transition"
          >
            + Yeni Hızlı Cüzdan Oluştur
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Cüzdan Kartı */}
          <div className="rounded-xl border border-border bg-card/60 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">
                HIZLI CÜZDAN DETAYLARI
              </span>
              <span className="rounded bg-signal/15 px-2 py-0.5 text-[11px] font-mono font-bold text-signal border border-signal/20">
                AKTİF
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted mb-1">CÜZDAN ADRESİ (PUBLIC KEY)</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono text-mist bg-ink/70 px-2.5 py-1.5 rounded border border-border truncate flex-1">
                    {hot.publicKey.toBase58()}
                  </code>
                  <button
                    onClick={copyAddress}
                    className="rounded border border-border bg-ink px-2.5 py-1.5 text-xs text-dim hover:text-signal transition"
                  >
                    {copied ? "✓ Kopyalandı" : "Kopyala"}
                  </button>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted mb-1">DEVNET BAKİYESİ</p>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-black text-signal">
                    {balance !== null ? balance.toFixed(4) : "—"}
                  </span>
                  <span className="font-mono text-xs text-muted">SOL</span>
                </div>
              </div>
            </div>

            {/* Gizli Anahtar Görüntüleme */}
            <div className="pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="text-xs text-dim hover:text-mist underline"
              >
                {showSecret ? "Gizli Anahtarı Gizle" : "⚠️ Gizli Anahtarı (Private Key) Göster"}
              </button>
              {showSecret && (
                <div className="mt-2 p-3 bg-red-950/20 border border-red-500/30 rounded text-xs font-mono break-all text-red-300">
                  {JSON.stringify(Array.from(hot.secretKey))}
                </div>
              )}
            </div>
          </div>

          {/* Fonlama Butonları */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleAirdrop}
              disabled={busy}
              className="rounded-lg bg-signal/15 border border-signal/40 px-4 py-2.5 text-xs font-bold text-signal hover:bg-signal/25 transition disabled:opacity-50"
            >
              {busy ? "İşleniyor…" : "🪂 1 Devnet SOL Airdrop İste"}
            </button>

            {publicKey && (
              <button
                onClick={handleFundFromPhantom}
                disabled={busy}
                className="rounded-lg border border-border bg-card px-4 py-2.5 text-xs font-semibold text-mist hover:border-signal/50 transition disabled:opacity-50"
              >
                Phantom&apos;dan 0.1 SOL Aktar
              </button>
            )}

            <button
              onClick={handleDelete}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition ml-auto"
            >
              Cüzdanı Sil
            </button>
          </div>

          {status && (
            <p className="text-xs text-signal font-semibold bg-signal/10 p-3 rounded border border-signal/30">
              ✓ {status}
            </p>
          )}

          {error && (
            <p className="text-xs text-red-400 font-semibold bg-red-500/10 p-3 rounded border border-red-500/30">
              ⚠️ {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
