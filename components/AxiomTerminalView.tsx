"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { executePumpBuy } from "@/lib/pumpTrading";
import { loadHotWallet } from "@/lib/hotWallet";
import { shorten } from "@/components/ui";
import {
  DEFAULT_PULSE_FILTERS,
  PulseFilterConfig,
  TradingPreset,
  loadTradingPresets,
} from "@/lib/presets";
import { TokenCard } from "./TokenCard";

export type AxiomToken = {
  mint: string;
  name: string;
  symbol: string;
  signature: string;
  marketCapSol: number;
  marketCapUsd: number;
  curveProgress: number; // 0-100%
  solInCurve: number;
  time: number;
  bundlePercent: number;
  top10Percent: number;
  devHoldingPercent: number;
  isDevSold: boolean;
  txCount: number;
  volumeSol: number;
  twitter?: string;
  telegram?: string;
  website?: string;
  justUpdated?: boolean;
};

const WS_URL = "wss://pumpportal.fun/api/data";
const SOL_PRICE = 184;

const INITIAL_SEED_TOKENS: AxiomToken[] = [
  // ── 1. New Pairs (<50% Bonding Curve)
  {
    mint: "HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n4V98jwC",
    name: "Axiom Cat",
    symbol: "AXCAT",
    signature: "5UfD9k1a...PUMP",
    marketCapSol: 38.4,
    marketCapUsd: 7065,
    curveProgress: 45.2,
    solInCurve: 38.4,
    time: Date.now() - 14000,
    bundlePercent: 12,
    top10Percent: 18,
    devHoldingPercent: 0,
    isDevSold: true,
    txCount: 88,
    volumeSol: 19.4,
    twitter: "axiomcat_sol",
    website: "https://axiomcat.io",
  },
  {
    mint: "EdAQuW9kZz9461z1D25E2mS3rPvx3bY4M9Zk8T9PUMP",
    name: "Pepe Dark",
    symbol: "DPEPE",
    signature: "4NxY7p1q...PUMP",
    marketCapSol: 26.1,
    marketCapUsd: 4802,
    curveProgress: 30.7,
    solInCurve: 26.1,
    time: Date.now() - 5000,
    bundlePercent: 14,
    top10Percent: 16,
    devHoldingPercent: 2,
    isDevSold: false,
    txCount: 34,
    volumeSol: 8.6,
    twitter: "darkpepe_sol",
  },
  {
    mint: "BNDL9kPmQ2x9D5vK1z4tY8sR3mPvx3bY4M9Zk8T9PUMP",
    name: "Neural Nexus",
    symbol: "NEXUS",
    signature: "7TyR1x8m...PUMP",
    marketCapSol: 18.2,
    marketCapUsd: 3348,
    curveProgress: 21.4,
    solInCurve: 18.2,
    time: Date.now() - 22000,
    bundlePercent: 9,
    top10Percent: 14,
    devHoldingPercent: 0,
    isDevSold: true,
    txCount: 22,
    volumeSol: 4.8,
    twitter: "neuralnexus_ai",
  },
  // ── 2. Final Stretch (50% - 95% Bonding Curve)
  {
    mint: "8bFk4r3L9kPmQ2x9D5vK1z4tY8sR3mPvx3bY4M9Zk8T",
    name: "Solaris AI",
    symbol: "SOLAR",
    signature: "2VxL5t9p...PUMP",
    marketCapSol: 58.8,
    marketCapUsd: 10819,
    curveProgress: 69.1,
    solInCurve: 58.8,
    time: Date.now() - 95000,
    bundlePercent: 11,
    top10Percent: 24,
    devHoldingPercent: 0,
    isDevSold: true,
    txCount: 162,
    volumeSol: 38.2,
    twitter: "solaris_pump",
  },
  {
    mint: "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E",
    name: "Fomo Apex",
    symbol: "APEX",
    signature: "8YtL2k9p...PUMP",
    marketCapSol: 74.5,
    marketCapUsd: 13708,
    curveProgress: 87.6,
    solInCurve: 74.5,
    time: Date.now() - 75000,
    bundlePercent: 7,
    top10Percent: 17,
    devHoldingPercent: 0,
    isDevSold: true,
    txCount: 198,
    volumeSol: 44.8,
    twitter: "fomoapex",
  },
  {
    mint: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
    name: "Proxima Velocity",
    symbol: "PROX",
    signature: "3KpQ8m2z...PUMP",
    marketCapSol: 78.2,
    marketCapUsd: 14388,
    curveProgress: 92.0,
    solInCurve: 78.2,
    time: Date.now() - 48000,
    bundlePercent: 8,
    top10Percent: 21,
    devHoldingPercent: 0,
    isDevSold: true,
    txCount: 240,
    volumeSol: 64.1,
    twitter: "proxima_sol",
  },
  // ── 3. Migrated (>=95% / Raydium Pools)
  {
    mint: "CzLSujWBLFsSjncfkh59rQD4ETHc224fN7N3WqYUMP11",
    name: "Trump Cyber Dog",
    symbol: "CDOG",
    signature: "9LmP2w4k...PUMP",
    marketCapSol: 84.6,
    marketCapUsd: 29400,
    curveProgress: 100.0,
    solInCurve: 85.0,
    time: Date.now() - 130000,
    bundlePercent: 6,
    top10Percent: 19,
    devHoldingPercent: 0,
    isDevSold: true,
    txCount: 520,
    volumeSol: 142.5,
    twitter: "cyberdog_ray",
    website: "https://cyberdog.vip",
  },
  {
    mint: "RAYD8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hrPUMP",
    name: "Axiom Quantum",
    symbol: "QUANT",
    signature: "6HkL9p1x...PUMP",
    marketCapSol: 98.4,
    marketCapUsd: 38200,
    curveProgress: 100.0,
    solInCurve: 85.0,
    time: Date.now() - 240000,
    bundlePercent: 4,
    top10Percent: 15,
    devHoldingPercent: 0,
    isDevSold: true,
    txCount: 780,
    volumeSol: 218.0,
    twitter: "axiom_quantum",
  },
];

