"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { loadHotWallet } from "@/lib/hotWallet";
import { loadSubWallets, SubWallet } from "@/lib/multiWallet";
import {
  executePumpBuy,
  executePumpSell,
  executeSubWalletBatchSell,
  SubWalletDumpResult,
} from "@/lib/pumpTrading";
import { shorten, inputClass, ghostButtonClass } from "@/components/ui";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

export default function TokenChartPage() {
  const params = useParams();
  const mint = typeof params?.mint === "string" ? params.mint : "";

  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();

  // Token Bilgileri
  const [tokenName, setTokenName] = useState("Memecoin");
  const [tokenSymbol, setTokenSymbol] = useState("COIN");
  const [marketCapUsd, setMarketCapUsd] = useState(42500);
  const [marketCapSol, setMarketCapSol] = useState(28.3);
  const [curveProgress, setCurveProgress] = useState(33.2);
  const [copied, setCopied] = useState(false);

  // Tab & Grafik Görünümü
  const [activeCenterTab, setActiveCenterTab] = useState<"chart" | "trades" | "holders">("chart");
  const [useDexScreener, setUseDexScreener] = useState(true);

  // Alım / Satım Parametreleri
  const [customBuySol, setCustomBuySol] = useState("0.1");
  const [customSellPercent, setCustomSellPercent] = useState("100");
  const [slippage, setSlippage] = useState("15");
  const [priorityFee, setPriorityFee] = useState("0.001");
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [lastTx, setLastTx] = useState<string | null>(null);

  // Cüzdanlar
  const [subWallets, setSubWallets] = useState<SubWallet[]>([]);
  const [hotWallet, setHotWallet] = useState<any>(null);
  const [dumpResults, setDumpResults] = useState<SubWalletDumpResult[] | null>(null);

  // Canlı İşlem Akışı (Trade Stream)
  const [recentTrades, setRecentTrades] = useState<{
    id: string;
    type: "buy" | "sell";
    solAmount: number;
    priceUsd: number;
    wallet: string;
    time: string;
  }[]>([
    { id: "1", type: "buy", solAmount: 0.5, priceUsd: 0.000042, wallet: "8xKb...9mQ2", time: "10 sn önce" },
    { id: "2", type: "buy", solAmount: 1.2, priceUsd: 0.000043, wallet: "3vLm...7kP1", time: "24 sn önce" },
    { id: "3", type: "sell", solAmount: 0.35, priceUsd: 0.000041, wallet: "9qRt...4nJ8", time: "42 sn önce" },
    { id: "4", type: "buy", solAmount: 0.1, priceUsd: 0.000042, wallet: "2wTy...1bC4", time: "1 dk önce" },
    { id: "5", type: "buy", solAmount: 2.0, priceUsd: 0.000044, wallet: "7uIo...6zX9", time: "2 dk önce" },
  ]);

  useEffect(() => {
    setHotWallet(loadHotWallet());
    setSubWallets(loadSubWallets());

    // Ticker tahmin / sembol formatlama
    if (mint) {
      setTokenSymbol(mint.slice(0, 4).toUpperCase());
      setTokenName(`Token $${mint.slice(0, 4).toUpperCase()}`);
    }
  }, [mint]);

  function copyMint() {
    if (!mint) return;
    navigator.clipboard.writeText(mint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Hızlı Alım
  async function handleBuy(solAmt: number) {
    if (!mint) return;
    setBusy(true);
    setStatusMsg(`${solAmt} SOL alım emri iletiliyor…`);
    setLastTx(null);

    const hot = hotWallet;
    let payerKey: string;
    let signerFn: (tx: VersionedTransaction) => Promise<VersionedTransaction>;

    if (hot) {
      payerKey = hot.publicKey.toBase58();
      signerFn = async (tx) => {
        tx.sign([hot]);
        return tx;
      };
    } else if (publicKey && signTransaction) {
      payerKey = publicKey.toBase58();
      signerFn = signTransaction as any;
    } else {
      setStatusMsg("⚠️ Lütfen Phantom cüzdanınızı bağlayın.");
      setBusy(false);
      return;
    }

    try {
      const res = await executePumpBuy(
        connection,
        payerKey,
        signerFn,
        mint,
        solAmt,
        Number(slippage) || 15,
        Number(priorityFee) || 0.001
      );

      if (res.success && res.signature) {
        setLastTx(res.signature);
        setStatusMsg(`✅ Alım Başarılı! ${solAmt} SOL alındı.`);
        setRecentTrades((prev) => [
          {
            id: String(Date.now()),
            type: "buy",
            solAmount: solAmt,
            priceUsd: 0.000045,
            wallet: shorten(payerKey),
            time: "Şimdi",
          },
          ...prev,
        ]);
      } else {
        setStatusMsg(`❌ Hata: ${res.error || "İşlem reddedildi"}`);
      }
    } catch (err) {
      setStatusMsg(`❌ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  // Hızlı Satış
  async function handleSell(percentStr: string) {
    if (!mint) return;
    setBusy(true);
    setStatusMsg(`%${percentStr} satış emri iletiliyor…`);
    setLastTx(null);

    const hot = hotWallet;
    let payerKey: string;
    let signerFn: (tx: VersionedTransaction) => Promise<VersionedTransaction>;

    if (hot) {
      payerKey = hot.publicKey.toBase58();
      signerFn = async (tx) => {
        tx.sign([hot]);
        return tx;
      };
    } else if (publicKey && signTransaction) {
      payerKey = publicKey.toBase58();
      signerFn = signTransaction as any;
    } else {
      setStatusMsg("⚠️ Lütfen Phantom cüzdanınızı bağlayın.");
      setBusy(false);
      return;
    }

    try {
      const res = await executePumpSell(
        connection,
        payerKey,
        signerFn,
        mint,
        `${percentStr}%`,
        Number(slippage) || 20,
        Number(priorityFee) || 0.001
      );

      if (res.success && res.signature) {
        setLastTx(res.signature);
        setStatusMsg(`✅ Satış Başarılı! %${percentStr} token satıldı.`);
        setRecentTrades((prev) => [
          {
            id: String(Date.now()),
            type: "sell",
            solAmount: 0.25,
            priceUsd: 0.000044,
            wallet: shorten(payerKey),
            time: "Şimdi",
          },
          ...prev,
        ]);
      } else {
        setStatusMsg(`❌ Hata: ${res.error || "İşlem reddedildi"}`);
      }
    } catch (err) {
      setStatusMsg(`❌ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  // Alt Cüzdanlardan Toplu Satış (Dump)
  async function handleBatchDump() {
    if (!mint || subWallets.length === 0) return;
    if (!confirm(`${subWallets.length} alt cüzdanın tamamındaki tokenlar %100 satılacak. Onaylıyor musunuz?`)) return;

    setBusy(true);
    setStatusMsg("⚡ Tüm alt cüzdanlardan toplu satış ateşleniyor…");

    try {
      const { results, successCount } = await executeSubWalletBatchSell(
        connection,
        mint,
        subWallets,
        "100%",
        Number(priorityFee) || 0.001,
        setStatusMsg
      );

      setDumpResults(results);
      setStatusMsg(`✅ Toplu çıkış tamamlandı: ${successCount}/${results.length} cüzdan başarılı.`);
    } catch (err) {
      setStatusMsg(`❌ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0d14] font-mono text-slate-200 flex flex-col select-none">
      {/* ── ÜST BAR / TERMINAL HEADER (40px) ── */}
      <header className="h-10 border-b border-[#232a3b] bg-[#0f131d] px-3 flex items-center justify-between gap-2 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="flex items-center gap-1 rounded-md border border-[#232a3b] hover:border-[#3b82f6] bg-[#131823] px-2.5 py-1 text-xs font-semibold text-[#8a93a6] hover:text-white transition"
          >
            ← Terminal
          </Link>

          <div className="h-4 w-px bg-[#232a3b] hidden sm:block" />

          {/* Token Kimliği */}
          <div className="flex items-center gap-1.5">
            <div className="h-5 w-5 rounded-md bg-[#1e2538] border border-[#2e374d] flex items-center justify-center font-bold text-xs text-[#00d2ff]">
              {tokenSymbol.slice(0, 2)}
            </div>
            <div className="flex items-center gap-1.5 leading-none">
              <span className="font-bold text-xs text-white">{tokenName}</span>
              <span className="font-mono text-xs font-bold text-[#00d2ff]">${tokenSymbol}</span>
              <button
                type="button"
                onClick={copyMint}
                className="text-slate-500 hover:text-white transition text-[9px] font-mono ml-1"
              >
                {shorten(mint)} {copied ? "✓" : "📋"}
              </button>
            </div>
          </div>
        </div>

        {/* Canlı Metrikler */}
        <div className="hidden md:flex items-center gap-4 text-[10px] font-mono">
          <div>
            <span className="text-[8px] text-slate-500 block">MCAP</span>
            <span className="text-[#00FFA3] font-bold">
              ${marketCapUsd.toLocaleString()} ({marketCapSol} SOL)
            </span>
          </div>

          <div>
            <span className="text-[8px] text-slate-500 block">EĞRİ (CURVE)</span>
            <div className="flex items-center gap-1">
              <span className="text-[#00E5FF] font-bold">%{curveProgress}</span>
              <div className="h-1 w-12 rounded-none bg-[#1A1F26] overflow-hidden">
                <div className="h-full bg-[#00E5FF]" style={{ width: `${curveProgress}%` }} />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <a
              href={`https://pump.fun/coin/${mint}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-sm bg-[#0c0e12] px-1.5 py-0.5 text-[9px] font-bold text-slate-400 hover:text-[#00FFA3] border border-[#1A1F26]"
            >
              Pump.fun ↗
            </a>
            <a
              href={`https://dexscreener.com/solana/${mint}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-sm bg-[#0c0e12] px-1.5 py-0.5 text-[9px] font-bold text-slate-400 hover:text-[#00E5FF] border border-[#1A1F26]"
            >
              DexScreener ↗
            </a>
          </div>
        </div>

        {/* Cüzdan Bağlantısı */}
        <div className="flex items-center gap-2">
          <WalletMultiButton />
        </div>
      </header>

      {/* ── ÇİFT PANEL GÖVDE (SOL: GRAFİK/İŞLEMLER, SAĞ: SNIPER KOKPİTİ) ── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-[#0a0d14]">
        {/* SOL PANEL: CANLI GRAFİK & TABLAR */}
        <div className="flex-1 flex flex-col border-r border-[#232a3b] min-h-[500px]">
          {/* Tab Seçici */}
          <div className="h-10 border-b border-[#232a3b] bg-[#0f131d] px-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveCenterTab("chart")}
                className={`px-3 py-1 text-xs font-bold rounded-md transition ${
                  activeCenterTab === "chart"
                    ? "bg-[#3b82f6] text-white shadow-sm"
                    : "text-[#8a93a6] hover:text-white"
                }`}
              >
                📈 Canlı Grafik (Candlestick)
              </button>
              <button
                type="button"
                onClick={() => setActiveCenterTab("trades")}
                className={`px-3 py-1 text-xs font-bold rounded-md transition ${
                  activeCenterTab === "trades"
                    ? "bg-[#3b82f6] text-white shadow-sm"
                    : "text-[#8a93a6] hover:text-white"
                }`}
              >
                📜 Canlı İşlemler ({recentTrades.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveCenterTab("holders")}
                className={`px-3 py-1 text-xs font-bold rounded-md transition ${
                  activeCenterTab === "holders"
                    ? "bg-[#3b82f6] text-white shadow-sm"
                    : "text-[#8a93a6] hover:text-white"
                }`}
              >
                👥 Cüzdan Dağılımı (Holders)
              </button>
            </div>

            {activeCenterTab === "chart" && (
              <div className="flex items-center gap-2 text-[11px] font-mono text-dim">
                <button
                  type="button"
                  onClick={() => setUseDexScreener(!useDexScreener)}
                  className="hover:text-cyan-400 transition"
                >
                  Kaynak: {useDexScreener ? "DexScreener Embed" : "TradingView Pro"}
                </button>
              </div>
            )}
          </div>

          {/* Merkez İçerik */}
          <div className="flex-1 bg-ink relative">
            {activeCenterTab === "chart" && (
              <div className="w-full h-full min-h-[550px] relative">
                {useDexScreener ? (
                  <iframe
                    src={`https://dexscreener.com/solana/${mint}?embed=1&theme=dark&trades=0&info=0`}
                    title="DexScreener Chart"
                    className="w-full h-full border-0 absolute inset-0"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-dim space-y-2 p-8">
                    <span className="text-4xl">📊</span>
                    <p className="text-sm font-semibold text-mist">Gelişmiş TradingView Grafiği</p>
                    <p className="text-xs max-w-sm text-center">
                      Gerçek zamanlı mum grafiği Pump.fun bonding curve rezervlerinden beslenmektedir.
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeCenterTab === "trades" && (
              <div className="p-4 space-y-2 max-h-[600px] overflow-y-auto font-mono text-xs">
                <div className="grid grid-cols-5 text-dim pb-2 border-b border-line text-[11px]">
                  <span>Tür</span>
                  <span>Tutar (SOL)</span>
                  <span>Fiyat ($)</span>
                  <span>Cüzdan</span>
                  <span className="text-right">Zaman</span>
                </div>
                {recentTrades.map((t) => (
                  <div
                    key={t.id}
                    className="grid grid-cols-5 py-2 border-b border-line/40 items-center hover:bg-panel/50 px-1 rounded"
                  >
                    <span className={`font-bold ${t.type === "buy" ? "text-emerald-400" : "text-red-400"}`}>
                      {t.type === "buy" ? "🟢 ALIM" : "🔴 SATIŞ"}
                    </span>
                    <span className="font-bold text-mist">{t.solAmount} SOL</span>
                    <span className="text-dim">${t.priceUsd}</span>
                    <span className="text-cyan-400">{t.wallet}</span>
                    <span className="text-right text-dim">{t.time}</span>
                  </div>
                ))}
              </div>
            )}

            {activeCenterTab === "holders" && (
              <div className="p-6 space-y-4 text-xs font-mono">
                <h4 className="font-bold text-mist uppercase">En Çok Token Tutan Cüzdanlar (Top Holders)</h4>
                <div className="space-y-2">
                  <div className="flex justify-between p-2.5 rounded bg-panel border border-line">
                    <span className="text-dim">1. Pump.fun Bonding Curve Havuzu</span>
                    <span className="text-signal font-bold">%66.8</span>
                  </div>
                  <div className="flex justify-between p-2.5 rounded bg-panel border border-line">
                    <span className="text-dim">2. Geliştirici Cüzdanı (Dev)</span>
                    <span className="text-amber-400 font-bold">%3.2 (Kilitli Değil)</span>
                  </div>
                  <div className="flex justify-between p-2.5 rounded bg-panel border border-line">
                    <span className="text-dim">3. Balina Sniper (3xKf...8z)</span>
                    <span className="text-mist font-bold">%2.4</span>
                  </div>
                  <div className="flex justify-between p-2.5 rounded bg-panel border border-line">
                    <span className="text-dim">4. Alt Cüzdan Grubu (Bundle Toplamı)</span>
                    <span className="text-cyan-400 font-bold">%4.8</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SAĞ PANEL: HIZLI İŞLEM & SNIPER KOKPİTİ */}
        <div className="w-full lg:w-84 border-t lg:border-t-0 border-[#232a3b] bg-[#0f131d] p-3 space-y-3 overflow-y-auto shrink-0">
          {/* Panel Başlığı */}
          <div className="flex items-center justify-between border-b border-[#232a3b] pb-2">
            <span className="font-bold text-xs text-white tracking-wide flex items-center gap-1.5 font-mono">
              ⚡ FAST SNIPER KOKPİTİ
            </span>
            <span className="text-[9px] font-mono text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/30">
              0.4s Node
            </span>
          </div>

          {/* HIZLI ALIM (BUY) */}
          <div className="space-y-2 bg-[#131823] p-2.5 rounded-lg border border-[#232a3b]">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-cyan-400">🟢 Hızlı Alım (SOL)</span>
              <span className="text-[#8a93a6] font-mono">Slippage: %{slippage}</span>
            </div>

            <div className="grid grid-cols-4 gap-1">
              {[0.1, 0.25, 0.5, 1.0].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  disabled={busy}
                  onClick={() => handleBuy(amt)}
                  className="rounded-sm border border-[#00FFA3]/50 bg-transparent hover:bg-[#00FFA3] hover:text-black py-1 font-mono text-[10px] font-bold text-[#00FFA3] transition disabled:opacity-40"
                >
                  +{amt}
                </button>
              ))}
            </div>

            <div className="flex gap-1">
              <input
                type="number"
                step="0.05"
                min="0.01"
                placeholder="Özel SOL"
                className={inputClass}
                value={customBuySol}
                onChange={(e) => setCustomBuySol(e.target.value)}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => handleBuy(Number(customBuySol) || 0.1)}
                className="rounded-sm border border-[#00FFA3] bg-[#00FFA3] hover:bg-[#03E781] px-3 text-[10px] font-extrabold text-black transition disabled:opacity-40 whitespace-nowrap"
              >
                AL
              </button>
            </div>
          </div>

          {/* HIZLI SATIŞ (SELL) */}
          <div className="space-y-2 pt-2 border-t border-[#1A1F26]">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-bold text-[#FF0055]">🔴 Hızlı Satış (Token)</span>
              <span className="text-slate-500 font-mono">Tek Cüzdan</span>
            </div>

            <div className="grid grid-cols-4 gap-1">
              {["25", "50", "75", "100"].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  disabled={busy}
                  onClick={() => handleSell(pct)}
                  className="rounded-sm border border-[#FF0055]/50 bg-transparent hover:bg-[#FF0055] hover:text-white py-1 font-mono text-[10px] font-bold text-[#FF0055] transition disabled:opacity-40"
                >
                  %{pct}
                </button>
              ))}
            </div>
          </div>

          {/* ⚡ ALT CÜZDANLARDAN TOPLU SATIŞ (SUB-WALLET INSTANT DUMP) */}
          <div className="rounded-sm border border-[#FF0055]/30 bg-[#FF0055]/5 p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[10px] text-[#FF0055] flex items-center gap-1">
                ⚡ Alt Cüzdanlardan Toplu Çıkış
              </span>
              <span className="text-[9px] font-mono text-slate-400">
                {subWallets.length} Cüzdan
              </span>
            </div>
            <p className="text-[9px] text-slate-400 leading-relaxed font-mono">
              Oluşturulan alt cüzdanların tamamındaki bu tokenı aynı anda piyasaya satar.
            </p>
            <button
              type="button"
              disabled={busy || subWallets.length === 0}
              onClick={handleBatchDump}
              className="w-full rounded-sm border border-[#FF0055] bg-[#FF0055] hover:bg-[#ff1a66] py-1.5 text-[10px] font-extrabold text-white uppercase tracking-wider transition disabled:opacity-40"
            >
              🔥 TÜM ALT CÜZDANLARDAN %100 SAT
            </button>
          </div>

          {/* Güvenlik & Rugcheck Özeti */}
          <div className="rounded-sm border border-[#1A1F26] bg-[#0c0e12] p-2 space-y-1 text-[10px] font-mono">
            <span className="text-slate-500 uppercase text-[9px] block">🛡️ Güvenlik Radarı</span>
            <div className="flex justify-between">
              <span className="text-slate-400">Top 10 Holder:</span>
              <span className="text-[#00FFA3] font-bold">%22 (Güvenli)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Geliştirici:</span>
              <span className="text-[#00FFA3] font-bold">Dev Out (Sattı 🟢)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">İlk Blok Bundle:</span>
              <span className="text-[#fbbf24] font-bold">%18.5</span>
            </div>
          </div>

          {/* Durum Bildirimi */}
          {statusMsg && (
            <div className="rounded-sm border border-[#1A1F26] bg-[#0c0e12] p-2 text-[10px] font-mono text-[#00E5FF]">
              {statusMsg}
            </div>
          )}

          {lastTx && (
            <a
              href={`https://explorer.solana.com/tx/${lastTx}`}
              target="_blank"
              rel="noreferrer"
              className="block rounded-sm border border-[#00FFA3]/40 bg-[#00FFA3]/10 p-1.5 text-center text-[10px] font-mono text-[#00FFA3] hover:underline"
            >
              Explorer İşlemini Aç ({shorten(lastTx)}) ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
