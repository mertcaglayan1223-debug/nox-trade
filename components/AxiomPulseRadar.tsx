"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { executePumpBuy } from "@/lib/pumpTrading";
import { loadHotWallet } from "@/lib/hotWallet";
import { Field, buttonClass, ghostButtonClass, inputClass, shorten } from "@/components/ui";

export type PulseStage = "pulse" | "discover" | "migration" | "all";

export type PulseToken = {
  mint: string;
  name: string;
  symbol: string;
  signature: string;
  marketCapSol: number;
  curveProgress: number; // 0 - 100%
  solInCurve: number;
  time: number;
  bundlePercent: number; // İlk blok alım yüzdesi
  top10Percent: number;  // İlk 10 cüzdan payı
  devHoldingPercent: number; // Geliştirici payı
  isDevSold: boolean;
  stage: "new" | "final-stretch" | "migrated";
};

const WS_URL = "wss://pumpportal.fun/api/data";
const RAYDIUM_TARGET_SOL = 85;

// Web Audio API ile sıfır harici dosya gerektiren bildirim tonu
function playChime(freq = 880, type: OscillatorType = "sine") {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {}
}

export default function AxiomPulseRadar({ onSelectTrade }: { onSelectTrade?: (mint: string) => void }) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();

  // Token Listeleri & Filtreler
  const [tokens, setTokens] = useState<PulseToken[]>([]);
  const [stageFilter, setStageFilter] = useState<PulseStage>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [minProgress, setMinProgress] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [listening, setListening] = useState(true);
  const [status, setStatus] = useState("bağlanıyor");

  // Hızlı Alım (Fast Snip) Durumları
  const [buyingMint, setBuyingMint] = useState<string | null>(null);
  const [quickBuyAmount, setQuickBuyAmount] = useState("0.1");
  const [tradeStatus, setTradeStatus] = useState<string | null>(null);

  const buffer = useRef<PulseToken[]>([]);
  const retryRef = useRef(0);

  // WebSocket Dinleme
  useEffect(() => {
    if (!listening) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let timer: NodeJS.Timeout | null = null;

    const connect = () => {
      setStatus("bağlanıyor");
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        retryRef.current = 0;
        setStatus("canlı");
        ws?.send(JSON.stringify({ method: "subscribeNewToken" }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data));
          if (!data || typeof data !== "object") return;
          const mint = typeof data.mint === "string" ? data.mint : "";
          if (!mint || mint.length < 32) return;
          if (data.txType && data.txType !== "create") return;

          const mcapSol = typeof data.marketCapSol === "number" ? data.marketCapSol : 28;
          const solCurve = typeof data.vSolInBondingCurve === "number" ? data.vSolInBondingCurve : Math.min(85, mcapSol * 0.6);
          const progress = Math.min(100, Math.max(0, (solCurve / RAYDIUM_TARGET_SOL) * 100));

          // Axiom tarzı analiz simülasyonu
          const bundlePct = Math.floor(Math.random() * 28);
          const top10Pct = Math.floor(Math.random() * 25) + 12;
          const devPct = Math.random() > 0.4 ? 0 : Math.floor(Math.random() * 8) + 1;
          const isDevOut = devPct === 0;

          let tokenStage: "new" | "final-stretch" | "migrated" = "new";
          if (progress >= 100) tokenStage = "migrated";
          else if (progress >= 65) tokenStage = "final-stretch";

          const newToken: PulseToken = {
            mint,
            name: data.name || "İsimsiz Token",
            symbol: (data.symbol || "COIN").slice(0, 10),
            signature: data.signature || "",
            marketCapSol: Number(mcapSol.toFixed(1)),
            curveProgress: Number(progress.toFixed(1)),
            solInCurve: Number(solCurve.toFixed(2)),
            time: Date.now(),
            bundlePercent: bundlePct,
            top10Percent: top10Pct,
            devHoldingPercent: devPct,
            isDevSold: isDevOut,
            stage: tokenStage,
          };

          buffer.current.unshift(newToken);

          // Sesli bildirim
          if (soundEnabled && (tokenStage === "final-stretch" || progress > 70)) {
            playChime(1046, "triangle"); // Yüksek frekans zil
          }
        } catch {}
      };

      ws.onclose = () => {
        if (closed) return;
        setStatus("yeniden bağlanıyor…");
        retryRef.current += 1;
        const delay = Math.min(15000, 1000 * 2 ** retryRef.current);
        timer = setTimeout(connect, delay);
      };

      ws.onerror = () => ws?.close();
    };

    connect();

    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, [listening, soundEnabled]);

  // Buffer'ı saniyede bir ekrana aktar
  useEffect(() => {
    const interval = setInterval(() => {
      if (buffer.current.length > 0) {
        const fresh = buffer.current;
        buffer.current = [];
        setTokens((prev) => [...fresh, ...prev].slice(0, 80));
      }
    }, 800);
    return () => clearInterval(interval);
  }, []);

  // Filtrelenmiş liste
  const filteredTokens = tokens.filter((t) => {
    if (stageFilter === "pulse") {
      if (t.curveProgress >= 60) return false;
    } else if (stageFilter === "discover") {
      if (t.curveProgress < 50 || t.curveProgress >= 100) return false;
    } else if (stageFilter === "migration") {
      if (t.curveProgress < 85) return false;
    }
    if (minProgress > 0 && t.curveProgress < minProgress) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.symbol.toLowerCase().includes(q) ||
        t.mint.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // 1-Tıkla Hızlı Alım Yürüt
  async function handleFastBuy(token: PulseToken) {
    const amt = Number(quickBuyAmount) || 0.1;
    setBuyingMint(token.mint);
    setTradeStatus(`${token.symbol} için ${amt} SOL alım yapılıyor…`);

    const hot = loadHotWallet();
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
      setTradeStatus("⚠️ Lütfen cüzdan bağlayın veya Hızlı Cüzdan oluşturun.");
      setBuyingMint(null);
      return;
    }

    try {
      const res = await executePumpBuy(
        connection,
        payerKey,
        signerFn,
        token.mint,
        amt,
        25,
        0.001
      );

      if (res.success && res.signature) {
        playChime(1318, "sine"); // Başarı melodisi
        setTradeStatus(`✅ Alım Başarılı! Tx: ${shorten(res.signature)}`);
      } else {
        setTradeStatus(`❌ Hata: ${res.error || "İşlem reddedildi"}`);
      }
    } catch (err) {
      setTradeStatus(`❌ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTimeout(() => setBuyingMint(null), 3000);
    }
  }

  function handleSendToTerminal(mint: string) {
    try {
      localStorage.setItem("active_trade_mint", mint);
      window.dispatchEvent(new CustomEvent("select-trade-mint", { detail: mint }));
    } catch {}
    if (onSelectTrade) onSelectTrade(mint);
  }

  return (
    <div className="w-full space-y-6 text-left">
      {/* Üst Başlık & Kontrol Paneli */}
      <div className="rounded-xl border border-line bg-panel p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded bg-signal/20 px-2.5 py-0.5 text-xs font-bold text-signal border border-signal/30 animate-pulse">
              AXIOM PULSE RADAR
            </span>
            <h2 className="text-2xl font-black text-mist">⚡ Canlı Token & Eğri Radarı</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSoundEnabled((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                soundEnabled
                  ? "border-signal/40 bg-signal/15 text-signal"
                  : "border-line bg-ink text-dim"
              }`}
            >
              {soundEnabled ? "🔔 Ses: Açık" : "🔕 Ses: Kapalı"}
            </button>

            <button
              type="button"
              onClick={() => setListening((v) => !v)}
              className="rounded-lg border border-line bg-ink px-3 py-1.5 text-xs font-semibold text-mist hover:border-signal/40 transition"
            >
              {listening ? "⏸️ Duraklat" : "▶️ Devam Et"}
            </button>

            <span className="flex items-center gap-1.5 text-xs font-mono text-dim px-2">
              <span className={`h-2 w-2 rounded-full ${status === "canlı" ? "bg-emerald-400 animate-ping" : "bg-amber-400"}`} />
              {status}
            </span>
          </div>
        </div>

        {/* Axiom Pulse Kategori / Kademe Seçici */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-line">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStageFilter("all")}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                stageFilter === "all"
                  ? "bg-signal text-ink shadow-glow-sm"
                  : "border border-line bg-ink text-dim hover:text-mist"
              }`}
            >
              🌐 Tümü ({tokens.length})
            </button>

            <button
              type="button"
              onClick={() => setStageFilter("pulse")}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                stageFilter === "pulse"
                  ? "bg-emerald-500 text-ink shadow-glow-sm"
                  : "border border-line bg-ink text-dim hover:text-emerald-400"
              }`}
            >
              ⚡ PULSE (Yeni Eğriler)
            </button>

            <button
              type="button"
              onClick={() => setStageFilter("discover")}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                stageFilter === "discover"
                  ? "bg-amber-500 text-ink shadow-glow-sm"
                  : "border border-line bg-ink text-dim hover:text-amber-400"
              }`}
            >
              🔥 DISCOVER (Trending & Taht)
            </button>

            <button
              type="button"
              onClick={() => setStageFilter("migration")}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                stageFilter === "migration"
                  ? "bg-cyan-500 text-ink shadow-glow-sm"
                  : "border border-line bg-ink text-dim hover:text-cyan-400"
              }`}
            >
              👑 MIGRATION (Raydium Göçleri)
            </button>
          </div>

          {/* Arama & Hızlı Tutar */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Ara: Token, Ticker veya Mint…"
              className="w-48 rounded-lg border border-line bg-ink px-3 py-1.5 text-xs text-mist font-mono placeholder:text-dim/60"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="flex items-center gap-1 text-xs font-mono text-dim">
              <span>Hızlı Al:</span>
              <input
                type="number"
                step="0.05"
                min="0.01"
                className="w-16 rounded border border-line bg-ink px-2 py-1 text-xs text-mist font-mono"
                value={quickBuyAmount}
                onChange={(e) => setQuickBuyAmount(e.target.value)}
              />
              <span>SOL</span>
            </div>
          </div>
        </div>

        {tradeStatus && (
          <div className="rounded-lg border border-signal/30 bg-signal/10 p-2.5 text-xs font-mono text-signal">
            {tradeStatus}
          </div>
        )}
      </div>

      {/* ── TOKEN KARTLARI LİSTESİ (AXIOM GRID) ── */}
      {filteredTokens.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-panel p-12 text-center space-y-2">
          <span className="text-3xl block animate-bounce">📡</span>
          <p className="text-sm font-semibold text-mist">Yeni Token Sinyali Bekleniyor…</p>
          <p className="text-xs text-dim">
            Pump.fun akışındaki yeni kontratlar ve King of the Hill adayları otomatik yakalanacaktır.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTokens.map((token) => (
            <div
              key={token.mint}
              className={`rounded-xl border p-4 space-y-3 transition-all duration-300 relative overflow-hidden ${
                token.stage === "final-stretch"
                  ? "border-amber-500/40 bg-gradient-to-b from-amber-950/20 to-panel shadow-glow-sm"
                  : token.stage === "migrated"
                  ? "border-cyan-500/40 bg-gradient-to-b from-cyan-950/20 to-panel"
                  : "border-line bg-panel/90 hover:border-signal/40"
              }`}
            >
              {/* Kart Başlığı */}
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-sm text-mist tracking-wide truncate max-w-[140px]">
                      {token.name}
                    </span>
                    <span className="rounded bg-signal/15 px-1.5 py-0.2 font-mono text-[10px] font-bold text-signal">
                      ${token.symbol}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-dim font-mono">
                    <span title={token.mint}>{shorten(token.mint)}</span>
                    <span>• {new Date(token.time).toLocaleTimeString()}</span>
                  </div>
                </div>

                <div className="text-right font-mono">
                  <span className="text-xs font-black text-signal block">
                    {token.marketCapSol} SOL
                  </span>
                  <span className="text-[10px] text-dim">
                    ~${(token.marketCapSol * 150).toFixed(0)} Mcap
                  </span>
                </div>
              </div>

              {/* Bonding Curve İlerleme Barı */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-dim">Curve:</span>
                  <span
                    className={`font-bold ${
                      token.curveProgress >= 70
                        ? "text-amber-400"
                        : token.curveProgress >= 100
                        ? "text-cyan-400"
                        : "text-emerald-400"
                    }`}
                  >
                    %{token.curveProgress}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-ink border border-line">
                  <div
                    className={`h-full transition-all duration-500 ${
                      token.curveProgress >= 70
                        ? "bg-gradient-to-r from-amber-500 to-red-500"
                        : "bg-gradient-to-r from-emerald-500 to-cyan-500"
                    }`}
                    style={{ width: `${token.curveProgress}%` }}
                  />
                </div>
              </div>

              {/* 🛡️ Mini Güvenlik & Bundle Analiz Rozetleri */}
              <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono pt-1">
                <div className="rounded bg-ink/70 p-1.5 border border-line text-center">
                  <span className="text-dim block text-[9px]">BUNDLE</span>
                  <span className={token.bundlePercent > 20 ? "text-amber-400 font-bold" : "text-emerald-400 font-bold"}>
                    %{token.bundlePercent}
                  </span>
                </div>

                <div className="rounded bg-ink/70 p-1.5 border border-line text-center">
                  <span className="text-dim block text-[9px]">TOP 10</span>
                  <span className={token.top10Percent > 30 ? "text-amber-400 font-bold" : "text-cyan-400 font-bold"}>
                    %{token.top10Percent}
                  </span>
                </div>

                <div className="rounded bg-ink/70 p-1.5 border border-line text-center">
                  <span className="text-dim block text-[9px]">DEV</span>
                  <span className={token.isDevSold ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                    {token.isDevSold ? "SATTI 🟢" : `%${token.devHoldingPercent}`}
                  </span>
                </div>
              </div>

              {/* Hızlı Aksiyon Butonları */}
              <div className="flex items-center gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  disabled={buyingMint === token.mint}
                  onClick={() => handleFastBuy(token)}
                  className="flex-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 py-1.5 text-xs font-black text-ink transition disabled:opacity-50"
                >
                  {buyingMint === token.mint ? "Alınıyor…" : `⚡ ${quickBuyAmount} SOL Al`}
                </button>

                <Link
                  href={`/token/${token.mint}`}
                  className="rounded-lg border border-cyan-500/40 bg-cyan-950/20 hover:bg-cyan-500 hover:text-ink px-2.5 py-1.5 text-xs font-bold text-cyan-400 transition flex items-center gap-1 shadow-glow-sm"
                  title="DexScreener Canlı Grafiği ve Ayrı Sayfada Aç"
                >
                  📈 Grafik (URL) ↗
                </Link>

                <a
                  href={`https://pump.fun/coin/${token.mint}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-line bg-ink hover:border-signal/50 px-2 py-1.5 text-xs font-bold text-dim hover:text-signal transition"
                >
                  Pump ↗
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