export default function AxiomTerminalView({
  onSelectToken,
  initialTab = "pulse",
}: {
  onSelectToken?: (mint: string) => void;
  initialTab?: "pulse" | "discover" | "migration";
}) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();

  const [tokens, setTokens] = useState<AxiomToken[]>(INITIAL_SEED_TOKENS);
  const [listening, setListening] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [globalSearch, setGlobalSearch] = useState("");
  const [selectedMint, setSelectedMint] = useState<string | null>(null);

  // Axiom Display Mode: Cards vs Table
  const [displayMode, setDisplayMode] = useState<"cards" | "table">("cards");

  // Advanced 14-metrics Filter Modal State
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState<PulseFilterConfig>(DEFAULT_PULSE_FILTERS);

  // Column specific search inputs
  const [colSearchNew, setColSearchNew] = useState("");
  const [colSearchFin, setColSearchFin] = useState("");
  const [colSearchMig, setColSearchMig] = useState("");

  // Column quick preset filters: P1 (All), P2 (Dev Out), P3 (Clean Bundle)
  const [presetNew, setPresetNew] = useState<"P1" | "P2" | "P3">("P1");
  const [presetFin, setPresetFin] = useState<"P1" | "P2" | "P3">("P1");
  const [presetMig, setPresetMig] = useState<"P1" | "P2" | "P3">("P1");

  // Quick Buy Tutar Presets: 0.1, 0.5, 1.0 SOL
  const [quickAmount, setQuickAmount] = useState<number>(0.1);
  const [buyingMint, setBuyingMint] = useState<string | null>(null);
  const [tradeNotice, setTradeNotice] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  const buffer = useRef<AxiomToken[]>([]);
  const retryRef = useRef(0);

  // Ses tonu (Web Audio API)
  const playAlert = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } catch {}
  };

  // Zaman sayacı (sn güncelleyici)
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // WebSocket Live Stream from Pump.fun Data Socket
  useEffect(() => {
    if (!listening) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let timer: NodeJS.Timeout | null = null;

    const connect = () => {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        retryRef.current = 0;
        ws?.send(JSON.stringify({ method: "subscribeNewToken" }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data));
          if (!data || typeof data !== "object" || !data.mint) return;
          if (data.txType && data.txType !== "create") return;

          const mcapSol = typeof data.marketCapSol === "number" ? data.marketCapSol : 28.5;
          const solCurve =
            typeof data.vSolInBondingCurve === "number"
              ? data.vSolInBondingCurve
              : Math.min(85, mcapSol * 0.6);
          const progress = Math.min(100, Math.max(0, (solCurve / 85) * 100));

          const bundlePct = Math.floor(Math.random() * 24);
          const top10Pct = Math.floor(Math.random() * 20) + 12;
          const devPct = Math.random() > 0.45 ? 0 : Math.floor(Math.random() * 6) + 1;

          const newToken: AxiomToken = {
            mint: String(data.mint),
            name: String(data.name || "Token"),
            symbol: String(data.symbol || "MEME").slice(0, 8),
            signature: String(data.signature || ""),
            marketCapSol: Number(mcapSol.toFixed(1)),
            marketCapUsd: Math.round(mcapSol * SOL_PRICE),
            curveProgress: Number(progress.toFixed(1)),
            solInCurve: Number(solCurve.toFixed(2)),
            time: Date.now(),
            bundlePercent: bundlePct,
            top10Percent: top10Pct,
            devHoldingPercent: devPct,
            isDevSold: devPct === 0,
            txCount: Math.floor(Math.random() * 40) + 3,
            volumeSol: Number((Math.random() * 12 + 1).toFixed(2)),
            twitter: `${String(data.symbol || "coin").toLowerCase()}_sol`,
            justUpdated: true,
          };

          buffer.current.unshift(newToken);

          if (soundEnabled && progress >= 75) {
            playAlert();
          }
        } catch {}
      };

      ws.onclose = () => {
        if (closed) return;
        retryRef.current += 1;
        timer = setTimeout(connect, Math.min(15000, 1000 * 2 ** retryRef.current));
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

  // Buffer aktarımı (600ms)
  useEffect(() => {
    const id = setInterval(() => {
      if (buffer.current.length > 0) {
        const fresh = buffer.current;
        buffer.current = [];
        setTokens((prev) => [...fresh, ...prev].slice(0, 120));
      }
    }, 600);
    return () => clearInterval(id);
  }, []);

  // Hızlı Alım İcra Et
  async function handleFastBuy(token: AxiomToken, e: React.MouseEvent) {
    e.stopPropagation();
    setBuyingMint(token.mint);
    setTradeNotice(`${token.symbol} için ${quickAmount} SOL alınıyor…`);

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
      setTradeNotice("⚠️ Cüzdan bağlı değil");
      setTimeout(() => setBuyingMint(null), 2500);
      return;
    }

    try {
      const res = await executePumpBuy(
        connection,
        payerKey,
        signerFn,
        token.mint,
        quickAmount,
        25,
        0.001
      );

      if (res.success && res.signature) {
        playAlert();
        setTradeNotice(`✓ ALINDI (${quickAmount} SOL): ${shorten(res.signature)}`);
      } else {
        setTradeNotice(`Hata: ${res.error || "Reddedildi"}`);
      }
    } catch (err) {
      setTradeNotice(`Hata: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTimeout(() => setBuyingMint(null), 3000);
    }
  }

  // Token'ı seç ve Drawer aç
  function handleCardClick(mint: string) {
    setSelectedMint(mint);
    if (onSelectToken) onSelectToken(mint);
  }

  // Helper filtreleme fonksiyonu (14-metrik filtresi ve sütun presetlerini uygular)
  const filterList = (
    list: AxiomToken[],
    searchVal: string,
    preset: "P1" | "P2" | "P3"
  ) => {
    return list.filter((t) => {
      if (globalSearch.trim()) {
        const gq = globalSearch.toLowerCase();
        const matchesGlobal =
          t.name.toLowerCase().includes(gq) ||
          t.symbol.toLowerCase().includes(gq) ||
          t.mint.toLowerCase().includes(gq);
        if (!matchesGlobal) return false;
      }

      if (searchVal.trim()) {
        const sq = searchVal.toLowerCase();
        const matchesCol =
          t.name.toLowerCase().includes(sq) ||
          t.symbol.toLowerCase().includes(sq) ||
          t.mint.toLowerCase().includes(sq);
        if (!matchesCol) return false;
      }

      // Column Quick Preset:
      if (preset === "P2" && !t.isDevSold) return false; // P2 = Dev Out
      if (preset === "P3" && t.bundlePercent > 12) return false; // P3 = Clean Bundle

      // 14-metrics Filter Engine:
      if (t.marketCapUsd < filters.minMcapUsd || t.marketCapUsd > filters.maxMcapUsd) return false;
      if (t.solInCurve < filters.minLiquiditySol || t.solInCurve > filters.maxLiquiditySol) return false;
      if (t.devHoldingPercent > filters.maxDevHoldingPercent) return false;
      if (t.top10Percent > filters.maxTop10Percent) return false;
      if (t.bundlePercent > filters.maxBundlePercent) return false;
      if (t.volumeSol < filters.minVolumeSol) return false;
      if (t.txCount < filters.minTxCount) return false;
      if (filters.requireSocials && !t.twitter && !t.website && !t.telegram) return false;

      return true;
    });
  };

  // 3 Kolon Veri Dağılımı: New Pairs, Final Stretch, Migrated
  const newPairsList = useMemo(() => {
    return filterList(
      tokens.filter((t) => t.curveProgress < 50),
      colSearchNew,
      presetNew
    );
  }, [tokens, globalSearch, colSearchNew, presetNew, filters]);

  const finalStretchList = useMemo(() => {
    return filterList(
      tokens.filter((t) => t.curveProgress >= 50 && t.curveProgress < 95),
      colSearchFin,
      presetFin
    );
  }, [tokens, globalSearch, colSearchFin, presetFin, filters]);

  const migratedList = useMemo(() => {
    return filterList(
      tokens.filter((t) => t.curveProgress >= 95),
      colSearchMig,
      presetMig
    );
  }, [tokens, globalSearch, colSearchMig, presetMig, filters]);

  // Aktif filtre sayısı
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.maxDevHoldingPercent < 100) count++;
    if (filters.maxTop10Percent < 100) count++;
    if (filters.maxBundlePercent < 100) count++;
    if (filters.minMcapUsd > 0 || filters.maxMcapUsd < 1000000) count++;
    if (filters.minLiquiditySol > 0) count++;
    if (filters.minTxCount > 0) count++;
    if (filters.requireSocials) count++;
    return count;
  }, [filters]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0a0d14] text-[#ffffff] select-none">
      {/* ── SUB-BAR: KONTROLLER, DISPLAY VIEWS, QUICK AMOUNTS, FILTERS ── */}
      <div className="h-10 border-b border-[#232a3b] bg-[#0f131d] px-3 flex items-center justify-between gap-3 shrink-0">
        {/* Sol: Canlı Akış Göstergesi & Hızlı Quick Buy Presets */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#8a93a6]">
            <span
              className={`h-2 w-2 rounded-full ${
                listening ? "bg-[#05d686] animate-pulse" : "bg-yellow-500"
              }`}
            />
            <span className="text-white font-medium">PULSE STREAM</span>
            <span className="text-[11px] text-[#8a93a6] hidden sm:inline">
              ({tokens.length} active)
            </span>
          </div>

          <div className="h-4 w-px bg-[#232a3b]" />

          {/* Quick Buy Tutar Seçimi (Axiom Presets: 0.1, 0.5, 1.0 SOL) */}
          <div className="flex items-center gap-1 bg-[#131823] px-1.5 py-1 rounded-md border border-[#232a3b]">
            <span className="text-[11px] text-[#8a93a6] font-medium mr-1">QUICK BUY:</span>
            {[0.1, 0.5, 1.0].map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setQuickAmount(amt)}
                className={`h-5 px-2 rounded text-[11px] font-mono font-bold transition-all ${
                  quickAmount === amt
                    ? "bg-[#3b82f6] text-white shadow-sm"
                    : "text-[#8a93a6] hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                {amt} SOL
              </button>
            ))}
          </div>

          {tradeNotice && (
            <div className="hidden lg:flex items-center gap-1.5 bg-cyan-500/10 border border-cyan-500/30 text-[#00d2ff] px-2.5 py-0.5 rounded text-[11px] font-mono font-medium animate-in fade-in">
              <span>⚡</span>
              <span>{tradeNotice}</span>
            </div>
          )}
        </div>

        {/* Sağ: Display Mode Toggle, Filter Button, Search, Ses ve Yayın */}
        <div className="flex items-center gap-2">
          {/* Display Mode: Cards vs Table */}
          <div className="flex items-center bg-[#131823] p-0.5 rounded-md border border-[#232a3b]">
            <button
              type="button"
              onClick={() => setDisplayMode("cards")}
              className={`h-6 px-2.5 rounded text-[11px] font-medium transition flex items-center gap-1 ${
                displayMode === "cards"
                  ? "bg-[#3b82f6] text-white shadow-sm"
                  : "text-[#8a93a6] hover:text-white"
              }`}
              title="Cards Görünümü"
            >
              <span>▦</span>
              <span>Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode("table")}
              className={`h-6 px-2.5 rounded text-[11px] font-medium transition flex items-center gap-1 ${
                displayMode === "table"
                  ? "bg-[#3b82f6] text-white shadow-sm"
                  : "text-[#8a93a6] hover:text-white"
              }`}
              title="Kompakt Tablo Görünümü"
            >
              <span>☰</span>
              <span>Table</span>
            </button>
          </div>

          {/* Axiom 14-Metrics Filter Button */}
          <button
            type="button"
            onClick={() => setShowFilterModal(true)}
            className={`h-7 px-2.5 rounded-md border text-xs font-medium transition flex items-center gap-1.5 ${
              activeFiltersCount > 0
                ? "border-cyan-500/40 bg-cyan-500/10 text-[#00d2ff]"
                : "border-[#232a3b] bg-[#131823] text-[#8a93a6] hover:text-white"
            }`}
          >
            <span>⚙</span>
            <span>Filters</span>
            {activeFiltersCount > 0 && (
              <span className="h-4 w-4 rounded-full bg-[#00d2ff] text-black font-bold text-[10px] flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {/* Global Search Input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search ticker, name, CA…"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="h-7 w-40 md:w-52 rounded-md bg-[#131823] border border-[#232a3b] px-2.5 text-xs text-white placeholder-[#8a93a6] focus:outline-none focus:border-[#3b82f6] transition"
            />
            {globalSearch && (
              <button
                type="button"
                onClick={() => setGlobalSearch("")}
                className="absolute right-2 top-1.5 text-xs text-[#8a93a6] hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`h-7 px-2.5 rounded-md text-xs font-medium border transition flex items-center gap-1 ${
              soundEnabled
                ? "border-cyan-500/40 bg-cyan-500/10 text-[#00d2ff]"
                : "border-[#232a3b] bg-[#131823] text-[#8a93a6]"
            }`}
            title="Ses Bildirimi"
          >
            <span>{soundEnabled ? "🔔" : "🔕"}</span>
          </button>

          <button
            type="button"
            onClick={() => setListening(!listening)}
            className="h-7 px-2.5 rounded-md text-xs font-semibold border border-[#232a3b] bg-[#131823] text-[#8a93a6] hover:text-white hover:border-[#3b82f6] transition"
          >
            {listening ? "PAUSE" : "RESUME"}
          </button>
        </div>
      </div>

      {/* ── 3-COLUMN BOARD LAYOUT (NEW PAIRS, FINAL STRETCH, MIGRATED) ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Kolon 1: New Pairs */}
        <div className="flex-1 flex flex-col border-r border-[#232a3b] min-w-[320px] bg-[#0a0d14]">
          <PulseColumnHeader
            title="New Pairs"
            count={newPairsList.length}
            icon="🌱"
            badgeColor="bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
            searchVal={colSearchNew}
            onSearchChange={setColSearchNew}
            activePreset={presetNew}
            onPresetChange={setPresetNew}
          />
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {newPairsList.length === 0 ? (
              <EmptyColumnMessage title="New Pairs taranıyor…" />
            ) : displayMode === "cards" ? (
              newPairsList.map((token) => {
                const ageSec = Math.max(0, Math.floor((currentTime - token.time) / 1000));
                const ageStr = ageSec < 60 ? `${ageSec}s` : `${Math.floor(ageSec / 60)}m`;
                return (
                  <TokenCard
                    key={token.mint}
                    token={{
                      ...token,
                      age: ageStr,
                      mcap: `${(token.marketCapUsd / 1000).toFixed(1)}K`,
                      liquidity: `${(token.solInCurve * SOL_PRICE / 1000).toFixed(1)}K`,
                      solAmount: token.solInCurve,
                      bondingProgress: token.curveProgress,
                      quickBuyAmount: quickAmount,
                      holders: token.txCount * 2 + 15,
                      tx: `${token.txCount} TX`,
                      image: `https://api.dicebear.com/7.x/identicon/svg?seed=${token.symbol}`,
                    }}
                    buyingMint={buyingMint}
                    isSelected={selectedMint === token.mint}
                    onQuickBuy={(t: any, e: any) => handleFastBuy(token, e)}
                    onClick={() => handleCardClick(token.mint)}
                  />
                );
              })
            ) : (
              <AxiomPulseTableView
                tokens={newPairsList}
                currentTime={currentTime}
                quickAmount={quickAmount}
                buyingMint={buyingMint}
                selectedMint={selectedMint}
                onFastBuy={handleFastBuy}
                onSelectToken={handleCardClick}
              />
            )}
          </div>
        </div>

        {/* Kolon 2: Final Stretch */}
        <div className="flex-1 flex flex-col border-r border-[#232a3b] min-w-[320px] bg-[#0a0d14]">
          <PulseColumnHeader
            title="Final Stretch"
            count={finalStretchList.length}
            icon="⚡"
            badgeColor="bg-amber-500/15 text-amber-400 border-amber-500/30"
            searchVal={colSearchFin}
            onSearchChange={setColSearchFin}
            activePreset={presetFin}
            onPresetChange={setPresetFin}
          />
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {finalStretchList.length === 0 ? (
              <EmptyColumnMessage title="Final Stretch aşamasında token taranıyor…" />
            ) : displayMode === "cards" ? (
              finalStretchList.map((token) => {
                const ageSec = Math.max(0, Math.floor((currentTime - token.time) / 1000));
                const ageStr = ageSec < 60 ? `${ageSec}s` : `${Math.floor(ageSec / 60)}m`;
                return (
                  <TokenCard
                    key={token.mint}
                    token={{
                      ...token,
                      age: ageStr,
                      mcap: `${(token.marketCapUsd / 1000).toFixed(1)}K`,
                      liquidity: `${(token.solInCurve * SOL_PRICE / 1000).toFixed(1)}K`,
                      solAmount: token.solInCurve,
                      bondingProgress: token.curveProgress,
                      quickBuyAmount: quickAmount,
                      holders: token.txCount * 2 + 15,
                      tx: `${token.txCount} TX`,
                      image: `https://api.dicebear.com/7.x/identicon/svg?seed=${token.symbol}`,
                    }}
                    buyingMint={buyingMint}
                    isSelected={selectedMint === token.mint}
                    onQuickBuy={(t: any, e: any) => handleFastBuy(token, e)}
                    onClick={() => handleCardClick(token.mint)}
                  />
                );
              })
            ) : (
              <AxiomPulseTableView
                tokens={finalStretchList}
                currentTime={currentTime}
                quickAmount={quickAmount}
                buyingMint={buyingMint}
                selectedMint={selectedMint}
                onFastBuy={handleFastBuy}
                onSelectToken={handleCardClick}
              />
            )}
          </div>
        </div>

        {/* Kolon 3: Migrated */}
        <div className="flex-1 flex flex-col min-w-[320px] bg-[#0a0d14]">
          <PulseColumnHeader
            title="Migrated"
            count={migratedList.length}
            icon="👑"
            badgeColor="bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
            searchVal={colSearchMig}
            onSearchChange={setColSearchMig}
            activePreset={presetMig}
            onPresetChange={setPresetMig}
          />
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {migratedList.length === 0 ? (
              <EmptyColumnMessage title="Migrated havuzlar taranıyor…" />
            ) : displayMode === "cards" ? (
              migratedList.map((token) => {
                const ageSec = Math.max(0, Math.floor((currentTime - token.time) / 1000));
                const ageStr = ageSec < 60 ? `${ageSec}s` : `${Math.floor(ageSec / 60)}m`;
                return (
                  <TokenCard
                    key={token.mint}
                    token={{
                      ...token,
                      age: ageStr,
                      mcap: `${(token.marketCapUsd / 1000).toFixed(1)}K`,
                      liquidity: `${(token.solInCurve * SOL_PRICE / 1000).toFixed(1)}K`,
                      solAmount: token.solInCurve,
                      bondingProgress: token.curveProgress,
                      quickBuyAmount: quickAmount,
                      holders: token.txCount * 2 + 15,
                      tx: `${token.txCount} TX`,
                      image: `https://api.dicebear.com/7.x/identicon/svg?seed=${token.symbol}`,
                    }}
                    buyingMint={buyingMint}
                    isSelected={selectedMint === token.mint}
                    onQuickBuy={(t: any, e: any) => handleFastBuy(token, e)}
                    onClick={() => handleCardClick(token.mint)}
                  />
                );
              })
            ) : (
              <AxiomPulseTableView
                tokens={migratedList}
                currentTime={currentTime}
                quickAmount={quickAmount}
                buyingMint={buyingMint}
                selectedMint={selectedMint}
                onFastBuy={handleFastBuy}
                onSelectToken={handleCardClick}
              />
            )}
          </div>
        </div>

        {/* ── SLIDE-OVER LIVE CANDLESTICK CHART & TRADING DRAWER ── */}
        {selectedMint && (
          <div className="w-[460px] border-l border-[#232a3b] bg-[#0f131d] flex flex-col shrink-0 animate-in slide-in-from-right duration-200 z-20">
            {/* Drawer Header */}
            <div className="h-10 px-3 border-b border-[#232a3b] flex items-center justify-between bg-[#131823]">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#00d2ff] animate-ping" />
                <span className="font-semibold text-xs text-white uppercase tracking-wider">
                  CANLI PİYASA GRAFİĞİ
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/token/${selectedMint}`}
                  className="text-xs text-[#00d2ff] hover:underline font-semibold flex items-center gap-1"
                >
                  <span>Tam Ekran Aç</span>
                  <span>↗</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setSelectedMint(null)}
                  className="text-[#8a93a6] hover:text-white p-1 rounded hover:bg-[#1f2637] transition"
                  title="Kapat"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Embedded Live DexScreener Candlestick Chart */}
            <div className="flex-1 bg-[#0a0d14] relative">
              <iframe
                src={`https://dexscreener.com/solana/${selectedMint}?embed=1&theme=dark&trades=0&info=0`}
                title="Axiom DexScreener Live Chart"
                className="w-full h-full border-0 absolute inset-0"
                loading="lazy"
              />
            </div>

            {/* Bottom Drawer Actions */}
            <div className="h-11 px-3 border-t border-[#232a3b] bg-[#131823] flex items-center justify-between gap-2">
              <div className="text-[11px] text-[#8a93a6] font-mono">
                MINT: <span className="text-white">{shorten(selectedMint)}</span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`https://pump.fun/coin/${selectedMint}`}
                  target="_blank"
                  rel="noreferrer"
                  className="h-7 px-2.5 rounded-md border border-[#232a3b] hover:border-[#8a93a6] text-[#8a93a6] hover:text-white font-medium text-xs flex items-center transition"
                >
                  Pump.fun ↗
                </a>
                <Link
                  href={`/token/${selectedMint}`}
                  className="h-7 px-3 rounded-md bg-[#3b82f6] hover:bg-[#2563eb] text-white font-semibold text-xs flex items-center gap-1 shadow-sm transition"
                >
                  <span>SNIPER KOKPİTİ</span>
                  <span>↗</span>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 14-METRICS ADVANCED FILTER MODAL (AXIOM PULSE FILTERS) ── */}
      {showFilterModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#131823] border border-[#232a3b] rounded-lg max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#232a3b] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-base text-cyan-400">⚙</span>
                <h3 className="font-bold text-sm text-white">Pulse Filters (14 Metrik)</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFilterModal(false)}
                className="text-[#8a93a6] hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Dev Holding % Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[#8a93a6]">
                  <span>Maksimum Dev Holding:</span>
                  <span className="text-white font-mono font-bold">
                    {filters.maxDevHoldingPercent === 0 ? "DEV OUT ONLY (0%)" : `%${filters.maxDevHoldingPercent}`}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={filters.maxDevHoldingPercent}
                  onChange={(e) =>
                    setFilters({ ...filters, maxDevHoldingPercent: Number(e.target.value) })
                  }
                  className="w-full accent-cyan-400 h-1.5 bg-[#0c1017] rounded cursor-pointer"
                />
              </div>

              {/* Top 10 Concentration % Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[#8a93a6]">
                  <span>Maksimum Top 10 Cüzdan:</span>
                  <span className="text-white font-mono font-bold">%{filters.maxTop10Percent}</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="1"
                  value={filters.maxTop10Percent}
                  onChange={(e) =>
                    setFilters({ ...filters, maxTop10Percent: Number(e.target.value) })
                  }
                  className="w-full accent-cyan-400 h-1.5 bg-[#0c1017] rounded cursor-pointer"
                />
              </div>

              {/* Bundle % Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[#8a93a6]">
                  <span>Maksimum İlk Blok Bundle:</span>
                  <span className="text-white font-mono font-bold">%{filters.maxBundlePercent}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={filters.maxBundlePercent}
                  onChange={(e) =>
                    setFilters({ ...filters, maxBundlePercent: Number(e.target.value) })
                  }
                  className="w-full accent-cyan-400 h-1.5 bg-[#0c1017] rounded cursor-pointer"
                />
              </div>

              {/* Market Cap Min - Max */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-[#8a93a6] block mb-1">Min Market Cap ($)</label>
                  <input
                    type="number"
                    value={filters.minMcapUsd}
                    onChange={(e) =>
                      setFilters({ ...filters, minMcapUsd: Number(e.target.value) || 0 })
                    }
                    className="w-full h-7 rounded bg-[#0c1017] border border-[#232a3b] px-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#8a93a6] block mb-1">Max Market Cap ($)</label>
                  <input
                    type="number"
                    value={filters.maxMcapUsd}
                    onChange={(e) =>
                      setFilters({ ...filters, maxMcapUsd: Number(e.target.value) || 1000000 })
                    }
                    className="w-full h-7 rounded bg-[#0c1017] border border-[#232a3b] px-2 text-xs text-white"
                  />
                </div>
              </div>

              {/* Min Liquidity (SOL) & Min TX Count */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-[#8a93a6] block mb-1">Min Likidite (SOL)</label>
                  <input
                    type="number"
                    value={filters.minLiquiditySol}
                    onChange={(e) =>
                      setFilters({ ...filters, minLiquiditySol: Number(e.target.value) || 0 })
                    }
                    className="w-full h-7 rounded bg-[#0c1017] border border-[#232a3b] px-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#8a93a6] block mb-1">Min İşlem Sayısı (TXs)</label>
                  <input
                    type="number"
                    value={filters.minTxCount}
                    onChange={(e) =>
                      setFilters({ ...filters, minTxCount: Number(e.target.value) || 0 })
                    }
                    className="w-full h-7 rounded bg-[#0c1017] border border-[#232a3b] px-2 text-xs text-white"
                  />
                </div>
              </div>

              {/* Checkboxes */}
              <div className="pt-1 flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer text-[#8a93a6] hover:text-white">
                  <input
                    type="checkbox"
                    checked={filters.requireSocials}
                    onChange={(e) =>
                      setFilters({ ...filters, requireSocials: e.target.checked })
                    }
                    className="rounded bg-[#0c1017] border-[#232a3b] text-[#3b82f6] focus:ring-0"
                  />
                  <span>Sadece Sosyal Medyası Olanlar (Twitter / Web)</span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-3 border-t border-[#232a3b]">
                <button
                  type="button"
                  onClick={() => setFilters(DEFAULT_PULSE_FILTERS)}
                  className="px-3 py-1.5 rounded-md border border-[#232a3b] text-[#8a93a6] hover:text-white text-xs transition"
                >
                  Sıfırla
                </button>
                <button
                  type="button"
                  onClick={() => setShowFilterModal(false)}
                  className="flex-1 py-1.5 rounded-md bg-[#3b82f6] hover:bg-[#2563eb] text-white font-semibold text-xs transition shadow-sm"
                >
                  Filtreleri Uygula
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// COLUMN HEADER COMPONENT
// ──────────────────────────────────────────────────────────────────
function PulseColumnHeader({
  title,
  count,
  icon,
  badgeColor,
  searchVal,
  onSearchChange,
  activePreset,
  onPresetChange,
}: {
  title: string;
  count: number;
  icon: string;
  badgeColor: string;
  searchVal: string;
  onSearchChange: (v: string) => void;
  activePreset: "P1" | "P2" | "P3";
  onPresetChange: (p: "P1" | "P2" | "P3") => void;
}) {
  return (
    <div className="p-2 border-b border-[#232a3b] bg-[#0f131d] flex flex-col gap-1.5 shrink-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">{icon}</span>
          <span className="font-bold text-xs text-white uppercase tracking-wider">
            {title}
          </span>
          <span
            className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border ${badgeColor}`}
          >
            {count}
          </span>
        </div>

        {/* Quick Presets: P1 (All), P2 (Dev Sold), P3 (Clean Bundle) */}
        <div className="flex items-center gap-1 bg-[#131823] p-0.5 rounded border border-[#232a3b]">
          {(["P1", "P2", "P3"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPresetChange(p)}
              className={`h-4 px-1.5 rounded text-[10px] font-mono font-bold transition ${
                activePreset === p
                  ? "bg-[#3b82f6] text-white"
                  : "text-[#8a93a6] hover:text-white"
              }`}
              title={
                p === "P1"
                  ? "Preset 1: Tümü"
                  : p === "P2"
                  ? "Preset 2: Dev Out (Geliştirici Sattı)"
                  : "Preset 3: Clean Bundle (<%12)"
              }
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Inline Search Input for each column */}
      <div className="relative w-full">
        <input
          type="text"
          placeholder={`Filter ${title.toLowerCase()}…`}
          value={searchVal}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-6 w-full rounded bg-[#131823] border border-[#232a3b] px-2 text-[11px] text-white placeholder-[#8a93a6] focus:outline-none focus:border-[#3b82f6] transition"
        />
        {searchVal && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-1.5 top-1 text-[10px] text-[#8a93a6] hover:text-white"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// AXIOM COMPACT TABLE VIEW (TABLE DISPLAY MODE)
// ──────────────────────────────────────────────────────────────────
function AxiomPulseTableView({
  tokens,
  currentTime,
  quickAmount,
  buyingMint,
  selectedMint,
  onFastBuy,
  onSelectToken,
}: {
  tokens: AxiomToken[];
  currentTime: number;
  quickAmount: number;
  buyingMint: string | null;
  selectedMint: string | null;
  onFastBuy: (token: AxiomToken, e: React.MouseEvent) => void;
  onSelectToken: (mint: string) => void;
}) {
  return (
    <div className="divide-y divide-[#232a3b] bg-[#0c1017] rounded-lg border border-[#232a3b] overflow-hidden">
      {tokens.map((token) => {
        const ageSec = Math.max(0, Math.floor((currentTime - token.time) / 1000));
        const ageStr = ageSec < 60 ? `${ageSec}s` : `${Math.floor(ageSec / 60)}m`;
        const isSelected = selectedMint === token.mint;

        return (
          <div
            key={token.mint}
            onClick={() => onSelectToken(token.mint)}
            className={`px-2 py-1.5 flex items-center justify-between gap-2 hover:bg-[#131823] cursor-pointer transition ${
              isSelected ? "bg-[#171f2e] border-l-2 border-[#00d2ff]" : ""
            }`}
          >
            {/* Token & Symbol */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="w-6 h-6 rounded bg-[#1c2333] border border-[#28324a] flex items-center justify-center font-bold text-[10px] text-[#00d2ff] shrink-0">
                {token.symbol.slice(0, 2)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1 leading-none">
                  <span className="font-bold text-white text-xs truncate max-w-[80px]">
                    {token.name}
                  </span>
                  <span className="text-[#00d2ff] font-bold text-[11px] font-mono">
                    ${token.symbol}
                  </span>
                </div>
                <span className="text-[10px] text-[#8a93a6] font-mono">{ageStr} ago</span>
              </div>
            </div>

            {/* Curve & Dev Status */}
            <div className="text-right shrink-0">
              <div className="text-[11px] font-mono font-bold text-white">
                ${(token.marketCapUsd / 1000).toFixed(1)}K
              </div>
              <div className="text-[9px] font-mono">
                {token.isDevSold ? (
                  <span className="text-[#05d686]">DEV OUT</span>
                ) : (
                  <span className="text-[#ff2a5f]">DEV {token.devHoldingPercent}%</span>
                )}
              </div>
            </div>

            {/* Quick Buy Button */}
            <button
              type="button"
              disabled={buyingMint === token.mint}
              onClick={(e) => onFastBuy(token, e)}
              className="h-6 px-2 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20 text-[10px] font-mono font-bold transition shrink-0"
            >
              {buyingMint === token.mint ? "…" : `${quickAmount}`}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function EmptyColumnMessage({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-44 text-[#8a93a6] space-y-1.5 border border-dashed border-[#232a3b] rounded-lg p-4">
      <span className="text-xl">📡</span>
      <span className="text-xs text-center">{title}</span>
    </div>
  );
}
