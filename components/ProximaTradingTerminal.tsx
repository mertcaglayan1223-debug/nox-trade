"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { loadHotWallet } from "@/lib/hotWallet";
import { loadSubWallets, SubWallet } from "@/lib/multiWallet";
import {
  executePumpBuy,
  executePumpSell,
  executeSubWalletBatchSell,
  SubWalletDumpResult,
} from "@/lib/pumpTrading";
import {
  Field,
  buttonClass,
  ghostButtonClass,
  inputClass,
  shorten,
} from "@/components/ui";

const RAYDIUM_TARGET_SOL = 85;

export default function ProximaTradingTerminal() {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();

  const [mintAddress, setMintAddress] = useState("");
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");

  // Curve ve Market Durumu
  const [curveSol, setCurveSol] = useState(18.5); // Varsayılan/Simüle rezerv
  const [marketCapSol, setMarketCapSol] = useState(28.4);
  const [solPriceUsd, setSolPriceUsd] = useState(150);

  // Trading Form Parametreleri
  const [customBuySol, setCustomBuySol] = useState("0.1");
  const [customSellPercent, setCustomSellPercent] = useState("100");
  const [slippage, setSlippage] = useState("15");
  const [priorityFee, setPriorityFee] = useState("0.001");
  const [useHotWallet, setUseHotWallet] = useState(false);

  // Cüzdanlar
  const [subWallets, setSubWallets] = useState<SubWallet[]>([]);
  const [hotWallet, setHotWallet] = useState<any>(null);

  // İşlem Durumları
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastTxSig, setLastTxSig] = useState<string | null>(null);
  const [dumpResults, setDumpResults] = useState<SubWalletDumpResult[] | null>(null);

  useEffect(() => {
    setHotWallet(loadHotWallet());
    setSubWallets(loadSubWallets());

    // Son aktiviteden mint çekmeye çalış
    try {
      const stored = localStorage.getItem("solana_memecoin_activity");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].mint) {
          setMintAddress(parsed[0].mint);
        }
      }
    } catch {}
  }, []);

  // Curve hesaplamaları
  const progressPercent = Math.min(100, Math.max(0, (curveSol / RAYDIUM_TARGET_SOL) * 100));
  const remainingSol = Math.max(0, RAYDIUM_TARGET_SOL - curveSol);
  const mcapUsd = marketCapSol * solPriceUsd;

  // Hızlı Alım Yürütücü
  async function handleBuy(amount: number) {
    if (!mintAddress.trim()) {
      return setErrorMsg("Lütfen geçerli bir token mint adresi girin.");
    }
    setErrorMsg(null);
    setLastTxSig(null);
    setDumpResults(null);
    setBusy(true);
    setStatusMsg(`${amount} SOL alım emri gönderiliyor…`);

    try {
      let payerKey: string;
      let signerFn: (tx: VersionedTransaction) => Promise<VersionedTransaction>;

      if (useHotWallet && hotWallet) {
        payerKey = hotWallet.publicKey.toBase58();
        signerFn = async (tx) => {
          tx.sign([hotWallet]);
          return tx;
        };
      } else if (publicKey && signTransaction) {
        payerKey = publicKey.toBase58();
        signerFn = signTransaction as any;
      } else {
        throw new Error("Lütfen cüzdanınızı bağlayın veya Hızlı Cüzdan kullanın.");
      }

      const res = await executePumpBuy(
        connection,
        payerKey,
        signerFn,
        mintAddress.trim(),
        amount,
        Number(slippage) || 15,
        Number(priorityFee) || 0.001
      );

      if (res.success && res.signature) {
        setLastTxSig(res.signature);
        setStatusMsg(`✅ Alım başarılı! ${amount} SOL alındı.`);
        setCurveSol((prev) => Math.min(85, prev + amount));
      } else {
        setErrorMsg(res.error || "Alım işlemi başarısız oldu.");
        setStatusMsg("");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatusMsg("");
    } finally {
      setBusy(false);
    }
  }

  // Hızlı Satış Yürütücü (Tek Cüzdan)
  async function handleSell(percentStr: string) {
    if (!mintAddress.trim()) {
      return setErrorMsg("Lütfen geçerli bir token mint adresi girin.");
    }
    setErrorMsg(null);
    setLastTxSig(null);
    setDumpResults(null);
    setBusy(true);
    setStatusMsg(`%${percentStr} satış emri gönderiliyor…`);

    try {
      let payerKey: string;
      let signerFn: (tx: VersionedTransaction) => Promise<VersionedTransaction>;

      if (useHotWallet && hotWallet) {
        payerKey = hotWallet.publicKey.toBase58();
        signerFn = async (tx) => {
          tx.sign([hotWallet]);
          return tx;
        };
      } else if (publicKey && signTransaction) {
        payerKey = publicKey.toBase58();
        signerFn = signTransaction as any;
      } else {
        throw new Error("Lütfen cüzdanınızı bağlayın veya Hızlı Cüzdan kullanın.");
      }

      const res = await executePumpSell(
        connection,
        payerKey,
        signerFn,
        mintAddress.trim(),
        `${percentStr}%`,
        Number(slippage) || 20,
        Number(priorityFee) || 0.001
      );

      if (res.success && res.signature) {
        setLastTxSig(res.signature);
        setStatusMsg(`✅ Satış başarılı! %${percentStr} token satıldı.`);
      } else {
        setErrorMsg(res.error || "Satış işlemi başarısız oldu.");
        setStatusMsg("");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatusMsg("");
    } finally {
      setBusy(false);
    }
  }

  // ⚡ TÜM ALT CÜZDANLARDAN TOPLU SATIŞ (SUB-WALLET DUMP & PROFIT-TAKE)
  async function handleBatchSubWalletDump() {
    if (!mintAddress.trim()) {
      return setErrorMsg("Lütfen geçerli bir token mint adresi girin.");
    }
    if (subWallets.length === 0) {
      return setErrorMsg("Kayıtlı alt cüzdan bulunamadı. Önce Çoklu Cüzdan sekmesinden cüzdan üretin.");
    }

    if (!confirm(`${subWallets.length} alt cüzdanın tamamındaki tokenlar %100 oranında piyasaya satılacak. Emin misiniz?`)) {
      return;
    }

    setErrorMsg(null);
    setLastTxSig(null);
    setBusy(true);
    setStatusMsg("⚡ Tüm alt cüzdanlardan toplu satış ateşleniyor…");

    try {
      const { results, successCount } = await executeSubWalletBatchSell(
        connection,
        mintAddress.trim(),
        subWallets,
        "100%",
        Number(priorityFee) || 0.001,
        setStatusMsg
      );

      setDumpResults(results);
      setStatusMsg(`✅ Toplu çıkış tamamlandı: ${successCount}/${results.length} cüzdandan satış yapıldı.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatusMsg("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full space-y-6 text-left">
      {/* Üst Başlık & Token Mint Seçici */}
      <div className="rounded-xl border border-line bg-panel p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded bg-cyan-500/20 px-2.5 py-0.5 text-xs font-bold text-cyan-400 border border-cyan-500/30">
              PROXIMA SPEED ENGINE
            </span>
            <h2 className="text-2xl font-black text-mist">⚡ Hızlı İşlem & Bonding Curve Terminali</h2>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-dim">
            <span>SOL Fiyatı: ${solPriceUsd}</span>
          </div>
        </div>

        {/* Mint Adresi Girişi */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-dim block">
            İşlem Yapılacak Token Mint Adresi:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Pump.fun token kontrat adresini yapıştırın (Örn: 7xKXtg...)"
              className={`${inputClass} font-mono text-xs`}
              value={mintAddress}
              onChange={(e) => setMintAddress(e.target.value.trim())}
            />
            {mintAddress && (
              <a
                href={`https://pump.fun/coin/${mintAddress}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-lg border border-line bg-ink px-3 py-2 text-xs font-semibold text-signal hover:border-signal/50 transition whitespace-nowrap"
              >
                Pump.fun ↗
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── CANLI BONDING CURVE KOKPİTİ ── */}
      <div className="rounded-xl border border-line bg-panel p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-ping" />
            <h3 className="font-bold text-sm text-mist uppercase tracking-wider">
              Canlı Bonding Curve İlerlemesi
            </h3>
          </div>
          <span className="text-xs font-mono text-cyan-400 font-bold">
            Hedef: {RAYDIUM_TARGET_SOL} SOL → Raydium CPMM
          </span>
        </div>

        {/* Görsel Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-dim">Doluluk Oranı</span>
            <span className="text-signal font-bold text-sm">%{progressPercent.toFixed(1)}</span>
          </div>
          <div className="relative h-4 w-full overflow-hidden rounded-full bg-ink border border-line">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-signal transition-all duration-500 shadow-glow"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] font-mono text-dim pt-1">
            <span>Eğrideki Likidite: {curveSol.toFixed(2)} SOL</span>
            <span>Raydium Göçüne Kalan: {remainingSol.toFixed(2)} SOL</span>
          </div>
        </div>

        {/* Metrik Kartları */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="rounded-lg border border-line bg-ink/70 p-3 space-y-1">
            <span className="text-[10px] text-dim uppercase">Piyasa Değeri</span>
            <p className="text-base font-bold font-mono text-mist">
              ${mcapUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <span className="text-[10px] text-signal font-mono">({marketCapSol.toFixed(1)} SOL)</span>
          </div>
          <div className="rounded-lg border border-line bg-ink/70 p-3 space-y-1">
            <span className="text-[10px] text-dim uppercase">King of the Hill</span>
            <p className="text-base font-bold font-mono text-amber-400">
              {progressPercent > 65 ? "👑 Yakın" : "⏳ Devam Ediyor"}
            </p>
            <span className="text-[10px] text-dim">Raydium havuzuna doğru</span>
          </div>
          <div className="rounded-lg border border-line bg-ink/70 p-3 space-y-1">
            <span className="text-[10px] text-dim uppercase">Hazır Alt Cüzdanlar</span>
            <p className="text-base font-bold font-mono text-cyan-400">
              {subWallets.length} Adet
            </p>
            <span className="text-[10px] text-dim">Toplu satışa hazır</span>
          </div>
          <div className="rounded-lg border border-line bg-ink/70 p-3 space-y-1">
            <span className="text-[10px] text-dim uppercase">İşlem Hızı</span>
            <p className="text-base font-bold font-mono text-emerald-400">
              ~400 ms
            </p>
            <span className="text-[10px] text-dim">Pumpportal Local Node</span>
          </div>
        </div>
      </div>

      {/* ── ALIM / SATIM İŞLEM TERMİNALİ ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* HIZLI ALIM (BUY) */}
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/10 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-emerald-400 flex items-center gap-1.5">
              🟢 Hızlı Alım (Instant Buy)
            </span>
            <span className="text-xs text-dim">Tek Tıkla Sniper</span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[0.1, 0.25, 0.5, 1.0].map((amt) => (
              <button
                key={amt}
                type="button"
                disabled={busy}
                onClick={() => handleBuy(amt)}
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 py-2.5 text-xs font-bold font-mono text-emerald-300 hover:bg-emerald-500/25 transition disabled:opacity-50"
              >
                +{amt} SOL
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="number"
              step="0.05"
              min="0.01"
              placeholder="Özel SOL tutarı"
              className={inputClass}
              value={customBuySol}
              onChange={(e) => setCustomBuySol(e.target.value)}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => handleBuy(Number(customBuySol) || 0.1)}
              className="rounded-lg bg-emerald-500 px-5 text-xs font-bold text-ink hover:bg-emerald-400 transition disabled:opacity-50 whitespace-nowrap"
            >
              Al
            </button>
          </div>
        </div>

        {/* HIZLI SATIŞ (SELL) */}
        <div className="rounded-xl border border-red-500/30 bg-red-950/10 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-red-400 flex items-center gap-1.5">
              🔴 Hızlı Satış (Instant Sell)
            </span>
            <span className="text-xs text-dim">Tek Cüzdandan Sat</span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {["25", "50", "75", "100"].map((pct) => (
              <button
                key={pct}
                type="button"
                disabled={busy}
                onClick={() => handleSell(pct)}
                className="rounded-lg border border-red-500/40 bg-red-500/10 py-2.5 text-xs font-bold font-mono text-red-300 hover:bg-red-500/25 transition disabled:opacity-50"
              >
                %{pct}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="number"
              step="5"
              min="1"
              max="100"
              placeholder="Özel yüzde (%)"
              className={inputClass}
              value={customSellPercent}
              onChange={(e) => setCustomSellPercent(e.target.value)}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => handleSell(customSellPercent)}
              className="rounded-lg bg-red-500 px-5 text-xs font-bold text-mist hover:bg-red-400 transition disabled:opacity-50 whitespace-nowrap"
            >
              Sat
            </button>
          </div>
        </div>
      </div>

      {/* ── ⚡ ÇOKLU CÜZDAN TOPLU SATIŞ (SUB-WALLET DUMP & PROFIT EXIT) ── */}
      <div className="rounded-xl border border-cyan-500/40 bg-gradient-to-r from-cyan-950/30 via-panel to-purple-950/20 p-6 space-y-4 shadow-glow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xl">⚡</span>
              <h4 className="text-base font-black text-cyan-400">
                Alt Cüzdanlardan Toplu Çıkış (Sub-Wallet Instant Dump)
              </h4>
            </div>
            <p className="text-xs text-dim max-w-xl">
              Faz 2 & 3&apos;te oluşturduğunuz ve bundle alımı yaptığınız <strong>{subWallets.length} alt cüzdanın</strong>{" "}
              tamamındaki tokenları aynı anda piyasaya boşaltır. Sıfır popup onayı gerektirir, kârı anında SOL olarak realize eder.
            </p>
          </div>

          <button
            type="button"
            disabled={busy || subWallets.length === 0}
            onClick={handleBatchSubWalletDump}
            className="rounded-lg bg-gradient-to-r from-cyan-500 to-purple-600 px-6 py-3 text-xs font-black text-ink hover:opacity-95 transition shadow-glow disabled:opacity-40"
          >
            🔥 TÜM ALT CÜZDANLARDAN %100 SAT
          </button>
        </div>

        {/* Toplu Satış Sonuç Tablosu */}
        {dumpResults && dumpResults.length > 0 && (
          <div className="space-y-2 rounded-lg border border-line bg-ink/90 p-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-cyan-400">
                Toplu Çıkış Sonuçları ({dumpResults.filter((r) => r.success).length}/{dumpResults.length} Cüzdan Başarılı)
              </span>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {dumpResults.map((r, i) => (
                <div key={i} className="flex items-center justify-between rounded bg-panel p-2 border border-line font-mono text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 rounded-full ${r.success ? "bg-emerald-400" : "bg-red-400"}`} />
                    <span className="text-mist">{r.walletLabel}</span>
                    <span className="text-dim">({shorten(r.walletPubKey)})</span>
                  </div>
                  {r.success && r.signature ? (
                    <a
                      href={`https://explorer.solana.com/tx/${r.signature}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-cyan-400 hover:underline"
                    >
                      {shorten(r.signature)} ↗
                    </a>
                  ) : (
                    <span className="text-red-400">{r.error || "Hata"}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Durum & Sonuç Bildirimleri */}
      {statusMsg && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-3 text-xs text-cyan-300 font-mono">
          ℹ️ {statusMsg}
        </div>
      )}

      {errorMsg && (
        <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-3 text-xs text-red-400 font-mono">
          ⚠️ {errorMsg}
        </div>
      )}

      {lastTxSig && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-3 text-xs text-emerald-300 flex items-center justify-between">
          <span>İşlem Başarılı!</span>
          <a
            href={`https://explorer.solana.com/tx/${lastTxSig}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-cyan-400 underline font-bold"
          >
            Explorer&apos;da İncele ({shorten(lastTxSig)}) ↗
          </a>
        </div>
      )}
    </div>
  );
}
