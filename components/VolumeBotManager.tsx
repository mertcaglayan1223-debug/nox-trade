"use client";

import { useEffect, useRef, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { loadSubWallets, SubWallet } from "@/lib/multiWallet";
import {
  BotTradeMode,
  executeSingleBotTrade,
  getRandomNumber,
  VolumeTradeLog,
} from "@/lib/volumeBot";
import { Field, inputClass, shorten } from "@/components/ui";

export default function VolumeBotManager() {
  const { connection } = useConnection();

  // Hedef Token
  const [mintAddress, setMintAddress] = useState("");

  // Bot Parametreleri
  const [minTradeSol, setMinTradeSol] = useState("0.005");
  const [maxTradeSol, setMaxTradeSol] = useState("0.015");
  const [minIntervalSec, setMinIntervalSec] = useState("10");
  const [maxIntervalSec, setMaxIntervalSec] = useState("25");
  const [maxBudgetSol, setMaxBudgetSol] = useState("0.2");
  const [mode, setMode] = useState<BotTradeMode>("buy-sell-cycle");
  const [priorityFee, setPriorityFee] = useState("0.0005");

  // Alt Cüzdanlar
  const [subWallets, setSubWallets] = useState<SubWallet[]>([]);

  // Bot Çalışma Durumu
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<VolumeTradeLog[]>([]);
  const [totalVolumeSol, setTotalVolumeSol] = useState(0);
  const [totalSpentSol, setTotalSpentSol] = useState(0);
  const [tradeCount, setTradeCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Bot hazır. Başlatılmayı bekliyor.");

  // Referanslar (Döngü kontrolü için)
  const isRunningRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const cycleCountRef = useRef(0);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Sayfa yüklendiğinde alt cüzdanları ve son tokenı yükle
  useEffect(() => {
    setSubWallets(loadSubWallets());

    try {
      const stored = localStorage.getItem("solana_memecoin_activity");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].mint) {
          setMintAddress(parsed[0].mint);
        }
      }
    } catch {}

    return () => {
      stopBot();
    };
  }, []);

  // Loglar güncellendikçe aşağı kaydır
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Cüzdanların toplam SOL bakiyesi
  const totalSubWalletsSol = subWallets.reduce(
    (acc, w) => acc + (w.balanceSol || 0),
    0
  );

  // ── BOT DÖNGÜSÜ ──
  async function runBotCycle() {
    if (!isRunningRef.current) return;

    const minAmount = Number(minTradeSol) || 0.005;
    const maxAmount = Number(maxTradeSol) || 0.015;
    const budgetLimit = Number(maxBudgetSol) || 0.2;

    // Bütçe kontrolü
    if (totalSpentSol >= budgetLimit) {
      setStatusMessage("⚠️ Maksimum bütçe sınırına ulaşıldı. Bot durduruldu.");
      stopBot();
      return;
    }

    // Yeterli bakiyesi olan rastgele bir cüzdan seç
    const eligibleWallets = subWallets.filter(
      (w) => (w.balanceSol || 0) >= minAmount + 0.002
    );

    if (eligibleWallets.length === 0) {
      setStatusMessage("⚠️ Yeterli SOL bakiyesine sahip alt cüzdan kalmadı!");
      stopBot();
      return;
    }

    const randomWallet =
      eligibleWallets[Math.floor(Math.random() * eligibleWallets.length)];
    const tradeSol = getRandomNumber(minAmount, maxAmount, 3);

    // İşlem tipini belirle: mode'a göre alım veya satış
    let action: "buy" | "sell" = "buy";
    if (mode === "buy-sell-cycle") {
      // Her 2 alımda 1 satış çevirerek hacim dalgası üret
      cycleCountRef.current += 1;
      action = cycleCountRef.current % 3 === 0 ? "sell" : "buy";
    }

    setStatusMessage(
      `⚡ ${randomWallet.label} ile ${action.toUpperCase()} işlemi yürütülüyor (${tradeSol} SOL)…`
    );

    const log = await executeSingleBotTrade(
      connection,
      randomWallet,
      mintAddress.trim(),
      action,
      tradeSol,
      Number(priorityFee) || 0.0005
    );

    setLogs((prev) => [...prev, log]);
    setTradeCount((c) => c + 1);

    if (log.success) {
      setTotalVolumeSol((v) => Number((v + tradeSol).toFixed(4)));
      if (action === "buy") {
        setTotalSpentSol((s) => Number((s + tradeSol).toFixed(4)));
      }
    }

    // Bir sonraki işlem için rastgele gecikme planla
    if (isRunningRef.current) {
      const minSec = Math.max(3, Number(minIntervalSec) || 10);
      const maxSec = Math.max(minSec, Number(maxIntervalSec) || 25);
      const nextDelaySec = getRandomNumber(minSec, maxSec, 1);

      setStatusMessage(`⏳ Sonraki işlem ${nextDelaySec} sn sonra… (Hacim Aktif)`);

      timerRef.current = setTimeout(() => {
        runBotCycle();
      }, nextDelaySec * 1000);
    }
  }

  function startBot() {
    if (!mintAddress.trim()) {
      alert("Lütfen işlem yapılacak geçerli bir token mint adresi girin.");
      return;
    }
    if (subWallets.length === 0) {
      alert("Kayıtlı alt cüzdan bulunamadı. Lütfen önce Çoklu Cüzdan sekmesinden cüzdan üretin.");
      return;
    }

    isRunningRef.current = true;
    setIsRunning(true);
    setStatusMessage("🚀 Hacim & Bump botu başlatıldı! İşlemler hazırlanıyor…");
    runBotCycle();
  }

  function stopBot() {
    isRunningRef.current = false;
    setIsRunning(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setStatusMessage("🛑 Bot durduruldu.");
  }

  return (
    <div className="w-full space-y-4 rounded-sm border border-[#1A1F26] bg-[#0c0e12] p-4 text-left font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1A1F26] pb-2">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? "bg-[#00FFA3] animate-ping" : "bg-slate-600"}`} />
          <h2 className="text-xs font-bold text-white tracking-tight uppercase">ALGO VOLUME & BUMP BOT CONTROLLER</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-slate-400 bg-[#090A0C] px-1.5 py-0.5 rounded-sm border border-[#1A1F26]">
            DURUM: <strong className={isRunning ? "text-[#00FFA3]" : "text-slate-500"}>{isRunning ? "AKTİF" : "BEKLEMEDE"}</strong>
          </span>
        </div>
      </div>

      {/* Canlı İstatistik Gösterge Paneli */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-sm border border-[#1A1F26] bg-[#090A0C] p-2.5 space-y-0.5">
          <span className="text-[9px] text-slate-500 uppercase">Toplam Hacim</span>
          <p className="text-base font-bold font-mono text-[#00E5FF]">
            {totalVolumeSol.toFixed(3)} SOL
          </p>
          <span className="text-[9px] text-slate-500 font-mono">
            ~${(totalVolumeSol * 184).toFixed(0)} USD
          </span>
        </div>
        <div className="rounded-sm border border-[#1A1F26] bg-[#090A0C] p-2.5 space-y-0.5">
          <span className="text-[9px] text-slate-500 uppercase">İşlem Adedi</span>
          <p className="text-base font-bold font-mono text-[#00FFA3]">
            {tradeCount} Tx
          </p>
          <span className="text-[9px] text-slate-500">
            {logs.filter((l) => l.success).length} Başarılı
          </span>
        </div>
        <div className="rounded-sm border border-[#1A1F26] bg-[#090A0C] p-2.5 space-y-0.5">
          <span className="text-[9px] text-slate-500 uppercase">Kullanılan Bütçe</span>
          <p className="text-base font-bold font-mono text-[#fbbf24]">
            {totalSpentSol.toFixed(3)} / {maxBudgetSol} SOL
          </p>
          <span className="text-[9px] text-slate-500">Maksimum limit</span>
        </div>
        <div className="rounded-sm border border-[#1A1F26] bg-[#090A0C] p-2.5 space-y-0.5">
          <span className="text-[9px] text-slate-500 uppercase">Alt Cüzdanlar</span>
          <p className="text-base font-bold font-mono text-purple-400">
            {subWallets.length} Cüzdan
          </p>
          <span className="text-[9px] text-slate-500 font-mono">
            {totalSubWalletsSol.toFixed(3)} SOL
          </span>
        </div>
      </div>

      {/* Bot Konfigürasyon Kartı */}
      <div className="rounded-xl border border-line bg-panel p-6 space-y-5">
        <h3 className="font-bold text-sm text-mist uppercase tracking-wider">
          ⚙️ Bot Çalışma Parametreleri
        </h3>

        {/* Mint Adresi */}
        <Field label="Hedef Token Mint Adresi *" hint="Hacim basılacak Pump.fun token kontratı">
          <input
            type="text"
            className={`${inputClass} font-mono text-xs`}
            placeholder="Örn: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
            value={mintAddress}
            disabled={isRunning}
            onChange={(e) => setMintAddress(e.target.value.trim())}
          />
        </Field>

        {/* Çalışma Modu */}
        <div className="space-y-1.5">
          <label className="text-xs text-dim block">Strateji / Çalışma Modu:</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              disabled={isRunning}
              onClick={() => setMode("buy-sell-cycle")}
              className={`rounded-lg border p-3 text-left transition ${
                mode === "buy-sell-cycle"
                  ? "border-cyan-500 bg-cyan-950/30 text-cyan-300 shadow-glow-sm"
                  : "border-line bg-ink/60 text-dim hover:border-line/80"
              }`}
            >
              <div className="font-bold text-xs flex items-center gap-1.5">
                <span>🔄</span> Buy & Sell Hacim Döngüsü
              </div>
              <p className="text-[11px] text-dim mt-1">
                2 alım, 1 satış döngüsü çevirerek SOL sermayesini korur ve maksimum işlem hacmi üretir.
              </p>
            </button>

            <button
              type="button"
              disabled={isRunning}
              onClick={() => setMode("buy-only")}
              className={`rounded-lg border p-3 text-left transition ${
                mode === "buy-only"
                  ? "border-emerald-500 bg-emerald-950/30 text-emerald-300 shadow-glow-sm"
                  : "border-line bg-ink/60 text-dim hover:border-line/80"
              }`}
            >
              <div className="font-bold text-xs flex items-center gap-1.5">
                <span>🚀</span> Yalnızca Alım (Bump & Pump)
              </div>
              <p className="text-[11px] text-dim mt-1">
                Yalnızca küçük alımlar yaparak tokenı durmaksızın listenin en tepesine fırlatır (Yeşil Mumlar).
              </p>
            </button>
          </div>
        </div>

        {/* Aralık Ayarları */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="İşlem Başına SOL (Min - Max)" hint="Her işlemde rastgele seçilir">
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.002"
                min="0.001"
                disabled={isRunning}
                className={inputClass}
                value={minTradeSol}
                onChange={(e) => setMinTradeSol(e.target.value)}
              />
              <span className="text-dim text-xs">-</span>
              <input
                type="number"
                step="0.002"
                min="0.002"
                disabled={isRunning}
                className={inputClass}
                value={maxTradeSol}
                onChange={(e) => setMaxTradeSol(e.target.value)}
              />
            </div>
          </Field>

          <Field label="Bekleme Süresi (Min - Max sn)" hint="Algoritma filtrelerini aşmak için">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="3"
                disabled={isRunning}
                className={inputClass}
                value={minIntervalSec}
                onChange={(e) => setMinIntervalSec(e.target.value)}
              />
              <span className="text-dim text-xs">-</span>
              <input
                type="number"
                min="5"
                disabled={isRunning}
                className={inputClass}
                value={maxIntervalSec}
                onChange={(e) => setMaxIntervalSec(e.target.value)}
              />
            </div>
          </Field>

          <Field label="Maksimum Bütçe Limiti (SOL)" hint="Ulaşılınca bot durur">
            <input
              type="number"
              step="0.05"
              min="0.01"
              disabled={isRunning}
              className={inputClass}
              value={maxBudgetSol}
              onChange={(e) => setMaxBudgetSol(e.target.value)}
            />
          </Field>
        </div>

        {/* Başlat / Durdur Kontrol Çubuğu */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-4 border-t border-line">
          <div className="text-xs font-mono text-cyan-400">
            {statusMessage}
          </div>

          <div className="flex items-center gap-3">
            {!isRunning ? (
              <button
                type="button"
                onClick={startBot}
                className="rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 px-8 py-3 text-sm font-black text-ink hover:opacity-90 transition shadow-glow"
              >
                ▶ BOTU BAŞLAT
              </button>
            ) : (
              <button
                type="button"
                onClick={stopBot}
                className="rounded-lg bg-gradient-to-r from-red-500 to-amber-500 px-8 py-3 text-sm font-black text-mist hover:opacity-90 transition shadow-glow"
              >
                ⏹ BOTU DURDUR
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── CANLI LOG TERMİNALİ ── */}
      <div className="rounded-xl border border-line bg-ink p-5 space-y-3 font-mono">
        <div className="flex items-center justify-between text-xs text-dim pb-2 border-b border-line">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400">●</span>
            <span className="font-bold text-mist">CANLI İŞLEM KONSOLU</span>
          </div>
          <span>{logs.length} İşlem Kaydı</span>
        </div>

        <div
          ref={logContainerRef}
          className="max-h-64 overflow-y-auto space-y-1.5 text-xs pr-1"
        >
          {logs.length === 0 ? (
            <p className="text-dim py-6 text-center text-xs">
              Bot henüz başlatılmadı. Başlatıldığında canlı alım satım işlemleri burada akacaktır…
            </p>
          ) : (
            logs.map((l) => (
              <div
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded bg-panel/70 p-2 border border-line/60"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-dim">
                    {new Date(l.time).toLocaleTimeString()}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.2 text-[10px] font-bold ${
                      l.action === "buy"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {l.action === "buy" ? "🟢 ALIM" : "🔴 SATIŞ"}
                  </span>
                  <span className="text-mist font-semibold">{l.walletLabel}</span>
                  <span className="text-dim">({shorten(l.walletPubKey)})</span>
                  <span className="text-cyan-400 font-bold">{l.amountSol} SOL</span>
                </div>

                <div>
                  {l.success && l.signature ? (
                    <a
                      href={`https://explorer.solana.com/tx/${l.signature}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-signal hover:underline text-[11px]"
                    >
                      {shorten(l.signature)} ↗
                    </a>
                  ) : (
                    <span className="text-red-400 text-[11px]">
                      {l.error || "Başarısız"}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
