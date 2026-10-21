"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { loadHotWallet } from "@/lib/hotWallet";
import { TabId } from "./TerminalSidebar";

const WalletMultiButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

type Props = {
  activeTab: TabId;
  onToggleMobileMenu: () => void;
};

const TAB_TITLES: Record<TabId, { title: string; category: string }> = {
  "j7-tracker": { title: "J7 Sosyal Radar & 1-Tıkla Sniper", category: "RADAR" },
  "pump-launch": { title: "Pump.fun Bonding Curve", category: "LANSMAN" },
  trade: { title: "Hızlı İşlem & Bonding Curve Terminali", category: "TİCARET" },
  "volume-bot": { title: "Algoritmik Hacim & Bump Botu", category: "OTOMASYON" },
  create: { title: "SPL Token Deployer", category: "LANSMAN" },
  draft: { title: "Tweet-to-Token (AI)", category: "LANSMAN" },
  liquidity: { title: "Raydium CPMM / AMM Havuzu", category: "LİKİDİTE" },
  "multi-wallet": { title: "Çoklu Cüzdan & Funder Yöneticisi", category: "CÜZDAN" },
  "quick-launch": { title: "Hızlı Hot Wallet İstasyonu", category: "CÜZDAN" },
  manage: { title: "Token Yönetimi & Yetkiler", category: "CÜZDAN" },
  track: { title: "Cüzdan & Balina Radarı", category: "CÜZDAN" },
  pump: { title: "Axiom Pulse Canlı Token & Eğri Radarı", category: "RADAR" },
  feed: { title: "Solana Devnet Blok Tarayıcısı", category: "PİYASA" },
  history: { title: "İşlem & Lansman Geçmişi", category: "ANALİTİK" },
};

export default function TerminalHeader({ activeTab, onToggleMobileMenu }: Props) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const [airdropBusy, setAirdropBusy] = useState(false);
  const [airdropMsg, setAirdropMsg] = useState<string | null>(null);
  const [hotBal, setHotBal] = useState<number | null>(null);

  const activeInfo = TAB_TITLES[activeTab] || {
    title: "Terminal",
    category: "GENEL",
  };

  useEffect(() => {
    const hw = loadHotWallet();
    if (hw) {
      connection
        .getBalance(hw.publicKey)
        .then((l) => setHotBal(l / LAMPORTS_PER_SOL))
        .catch(() => setHotBal(null));
    }
  }, [connection, activeTab]);

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
      await connection.confirmTransaction(
        { signature: sig, ...bh },
        "confirmed"
      );
      setAirdropMsg("+1 SOL Geldi!");
      setTimeout(() => setAirdropMsg(null), 4000);
    } catch {
      alert("Devnet airdrop limiti dolmuş olabilir. Lütfen faucet.solana.com adresinden manuel SOL alın.");
    } finally {
      setAirdropBusy(false);
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-white/[0.08] bg-[#080a0f]/90 px-4 backdrop-blur-2xl sm:px-6">
      {/* Left: Hamburger + Institutional Breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileMenu}
          className="rounded border border-white/10 bg-[#0e1117] p-1.5 text-dim hover:text-mist lg:hidden"
        >
          ☰
        </button>

        <div>
          <div className="flex items-center gap-2 text-[10px] font-mono text-muted tracking-wider uppercase">
            <span className="text-signal font-bold">TERMINAL</span>
            <span>//</span>
            <span>{activeInfo.category}</span>
          </div>
          <h1 className="text-xs font-mono font-bold tracking-tight text-mist sm:text-sm uppercase">
            {activeInfo.title}
          </h1>
        </div>
      </div>

      {/* Right: Institutional Metrics, Ticker, Wallet */}
      <div className="flex items-center gap-3">
        {/* SOL Ticker Pill (Desktop) */}
        <div className="hidden items-center gap-2 rounded border border-white/[0.08] bg-[#0c0f16] px-3 py-1 text-xs font-mono xl:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-signal animate-ping" />
          <span className="text-dim text-[11px]">SOL/USD</span>
          <span className="font-bold text-mist text-[11px]">$184.20</span>
          <span className="text-[10px] text-signal font-bold">+4.2%</span>
        </div>

        {/* Priority Fee Turbo Indicator */}
        <div className="hidden lg:flex items-center gap-1.5 rounded border border-white/[0.08] bg-[#0c0f16] px-2.5 py-1 text-[11px] font-mono">
          <span className="text-muted text-[10px]">SPEED:</span>
          <span className="text-cyan-400 font-bold">TURBO (0.001 SOL)</span>
        </div>

        {/* Quick Faucet Airdrop Button */}
        <button
          onClick={handleQuickAirdrop}
          disabled={airdropBusy}
          title="Bağlı cüzdana 1 Devnet SOL airdrop et"
          className="hidden sm:flex items-center gap-1.5 rounded border border-signal/30 bg-signal/10 px-3 py-1 font-mono text-[11px] font-bold text-signal hover:bg-signal/20 transition shadow-glow-sm disabled:opacity-40"
        >
          <span>◈</span>
          <span>{airdropBusy ? "Gönderiliyor…" : airdropMsg || "+1 SOL FAUCET"}</span>
        </button>

        {/* Hot Wallet status badge if exists */}
        {hotBal !== null && (
          <div className="hidden md:flex items-center gap-1.5 rounded border border-white/[0.08] bg-[#0c0f16] px-2.5 py-1 text-[11px] font-mono">
            <span className="text-muted text-[10px]">HOT:</span>
            <span className="text-mist font-bold">{hotBal.toFixed(2)} SOL</span>
          </div>
        )}

        {/* Solana Wallet Adapter Button */}
        <WalletMultiButton />
      </div>
    </header>
  );
}
