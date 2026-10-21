"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { loadHotWallet } from "@/lib/hotWallet";
import { shorten } from "@/components/ui";
import {
  DEFAULT_TRADING_PRESETS,
  TradingPreset,
  loadTradingPresets,
  saveTradingPresets,
} from "@/lib/presets";
import { useSolanaNetwork } from "@/lib/networkContext";
import {
  AutoSniperConfig,
  DEFAULT_AUTO_SNIPER_CONFIG,
  loadAutoSniperConfig,
  saveAutoSniperConfig,
} from "@/lib/autoSniper";

import AxiomTerminalView from "@/components/AxiomTerminalView";
import J7SocialTracker from "@/components/J7SocialTracker";
import PumpLaunch from "@/components/PumpLaunch";
import MultiWalletManager from "@/components/MultiWalletManager";
import VolumeBotManager from "@/components/VolumeBotManager";
import RaydiumLiquidity from "@/components/RaydiumLiquidity";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

export type ShellTab =
  | "pulse"
  | "discover"
  | "trackers"
  | "perpetuals"
  | "predictions"
  | "portfolio"
  | "deployer"
  | "multi-wallet"
  | "volume-bot"
  | "raydium";

export default function Home() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { network, setNetwork, rpcUrl, customRpcUrl, setCustomRpcUrl, resetDefaultRpc } = useSolanaNetwork();

  const [activeTab, setActiveTab] = useState<ShellTab>("pulse");
  const [walletBal, setWalletBal] = useState<number | null>(null);
  const [airdropBusy, setAirdropBusy] = useState(false);
  const [airdropMsg, setAirdropMsg] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [hotWalletKey, setHotWalletKey] = useState<string | null>(null);

  // Axiom Trading Presets (P1, P2, P3) & Settings Modal
  const [presets, setPresets] = useState<TradingPreset[]>(DEFAULT_TRADING_PRESETS);
  const [activePresetId, setActivePresetId] = useState<"P1" | "P2" | "P3">("P1");
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsActiveTab, setSettingsActiveTab] = useState<"presets" | "network" | "autosnipe">("presets");
  const [editingPresetTab, setEditingPresetTab] = useState<"P1" | "P2" | "P3">("P1");
  const [autoSniperCfg, setAutoSniperCfg] = useState<AutoSniperConfig>(DEFAULT_AUTO_SNIPER_CONFIG);
  const [customRpcInput, setCustomRpcInput] = useState("");

  // Modals
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Load Presets & Hot Wallet from storage on mount (prevents SSR hydration mismatch)
  useEffect(() => {
    setMounted(true);
    setPresets(loadTradingPresets());
    setAutoSniperCfg(loadAutoSniperConfig());
    const hw = loadHotWallet();
    if (hw) {
      setHotWalletKey(hw.publicKey.toBase58());
    }
  }, []);

  function updateAutoSniper(field: keyof AutoSniperConfig, val: any) {
    const updated = { ...autoSniperCfg, [field]: val };
    setAutoSniperCfg(updated);
    saveAutoSniperConfig(updated);
  }

  const activePreset = presets.find((p) => p.id === activePresetId) || presets[0];

  // Cüzdan Bakiyesini Güncelle
  useEffect(() => {
    if (publicKey) {
      connection
        .getBalance(publicKey)
        .then((l) => setWalletBal(l / LAMPORTS_PER_SOL))
        .catch(() => setWalletBal(null));
    } else {
      const hot = loadHotWallet();
      if (hot) {
        connection
          .getBalance(hot.publicKey)
          .then((l) => setWalletBal(l / LAMPORTS_PER_SOL))
          .catch(() => setWalletBal(null));
      }
    }
  }, [connection, publicKey, activeTab]);

  // Keyboard shortcut: ⌘K or Ctrl+K for search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowSearchModal((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Hızlı Devnet Airdrop
  async function handleQuickAirdrop() {
    const target = publicKey || loadHotWallet()?.publicKey;
    if (!target) {
      alert("Lütfen önce Phantom cüzdanınızı bağlayın veya Hızlı Cüzdan oluşturun.");
      return;
    }
    setAirdropBusy(true);
    setAirdropMsg(null);
    try {
      const sig = await connection.requestAirdrop(target, LAMPORTS_PER_SOL);
      const bh = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
      setAirdropMsg("+1 SOL!");
      const bal = await connection.getBalance(target);
      setWalletBal(bal / LAMPORTS_PER_SOL);
      setTimeout(() => setAirdropMsg(null), 3000);
    } catch {
      alert("Devnet airdrop limiti dolmuş olabilir. Solana official faucet kullanabilirsiniz.");
    } finally {
      setAirdropBusy(false);
    }
  }

  // Preset güncelleme
  function updateEditingPreset(field: keyof TradingPreset, value: any) {
    const updated = presets.map((p) => {
      if (p.id === editingPresetTab) {
        return { ...p, [field]: value };
      }
      return p;
    });
    setPresets(updated);
    saveTradingPresets(updated);
  }

  const activeWalletKey = mounted
    ? (publicKey ? publicKey.toBase58() : hotWalletKey)
    : null;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0a0d14] text-[#ffffff] font-sans select-none flex-col">
      {/* ── 1. AXIOM HEADER & NAVIGATION BAR (44px) ── */}
      <header className="h-11 border-b border-[#232a3b] bg-[#0f131d] px-3 flex items-center justify-between shrink-0 z-30">
        {/* Left Side: Axiom Minimalist Triangle Logo + Navigation Links */}
        <div className="flex items-center gap-6">
          {/* Minimalist Triangle Brandmark */}
          <div
            className="flex items-center gap-2 cursor-pointer group"
            onClick={() => setActiveTab("pulse")}
          >
            <div className="w-6 h-6 flex items-center justify-center transition-transform group-hover:scale-105">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M12 2L22 20H2L12 2Z"
                  fill="url(#axiom-gradient)"
                  stroke="#00d2ff"
                  strokeWidth="1.5"
                />
                <defs>
                  <linearGradient id="axiom-gradient" x1="12" y1="2" x2="12" y2="20" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#00d2ff" stopOpacity="0.8" />
                    <stop stopColor="#3b82f6" stopOpacity="0.25" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div className="flex items-baseline gap-1 font-mono">
              <span className="font-extrabold text-sm tracking-wider text-white">NOX</span>
              <span className="text-[10px] font-bold text-[#00d2ff]">TRADE</span>
            </div>
          </div>

          {/* Navigation Links with Active Cyan Bottom Indicator */}
          <nav className="hidden lg:flex items-center gap-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab("pulse")}
              className={`relative h-11 px-3 flex items-center gap-1.5 transition-colors ${
                activeTab === "pulse"
                  ? "text-[#00d2ff] font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#00d2ff] after:shadow-[0_0_8px_#00d2ff]"
                  : "text-[#8a93a6] hover:text-white"
              }`}
            >
              <span>⚡</span>
              <span>Pulse</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("discover")}
              className={`relative h-11 px-3 flex items-center gap-1.5 transition-colors ${
                activeTab === "discover"
                  ? "text-[#00d2ff] font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#00d2ff] after:shadow-[0_0_8px_#00d2ff]"
                  : "text-[#8a93a6] hover:text-white"
              }`}
            >
              <span>🔥</span>
              <span>Discover</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("trackers")}
              className={`relative h-11 px-3 flex items-center gap-1.5 transition-colors ${
                activeTab === "trackers"
                  ? "text-[#00d2ff] font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#00d2ff] after:shadow-[0_0_8px_#00d2ff]"
                  : "text-[#8a93a6] hover:text-white"
              }`}
            >
              <span>🎯</span>
              <span>Trackers</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("perpetuals")}
              className={`relative h-11 px-3 flex items-center gap-1.5 transition-colors ${
                activeTab === "perpetuals"
                  ? "text-[#00d2ff] font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#00d2ff] after:shadow-[0_0_8px_#00d2ff]"
                  : "text-[#8a93a6] hover:text-white"
              }`}
            >
              <span>📈</span>
              <span>Perpetuals</span>
              <span className="text-[9px] px-1 py-0.2 rounded bg-cyan-500/10 text-cyan-400 font-mono">SOON</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("predictions")}
              className={`relative h-11 px-3 flex items-center gap-1.5 transition-colors ${
                activeTab === "predictions"
                  ? "text-[#00d2ff] font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#00d2ff] after:shadow-[0_0_8px_#00d2ff]"
                  : "text-[#8a93a6] hover:text-white"
              }`}
            >
              <span>🎲</span>
              <span>Predictions</span>
              <span className="text-[9px] px-1 py-0.2 rounded bg-purple-500/10 text-purple-400 font-mono">SOON</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("portfolio")}
              className={`relative h-11 px-3 flex items-center gap-1.5 transition-colors ${
                activeTab === "portfolio"
                  ? "text-[#00d2ff] font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#00d2ff] after:shadow-[0_0_8px_#00d2ff]"
                  : "text-[#8a93a6] hover:text-white"
              }`}
            >
              <span>💼</span>
              <span>Portfolio</span>
            </button>

            <div className="h-4 w-px bg-[#232a3b] mx-1" />

            {/* Platform Utilities */}
            <button
              type="button"
              onClick={() => setActiveTab("deployer")}
              className={`relative h-11 px-2.5 flex items-center gap-1 transition-colors ${
                activeTab === "deployer"
                  ? "text-white font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-white"
                  : "text-[#8a93a6] hover:text-white"
              }`}
            >
              <span>🚀</span>
              <span>Deployer</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("multi-wallet")}
              className={`relative h-11 px-2.5 flex items-center gap-1 transition-colors ${
                activeTab === "multi-wallet"
                  ? "text-[#00d2ff] font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#00d2ff]"
                  : "text-[#8a93a6] hover:text-white"
              }`}
            >
              <span>👥</span>
              <span>Multi-Wallet</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("volume-bot")}
              className={`relative h-11 px-2.5 flex items-center gap-1 transition-colors ${
                activeTab === "volume-bot"
                  ? "text-amber-400 font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-amber-400"
                  : "text-[#8a93a6] hover:text-white"
              }`}
            >
              <span>📊</span>
              <span>Volume Bot</span>
            </button>
          </nav>
        </div>

        {/* Right Side: Quick Search, Balance Pills, Faucet, Deposit, Settings Gear, Wallet */}
        <div className="flex items-center gap-2.5">
          {/* Quick Search Bar with shortcut */}
          <div
            onClick={() => setShowSearchModal(true)}
            className="hidden xl:flex items-center gap-2 bg-[#131823] border border-[#232a3b] hover:border-[#3b82f6] rounded-md px-2.5 h-7 text-xs text-[#8a93a6] cursor-pointer transition"
          >
            <span>🔍</span>
            <span className="text-[#8a93a6] w-32 truncate">Search pairs, CA…</span>
            <span className="text-[10px] bg-[#0c1017] px-1 py-0.5 rounded border border-[#232a3b] font-mono">
              ⌘K
            </span>
          </div>

          {/* SOL & USDC Balance Pills */}
          <div className="hidden sm:flex items-center gap-1 bg-[#131823] border border-[#232a3b] px-2 py-1 rounded-md text-xs font-mono">
            <span className="text-[#8a93a6]">SOL:</span>
            <span className="text-white font-bold">
              {walletBal !== null ? walletBal.toFixed(2) : "0.00"}
            </span>
            <span className="text-[#232a3b] mx-1">|</span>
            <span className="text-[#8a93a6]">USDC:</span>
            <span className="text-white font-bold">
              ${walletBal !== null ? (walletBal * 184).toFixed(0) : "0"}
            </span>
          </div>

          {/* Solana Cluster Switcher (Mainnet vs Devnet) */}
          <button
            type="button"
            onClick={() => setNetwork(network === "mainnet-beta" ? "devnet" : "mainnet-beta")}
            className={`h-7 px-2.5 rounded-md border text-xs font-mono font-bold flex items-center gap-1.5 transition ${
              network === "mainnet-beta"
                ? "border-emerald-500/40 bg-emerald-500/10 text-[#00ff88]"
                : "border-amber-500/40 bg-amber-500/10 text-amber-300"
            }`}
            title="Tıkla ve Ağı Değiştir (Mainnet / Devnet)"
          >
            <span className={`w-2 h-2 rounded-full ${network === "mainnet-beta" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
            <span>{network === "mainnet-beta" ? "MAINNET" : "DEVNET"}</span>
          </button>

          {/* Quick +1 SOL Faucet (Devnet only) */}
          {network === "devnet" && (
            <button
              type="button"
              onClick={handleQuickAirdrop}
              disabled={airdropBusy}
              className="flex items-center gap-1 h-7 px-2.5 rounded-md border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-[#00d2ff] font-mono font-bold text-xs transition disabled:opacity-40"
              title="Devnet test bakiyesi talep et"
            >
              <span>◈</span>
              <span>{airdropBusy ? "..." : airdropMsg || "+1 SOL"}</span>
            </button>
          )}

          {/* Axiom Deposit Button */}
          <button
            type="button"
            onClick={() => setShowDepositModal(true)}
            className="h-7 px-3 rounded-md bg-[#3b82f6] hover:bg-[#2563eb] text-white font-semibold text-xs transition shadow-sm flex items-center gap-1"
          >
            <span>Deposit</span>
          </button>

          {/* Settings Gear Icon (Opens Trading & Preset Settings Modal) */}
          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className="h-7 w-7 rounded-md bg-[#131823] border border-[#232a3b] hover:border-[#3b82f6] text-[#8a93a6] hover:text-white flex items-center justify-center transition"
            title="Trading Ayarları & Preset Yapılandırması"
          >
            <span>⚙</span>
          </button>

          {/* Wallet Multi Button */}
          <WalletMultiButton />
        </div>
      </header>

      {/* ── 2. MAIN DASHBOARD CONTENT AREA ── */}
      <main className="flex-1 flex overflow-hidden w-full relative bg-[#0a0d14]">
        {(activeTab === "pulse" || activeTab === "discover") && (
          <AxiomTerminalView initialTab={activeTab === "discover" ? "discover" : "pulse"} />
        )}

        {activeTab === "trackers" && <J7SocialTracker />}

        {activeTab === "perpetuals" && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-3xl mb-4 text-[#00d2ff]">
              📈
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Axiom Perpetuals Cockpit</h2>
            <p className="text-sm text-[#8a93a6] max-w-md mb-4">
              Solana memecoin ve majör paritelerde 50x kaldıraçlı sürekli vadeli işlem motoru.
            </p>
            <button
              type="button"
              onClick={() => setActiveTab("pulse")}
              className="h-8 px-4 rounded-md bg-[#3b82f6] text-white text-xs font-semibold"
            >
              Pulse Görünümüne Dön
            </button>
          </div>
        )}

        {activeTab === "predictions" && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-3xl mb-4 text-purple-400">
              🎲
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Axiom Predictions Market</h2>
            <p className="text-sm text-[#8a93a6] max-w-md mb-4">
              Pump.fun tokenlarının Raydium mezuniyeti ve piyasa değeri tahmin piyasaları.
            </p>
            <button
              type="button"
              onClick={() => setActiveTab("pulse")}
              className="h-8 px-4 rounded-md bg-[#3b82f6] text-white text-xs font-semibold"
            >
              Pulse Görünümüne Dön
            </button>
          </div>
        )}

        {activeTab === "portfolio" && (
          <div className="flex-1 overflow-y-auto p-4 bg-[#0a0d14]">
            <div className="max-w-5xl mx-auto space-y-4">
              <div className="bg-[#131823] border border-[#232a3b] rounded-lg p-4">
                <h3 className="font-bold text-sm text-white mb-2">Cüzdan Portföy Durumu</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-[#0c1017] p-3 rounded border border-[#1f2637]">
                    <div className="text-[11px] text-[#8a93a6]">Toplam Değer</div>
                    <div className="text-lg font-bold text-white font-mono">
                      ${walletBal !== null ? (walletBal * 184).toFixed(2) : "0.00"}
                    </div>
                  </div>
                  <div className="bg-[#0c1017] p-3 rounded border border-[#1f2637]">
                    <div className="text-[11px] text-[#8a93a6]">Solana Bakiyesi</div>
                    <div className="text-lg font-bold text-[#00d2ff] font-mono">
                      {walletBal !== null ? walletBal.toFixed(3) : "0.000"} SOL
                    </div>
                  </div>
                  <div className="bg-[#0c1017] p-3 rounded border border-[#1f2637]">
                    <div className="text-[11px] text-[#8a93a6]">Ağ Durumu</div>
                    <div className="text-lg font-bold text-[#05d686] font-mono">Solana Devnet</div>
                  </div>
                </div>
              </div>
              <RaydiumLiquidity />
            </div>
          </div>
        )}

        {activeTab === "deployer" && (
          <div className="flex-1 overflow-y-auto p-3 lg:p-4 bg-[#0a0d14]">
            <div className="max-w-4xl mx-auto">
              <PumpLaunch />
            </div>
          </div>
        )}

        {activeTab === "multi-wallet" && (
          <div className="flex-1 overflow-y-auto p-3 lg:p-4 bg-[#0a0d14]">
            <div className="max-w-4xl mx-auto">
              <MultiWalletManager />
            </div>
          </div>
        )}

        {activeTab === "volume-bot" && (
          <div className="flex-1 overflow-y-auto p-3 lg:p-4 bg-[#0a0d14]">
            <div className="max-w-4xl mx-auto">
              <VolumeBotManager />
            </div>
          </div>
        )}

        {activeTab === "raydium" && (
          <div className="flex-1 overflow-y-auto p-3 lg:p-4 bg-[#0a0d14]">
            <div className="max-w-4xl mx-auto">
              <RaydiumLiquidity />
            </div>
          </div>
        )}
      </main>

      {/* ── 3. PERSISTENT FIXED BOTTOM ACTION DOCK / FOOTER BAR ── */}
      <footer className="h-9 border-t border-[#232a3b] bg-[#0c1019] px-3 flex items-center justify-between text-xs text-[#8a93a6] shrink-0 z-30 font-mono">
        {/* Left: Preset Switcher (P1, P2, P3), RPC stream status & Turbo fee */}
        <div className="flex items-center gap-3">
          {/* Preset Buttons */}
          <div className="flex items-center gap-1 bg-[#131823] p-0.5 rounded border border-[#232a3b]">
            {(["P1", "P2", "P3"] as const).map((pid) => (
              <button
                key={pid}
                type="button"
                onClick={() => setActivePresetId(pid)}
                className={`h-5 px-2 rounded text-[10px] font-bold transition ${
                  activePresetId === pid
                    ? "bg-cyan-500/15 text-[#00d2ff] border border-cyan-500/30 shadow-sm"
                    : "text-[#8a93a6] hover:text-white"
                }`}
                title={`${pid}: ${presets.find((p) => p.id === pid)?.name} (${presets.find((p) => p.id === pid)?.buyAmountSol} SOL)`}
              >
                {pid}
              </button>
            ))}
          </div>

          <div className="h-3 w-px bg-[#232a3b]" />

          {/* RPC Stream Status */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#05d686] animate-ping" />
            <span className="text-white font-medium">Solana Devnet</span>
            <span className="text-[#8a93a6] hidden sm:inline">(12ms)</span>
          </div>

          {/* Turbo Priority Fee Pill */}
          <div className="hidden md:flex items-center gap-1 bg-[#131823] px-2 py-0.5 rounded border border-[#232a3b] text-[10px] text-amber-400 font-bold">
            <span>⚡</span>
            <span>TURBO {activePreset.priorityFeeSol} SOL</span>
          </div>

          {/* Bribe / MEV Mode */}
          <div className="hidden lg:flex items-center gap-1 bg-[#131823] px-2 py-0.5 rounded border border-[#232a3b] text-[10px] text-cyan-400 font-bold">
            <span>🛡️</span>
            <span>MEV: {activePreset.mevMode.toUpperCase()}</span>
          </div>
        </div>

        {/* Center: Live Platform Telemetry */}
        <div className="hidden lg:flex items-center gap-3 text-[11px] text-[#8a93a6]">
          <span>TPS: <strong className="text-white">2,890</strong></span>
          <span>•</span>
          <span>Gas: <strong className="text-white">15 gwei</strong></span>
          <span>•</span>
          <span>24h Vol: <strong className="text-[#00d2ff]">$4.2M</strong></span>
        </div>

        {/* Right: Wallet & PnL Status */}
        <div className="flex items-center gap-3 text-[11px]">
          <div className="flex items-center gap-1">
            <span className="text-[#8a93a6]">PnL:</span>
            <span className="text-[#05d686] font-bold">+0.00 SOL ($0.00)</span>
          </div>

          <div className="h-3 w-px bg-[#232a3b]" />

          <div className="text-[11px] text-[#8a93a6]" suppressHydrationWarning>
            {activeWalletKey ? (
              <span className="text-white font-mono">
                {shorten(activeWalletKey)}
              </span>
            ) : (
              <span>Cüzdan Hazır</span>
            )}
          </div>
        </div>
      </footer>

      {/* ── 4. AXIOM TRADING, NETWORK & AUTO-SNIPER SETTINGS MODAL ── */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#131823] border border-[#232a3b] rounded-lg max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#232a3b] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-base text-cyan-400">⚙</span>
                <h3 className="font-bold text-sm text-white">NOX Terminal & Sniper Ayarları</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="text-[#8a93a6] hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {/* Top Navigation Tabs */}
            <div className="flex items-center gap-1.5 border-b border-[#232a3b] pb-2">
              <button
                type="button"
                onClick={() => setSettingsActiveTab("presets")}
                className={`px-3 py-1 text-xs font-bold rounded transition ${
                  settingsActiveTab === "presets"
                    ? "bg-[#3b82f6] text-white"
                    : "text-[#8a93a6] hover:text-white bg-[#0c1017]"
                }`}
              >
                ⚙️ Trading Presets
              </button>
              <button
                type="button"
                onClick={() => setSettingsActiveTab("network")}
                className={`px-3 py-1 text-xs font-bold rounded transition ${
                  settingsActiveTab === "network"
                    ? "bg-[#3b82f6] text-white"
                    : "text-[#8a93a6] hover:text-white bg-[#0c1017]"
                }`}
              >
                🌐 Ağ & Hızlı RPC
              </button>
              <button
                type="button"
                onClick={() => setSettingsActiveTab("autosnipe")}
                className={`px-3 py-1 text-xs font-bold rounded transition ${
                  settingsActiveTab === "autosnipe"
                    ? "bg-[#3b82f6] text-white"
                    : "text-[#8a93a6] hover:text-white bg-[#0c1017]"
                }`}
              >
                ⚡ Auto-Sniper Bot
              </button>
            </div>

            {/* TAB 1: PRESETS */}
            {settingsActiveTab === "presets" && (
              <>
                {/* Preset Selector Tabs */}
                <div className="flex items-center gap-1 bg-[#0c1017] p-1 rounded-md border border-[#232a3b]">
                  {(["P1", "P2", "P3"] as const).map((pid) => (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => setEditingPresetTab(pid)}
                      className={`flex-1 py-1 text-xs font-bold rounded transition ${
                        editingPresetTab === pid
                          ? "bg-[#3b82f6] text-white shadow-sm"
                          : "text-[#8a93a6] hover:text-white"
                      }`}
                    >
                      {pid}: {presets.find((p) => p.id === pid)?.name}
                    </button>
                  ))}
                </div>

                {/* Active Preset Form Fields */}
                {(() => {
                  const current = presets.find((p) => p.id === editingPresetTab) || presets[0];
                  return (
                    <div className="space-y-3.5 text-xs">
                      {/* Preset Name & Buy Amount */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] text-[#8a93a6] block mb-1">Preset Başlığı</label>
                          <input
                            type="text"
                            value={current.name}
                            onChange={(e) => updateEditingPreset("name", e.target.value)}
                            className="w-full h-8 rounded bg-[#0c1017] border border-[#232a3b] px-2.5 text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-[#8a93a6] block mb-1">Varsayılan Alım (SOL)</label>
                          <input
                            type="number"
                            step="0.05"
                            value={current.buyAmountSol}
                            onChange={(e) =>
                              updateEditingPreset("buyAmountSol", Number(e.target.value) || 0.1)
                            }
                            className="w-full h-8 rounded bg-[#0c1017] border border-[#232a3b] px-2.5 text-xs text-white"
                          />
                        </div>
                      </div>

                      {/* Slippage & Priority Fee */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] text-[#8a93a6] block mb-1">Slippage Toleransı (%)</label>
                          <input
                            type="number"
                            value={current.slippagePercent}
                            onChange={(e) =>
                              updateEditingPreset("slippagePercent", Number(e.target.value) || 15)
                            }
                            className="w-full h-8 rounded bg-[#0c1017] border border-[#232a3b] px-2.5 text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-[#8a93a6] block mb-1">Priority Fee (SOL)</label>
                          <input
                            type="number"
                            step="0.001"
                            value={current.priorityFeeSol}
                            onChange={(e) =>
                              updateEditingPreset("priorityFeeSol", Number(e.target.value) || 0.001)
                            }
                            className="w-full h-8 rounded bg-[#0c1017] border border-[#232a3b] px-2.5 text-xs text-white"
                          />
                        </div>
                      </div>

                      {/* Jito MEV Bribe & Protection Mode */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] text-[#8a93a6] block mb-1">Jito MEV Bribe (SOL)</label>
                          <input
                            type="number"
                            step="0.001"
                            value={current.bribeTipSol}
                            onChange={(e) =>
                              updateEditingPreset("bribeTipSol", Number(e.target.value) || 0.001)
                            }
                            className="w-full h-8 rounded bg-[#0c1017] border border-[#232a3b] px-2.5 text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-[#8a93a6] block mb-1">MEV Koruma Modu</label>
                          <select
                            value={current.mevMode}
                            onChange={(e) =>
                              updateEditingPreset("mevMode", e.target.value as "off" | "secure")
                            }
                            className="w-full h-8 rounded bg-[#0c1017] border border-[#232a3b] px-2 text-xs text-white"
                          >
                            <option value="secure">🛡️ Secure (Jito Bundle Koruma)</option>
                            <option value="off">⚡ Off (Hızlı Doğrudan RPC)</option>
                          </select>
                        </div>
                      </div>

                      {/* Auto-Confirm Checkbox */}
                      <div className="pt-1">
                        <label className="flex items-center gap-2 cursor-pointer text-[#8a93a6] hover:text-white">
                          <input
                            type="checkbox"
                            checked={current.autoConfirm}
                            onChange={(e) => updateEditingPreset("autoConfirm", e.target.checked)}
                            className="rounded bg-[#0c1017] border-[#232a3b] text-[#3b82f6] focus:ring-0"
                          />
                          <span>Hızlı Cüzdanda Onay İstemeden Anında Al (Instant Snipe)</span>
                        </label>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}

            {/* TAB 2: NETWORK & RPC */}
            {settingsActiveTab === "network" && (
              <div className="space-y-4 text-xs">
                <div>
                  <label className="text-[11px] text-[#8a93a6] block mb-1.5 font-bold">Solana Ağı (Cluster)</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNetwork("mainnet-beta")}
                      className={`p-2.5 rounded-lg border text-left flex items-center justify-between transition ${
                        network === "mainnet-beta"
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-400 font-bold"
                          : "border-[#232a3b] bg-[#0c1017] text-[#8a93a6]"
                      }`}
                    >
                      <span>🟢 Mainnet-Beta (Canlı)</span>
                      {network === "mainnet-beta" && <span>✓</span>}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNetwork("devnet")}
                      className={`p-2.5 rounded-lg border text-left flex items-center justify-between transition ${
                        network === "devnet"
                          ? "border-amber-500 bg-amber-500/10 text-amber-300 font-bold"
                          : "border-[#232a3b] bg-[#0c1017] text-[#8a93a6]"
                      }`}
                    >
                      <span>🟡 Devnet (Testnet)</span>
                      {network === "devnet" && <span>✓</span>}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] text-[#8a93a6] font-bold">Özel RPC URL (Helius, QuickNode vb.)</label>
                    {customRpcUrl && (
                      <button
                        type="button"
                        onClick={resetDefaultRpc}
                        className="text-[10px] text-rose-400 hover:underline"
                      >
                        Varsayılana Dön
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="https://mainnet.helius-rpc.com/?api-key=..."
                    defaultValue={customRpcUrl}
                    onChange={(e) => setCustomRpcInput(e.target.value)}
                    className="w-full h-8 rounded bg-[#0c1017] border border-[#232a3b] px-2.5 text-xs text-white placeholder-gray-500"
                  />
                  <div className="mt-1.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (customRpcInput) setCustomRpcUrl(customRpcInput);
                      }}
                      className="px-3 py-1 rounded bg-[#3b82f6] text-white text-[11px] font-bold"
                    >
                      RPC Kaydet
                    </button>
                    <span className="text-[10px] text-gray-400 self-center">
                      Aktif: {rpcUrl.slice(0, 32)}...
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: AUTO-SNIPER */}
            {settingsActiveTab === "autosnipe" && (
              <div className="space-y-3.5 text-xs">
                <div className="p-3 rounded-lg bg-[#0c1017] border border-[#232a3b] flex items-center justify-between">
                  <div>
                    <div className="font-bold text-white text-xs flex items-center gap-1.5">
                      <span>⚡ Otomatik Snipe Motoru</span>
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${autoSniperCfg.enabled ? "bg-emerald-500/20 text-emerald-400" : "bg-gray-800 text-gray-400"}`}>
                        {autoSniperCfg.enabled ? "AKTİF" : "KAPALI"}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      VIP tweetlerde CA tespit edildiğinde beklemeden alım yapar.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateAutoSniper("enabled", !autoSniperCfg.enabled)}
                    className={`h-7 px-3 rounded text-xs font-bold transition ${
                      autoSniperCfg.enabled ? "bg-emerald-500 text-black" : "bg-[#1f2637] text-gray-300"
                    }`}
                  >
                    {autoSniperCfg.enabled ? "Kapat" : "Etkinleştir"}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-[#8a93a6] block mb-1">Maks. Alım Tutarı (SOL)</label>
                    <input
                      type="number"
                      step="0.05"
                      value={autoSniperCfg.maxSolAmount}
                      onChange={(e) => updateAutoSniper("maxSolAmount", Number(e.target.value) || 0.1)}
                      className="w-full h-8 rounded bg-[#0c1017] border border-[#232a3b] px-2.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#8a93a6] block mb-1">Slippage (%)</label>
                    <input
                      type="number"
                      value={autoSniperCfg.slippage}
                      onChange={(e) => updateAutoSniper("slippage", Number(e.target.value) || 15)}
                      className="w-full h-8 rounded bg-[#0c1017] border border-[#232a3b] px-2.5 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-[#8a93a6] block mb-1">Priority Fee (SOL)</label>
                    <input
                      type="number"
                      step="0.001"
                      value={autoSniperCfg.priorityFeeSol}
                      onChange={(e) => updateAutoSniper("priorityFeeSol", Number(e.target.value) || 0.005)}
                      className="w-full h-8 rounded bg-[#0c1017] border border-[#232a3b] px-2.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#8a93a6] block mb-1">Jito MEV Bribe Tip (SOL)</label>
                    <input
                      type="number"
                      step="0.001"
                      value={autoSniperCfg.bribeTipSol}
                      onChange={(e) => updateAutoSniper("bribeTipSol", Number(e.target.value) || 0.002)}
                      className="w-full h-8 rounded bg-[#0c1017] border border-[#232a3b] px-2.5 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-[#8a93a6] hover:text-white">
                    <input
                      type="checkbox"
                      checked={autoSniperCfg.onlyVipAccounts}
                      onChange={(e) => updateAutoSniper("onlyVipAccounts", e.target.checked)}
                      className="rounded bg-[#0c1017] border-[#232a3b] text-[#3b82f6] focus:ring-0"
                    />
                    <span>Yalnızca VIP ve Doğrulanmış Hesapların Tweetlerini Snipe Et</span>
                  </label>
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-[#232a3b] flex justify-end">
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="h-8 px-4 rounded-md bg-[#3b82f6] hover:bg-[#2563eb] text-white font-semibold text-xs transition shadow-sm"
              >
                Kaydet ve Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 5. GLOBAL SEARCH MODAL (⌘K) ── */}
      {showSearchModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center pt-20 p-4">
          <div className="bg-[#131823] border border-[#232a3b] rounded-lg max-w-lg w-full p-4 space-y-3 shadow-2xl">
            <div className="flex items-center gap-2 border-b border-[#232a3b] pb-2.5">
              <span>🔍</span>
              <input
                type="text"
                autoFocus
                placeholder="Token adı, sembol ($TICKER) veya kontrat adresi girin…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-0 outline-none text-sm text-white w-full placeholder-[#8a93a6]"
              />
              <button
                type="button"
                onClick={() => setShowSearchModal(false)}
                className="text-xs text-[#8a93a6] hover:text-white"
              >
                ESC
              </button>
            </div>

            <div className="space-y-1.5 text-xs text-[#8a93a6]">
              <div className="text-[10px] uppercase font-bold text-[#8a93a6]">Popüler Pariteler</div>
              {[
                { name: "Axiom Cat", symbol: "AXCAT", mcap: "$38.4K", mint: "HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n4V98jwC" },
                { name: "Proxima Velocity", symbol: "PROX", mcap: "$78.2K", mint: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr" },
                { name: "Pepe Dark", symbol: "DPEPE", mcap: "$26.1K", mint: "EdAQuW9kZz9461z1D25E2mS3rPvx3bY4M9Zk8T9PUMP" },
              ]
                .filter(
                  (t) =>
                    !searchQuery ||
                    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    t.symbol.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((token) => (
                  <a
                    key={token.mint}
                    href={`/token/${token.mint}`}
                    className="flex items-center justify-between p-2 rounded hover:bg-[#171f2e] transition text-white"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#00d2ff]">${token.symbol}</span>
                      <span className="text-[#8a93a6]">{token.name}</span>
                    </div>
                    <span className="font-mono text-xs">{token.mcap}</span>
                  </a>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 6. DEPOSIT MODAL ── */}
      {showDepositModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#131823] border border-[#232a3b] rounded-lg max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#232a3b] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-base">💳</span>
                <h3 className="font-bold text-sm text-white">Solana Devnet Bakiye Yükle</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDepositModal(false)}
                className="text-[#8a93a6] hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-[#8a93a6]">
              <p>
                Axiom Pulse Terminal üzerinde anında işlem yapabilmek için Solana Devnet bakiyesi kullanabilirsiniz:
              </p>

              <div className="bg-[#0c1017] p-3 rounded border border-[#1f2637] font-mono text-[11px]">
                <div className="text-[#8a93a6] mb-1">Cüzdan Adresiniz:</div>
                <div className="text-white select-all break-all" suppressHydrationWarning>
                  {activeWalletKey || "Cüzdan bağlı değil"}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    handleQuickAirdrop();
                    setShowDepositModal(false);
                  }}
                  className="flex-1 h-8 rounded-md bg-[#3b82f6] hover:bg-[#2563eb] text-white font-semibold text-xs transition"
                >
                  Hemen +1 SOL Airdrop Al
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (activeWalletKey) {
                      navigator.clipboard.writeText(activeWalletKey);
                      alert("Cüzdan adresi panoya kopyalandı!");
                    }
                  }}
                  className="h-8 px-3 rounded-md border border-[#232a3b] text-[#8a93a6] hover:text-white text-xs transition"
                >
                  Kopyala
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
