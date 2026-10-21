"use client";

import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  SubWallet,
  batchFundSubWallets,
  clearAllSubWallets,
  generateSubWallets,
  loadSubWallets,
  refreshSubWalletBalances,
  sweepAllSubWallets,
} from "@/lib/multiWallet";
import { buttonClass, ghostButtonClass, inputClass, shorten } from "@/components/ui";

export default function MultiWalletManager() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [wallets, setWallets] = useState<SubWallet[]>([]);
  const [fundAmount, setFundAmount] = useState("0.05");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const list = loadSubWallets();
    setWallets(list);
    if (list.length > 0) {
      refreshSubWalletBalances(connection, list).then(setWallets);
    }
  }, [connection]);

  // Toplam SOL bakiyesi
  const totalBalance = useMemo(() => {
    return wallets.reduce((acc, w) => acc + (w.balanceSol || 0), 0);
  }, [wallets]);

  function handleGenerate(count: number) {
    setError(null);
    setStatus(null);
    const updated = generateSubWallets(count);
    setWallets(updated);
    setStatus(`${count} adet yeni alt cüzdan başarıyla üretildi!`);
    refreshSubWalletBalances(connection, updated).then(setWallets);
  }

  function handleClear() {
    if (
      !window.confirm(
        "Tüm alt cüzdanlar silinecek. İçlerinde bakiye varsa anahtarları kaybolur. Emin misiniz?"
      )
    ) {
      return;
    }
    clearAllSubWallets();
    setWallets([]);
    setStatus("Tüm alt cüzdanlar temizlendi.");
  }

  async function handleRefresh() {
    if (wallets.length === 0) return;
    setBusy(true);
    try {
      const refreshed = await refreshSubWalletBalances(connection, wallets);
      setWallets(refreshed);
      setStatus("Bakiyeler güncellendi.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBatchFund() {
    if (!publicKey || !sendTransaction) {
      return setError("Lütfen önce ana cüzdanınızı (Phantom) bağlayın.");
    }
    if (wallets.length === 0) {
      return setError("Lütfen önce alt cüzdan üretin.");
    }
    const amt = Number(fundAmount) || 0;
    if (amt <= 0) {
      return setError("Lütfen geçerli bir SOL miktarı girin.");
    }

    setBusy(true);
    setError(null);
    setStatus("Toplu transfer işlemi hazırlanıyor, Phantom'da onaylayın…");

    try {
      const res = await batchFundSubWallets(
        connection,
        publicKey,
        sendTransaction,
        wallets,
        amt
      );
      setStatus(`Başarılı! ${wallets.length} cüzdana toplam ${res.totalFunded} SOL aktarıldı.`);
      await refreshSubWalletBalances(connection, wallets).then(setWallets);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(/reject/i.test(msg) ? "Phantom'da transferi reddettiniz." : msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleSweepAll() {
    if (!publicKey) {
      return setError("Bakiyelerin toplanacağı ana cüzdanı (Phantom) bağlayın.");
    }
    if (wallets.length === 0) {
      return setError("Aktarılacak alt cüzdan bulunamadı.");
    }

    setBusy(true);
    setError(null);
    setStatus("Alt cüzdan bakiyeleri ana cüzdana süpürülüyor…");

    try {
      const res = await sweepAllSubWallets(
        connection,
        publicKey,
        wallets,
        (curr, total) => {
          setStatus(`Süpürülüyor: ${curr} / ${total} cüzdan…`);
        }
      );
      setStatus(
        `Tamamlandı! ${res.successCount} cüzdandan toplam ~${res.totalSwept.toFixed(
          4
        )} SOL ana cüzdanınıza çekildi.`
      );
      await refreshSubWalletBalances(connection, wallets).then(setWallets);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function copyAddress(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function toggleSecret(id: string) {
    setRevealedSecrets((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="w-full space-y-4 rounded-sm border border-[#1A1F26] bg-[#0c0e12] p-4 text-left font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1A1F26] pb-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#00E5FF] animate-ping" />
          <h2 className="text-xs font-bold text-white tracking-tight uppercase">PRO MULTI-WALLET & FUNDER CONTROLLER</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-slate-400 bg-[#090A0C] px-1.5 py-0.5 rounded-sm border border-[#1A1F26]">
            CÜZDANLAR: <strong className="text-white">{wallets.length}</strong>
          </span>
          <span className="text-[9px] text-slate-400 bg-[#090A0C] px-1.5 py-0.5 rounded-sm border border-[#1A1F26]">
            TOPLAM: <strong className="text-[#00FFA3]">{totalBalance.toFixed(3)} SOL</strong>
          </span>
        </div>
      </div>

      {/* Kontrol & Hızlı Üretim Butonları */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-[#1A1F26] bg-[#090A0C] p-2.5">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => handleGenerate(5)}
            disabled={busy}
            className="rounded-sm border border-[#00E5FF]/50 bg-transparent text-[#00E5FF] hover:bg-[#00E5FF] hover:text-black px-2.5 py-1 text-[10px] font-bold transition disabled:opacity-50"
          >
            + 5 Alt Cüzdan
          </button>
          <button
            onClick={() => handleGenerate(10)}
            disabled={busy}
            className="rounded-sm border border-[#00FFA3]/50 bg-transparent text-[#00FFA3] hover:bg-[#00FFA3] hover:text-black px-2.5 py-1 text-[10px] font-bold transition disabled:opacity-50"
          >
            + 10 Alt Cüzdan
          </button>
          <button
            onClick={handleRefresh}
            disabled={busy}
            className={ghostButtonClass}
          >
            🔄 Yenile
          </button>
        </div>

        {wallets.length > 0 && (
          <button
            onClick={handleClear}
            disabled={busy}
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition"
          >
            Tümünü Sil
          </button>
        )}
      </div>

      {/* Çift Panelli Funder & Sweeper İstasyonu */}
      {wallets.length > 0 && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* 1. Batch Funder Paneli */}
          <div className="rounded-xl border border-border bg-panel p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-mist flex items-center gap-1.5">
                <span>⚡</span> TOPLU FONLAYICI (BATCH FUNDER)
              </span>
              <span className="text-[10px] font-mono text-signal bg-signal/10 px-2 py-0.5 rounded border border-signal/20">
                1-ONAY
              </span>
            </div>

            <p className="text-xs text-dim">
              Ana cüzdanınızdan (Phantom) tek bir işlemle tüm alt cüzdanlara aynı anda SOL transferi yapın:
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted block mb-1">
                  CÜZDAN BAŞINA MİKTAR (SOL)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className={inputClass}
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                />
              </div>

              <div className="rounded-lg border border-border bg-ink/60 p-3 text-xs font-mono flex justify-between">
                <span className="text-muted">TOPLAM ÇEKİLECEK:</span>
                <span className="text-mist font-bold">
                  {(wallets.length * (Number(fundAmount) || 0)).toFixed(3)} SOL
                </span>
              </div>

              <button
                onClick={handleBatchFund}
                disabled={busy}
                className={buttonClass}
              >
                {busy ? "İşleniyor…" : `⚡ ${wallets.length} Cüzdana SOL Dağıt`}
              </button>
            </div>
          </div>

          {/* 2. Sweeper Paneli */}
          <div className="rounded-xl border border-border bg-panel p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-mist flex items-center gap-1.5">
                <span>🔄</span> TEK TIKLA SÜPÜRME (SWEEPER)
              </span>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                0-POPUP
              </span>
            </div>

            <p className="text-xs text-dim">
              İşlemleriniz tamamlandığında, tüm alt cüzdanlardaki kalan SOL bakiyelerini 
              otomatik olarak ana cüzdanınıza (Phantom) geri aktarır:
            </p>

            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-ink/60 p-3 text-xs font-mono flex justify-between">
                <span className="text-muted">SÜPÜRÜLEBİLİR TOPLAM:</span>
                <span className="text-cyan-400 font-bold text-sm">
                  ~{totalBalance.toFixed(3)} SOL
                </span>
              </div>

              <button
                onClick={handleSweepAll}
                disabled={busy || totalBalance <= 0}
                className="h-11 w-full rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 font-bold text-ink text-sm shadow-glow-cyan transition hover:brightness-105 active:scale-[0.99] disabled:opacity-50"
              >
                {busy ? "Süpürülüyor…" : "🔄 Tüm Bakiyeleri Ana Cüzdana Çek"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Durum / Hata Bildirimleri */}
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

      {/* Cüzdan Listesi Tablosu */}
      {wallets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-ink/40 p-12 text-center space-y-3">
          <span className="text-4xl block">💼</span>
          <h3 className="text-base font-bold text-mist">Henüz Alt Cüzdan Bulunmuyor</h3>
          <p className="text-xs text-dim max-w-md mx-auto">
            Yukarıdaki butonları kullanarak 5 veya 10 adet alt cüzdan üretebilir, ana cüzdanınızdan tek onayla fonlayabilirsiniz.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-panel overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border bg-card/40 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">
              KAYITLI ALT CÜZDAN LİSTESİ ({wallets.length})
            </span>
            <span className="text-[11px] font-mono text-dim">
              Local Encrypted Storage
            </span>
          </div>

          <div className="divide-y divide-border/60 overflow-x-auto">
            {wallets.map((w, idx) => {
              const isRevealed = !!revealedSecrets[w.id];
              return (
                <div
                  key={w.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-card/30 transition text-xs"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-muted text-[11px]">#{idx + 1}</span>
                      <span className="font-bold text-mist">{w.label}</span>
                      <a
                        href={`https://explorer.solana.com/address/${w.publicKey}?cluster=devnet`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-signal hover:underline font-mono"
                      >
                        Explorer ↗
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-[11px] text-dim bg-ink/70 px-2 py-0.5 rounded border border-border/80">
                        {shorten(w.publicKey)}
                      </code>
                      <button
                        onClick={() => copyAddress(w.id, w.publicKey)}
                        className="text-[10px] text-muted hover:text-mist"
                      >
                        {copiedId === w.id ? "✓" : "Kopyala"}
                      </button>
                    </div>

                    {isRevealed && (
                      <div className="mt-2 p-2 bg-red-950/20 border border-red-500/20 rounded text-[10px] font-mono break-all text-red-300">
                        {JSON.stringify(Array.from(w.keypair.secretKey))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                    <div className="text-right">
                      <span className="text-[10px] text-muted block">BAKİYE</span>
                      <span className="font-mono font-bold text-mist text-sm">
                        {w.balanceSol !== null ? w.balanceSol.toFixed(4) : "—"} SOL
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleSecret(w.id)}
                      className="text-[10px] text-dim hover:text-mist underline"
                    >
                      {isRevealed ? "Gizle" : "Anahtar"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
