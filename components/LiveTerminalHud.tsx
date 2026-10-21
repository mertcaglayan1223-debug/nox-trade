"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { shorten } from "@/components/ui";

type PumpItem = {
  mint: string;
  name: string;
  symbol: string;
  time: number;
};

const WS_URL = "wss://pumpportal.fun/api/data";

export default function LiveTerminalHud() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const [balance, setBalance] = useState<number | null>(null);
  const [liveItems, setLiveItems] = useState<PumpItem[]>([]);
  const [wsStatus, setWsStatus] = useState("bağlanıyor");

  // Fetch balance
  useEffect(() => {
    if (!publicKey) {
      setBalance(null);
      return;
    }
    let active = true;
    connection.getBalance(publicKey).then((lamports) => {
      if (active) setBalance(lamports / LAMPORTS_PER_SOL);
    }).catch(() => {
      if (active) setBalance(null);
    });
    return () => {
      active = false;
    };
  }, [connection, publicKey]);

  // Live pump stream
  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => {
        setWsStatus("canlı");
        ws?.send(JSON.stringify({ method: "subscribeNewToken" }));
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data));
          if (data && typeof data === "object" && data.mint) {
            setLiveItems((prev) => [
              {
                mint: String(data.mint),
                name: String(data.name || "Token"),
                symbol: String(data.symbol || "MEME"),
                time: Date.now(),
              },
              ...prev.slice(0, 15),
            ]);
          }
        } catch {}
      };
      ws.onerror = () => setWsStatus("hata");
      ws.onclose = () => setWsStatus("kapalı");
    } catch {
      setWsStatus("hata");
    }

    return () => {
      ws?.close();
    };
  }, []);

  return (
    <aside className="hidden w-80 flex-col gap-3 border-l border-white/[0.08] bg-[#07090e]/95 p-3 backdrop-blur-2xl 2xl:flex">
      {/* Wallet Summary Card */}
      <div className="rounded border border-white/[0.08] bg-[#0c0f16] p-3.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted">
            CÜZDAN RADARI
          </span>
          <span className="flex items-center gap-1.5 text-[10px] font-mono text-signal">
            <span className="h-1.5 w-1.5 rounded-full bg-signal animate-pulse" />
            SOLANA ACTIVE
          </span>
        </div>

        {publicKey ? (
          <div className="space-y-0.5">
            <p className="font-mono text-[11px] text-dim">
              {shorten(publicKey.toBase58())}
            </p>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold text-mist font-mono">
                {balance !== null ? balance.toFixed(3) : "—"}
              </span>
              <span className="text-xs font-bold text-signal font-mono">SOL</span>
            </div>
          </div>
        ) : (
          <div className="rounded border border-dashed border-white/10 p-2.5 text-center">
            <p className="text-[11px] font-mono text-muted">Cüzdan bağlı değil</p>
          </div>
        )}
      </div>

      {/* Live Pump.fun Stream Mini-Feed */}
      <div className="flex-1 rounded border border-white/[0.08] bg-[#0c0f16] p-3.5 space-y-2.5 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
            <span>●</span> CANLI TOKEN RADARI
          </span>
          <span className="rounded border border-signal/30 bg-signal/15 px-1.5 py-0.2 text-[9px] font-mono font-bold text-signal">
            {wsStatus.toUpperCase()}
          </span>
        </div>

        <div className="space-y-1.5 flex-1 overflow-y-auto pr-0.5">
          {liveItems.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-[11px] font-mono text-muted">
              Sinyal bekleniyor…
            </div>
          ) : (
            liveItems.map((item, idx) => (
              <div
                key={item.mint + idx}
                className="group rounded border border-white/[0.06] bg-[#080a0f] p-2 transition hover:border-signal/40"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-xs text-mist group-hover:text-signal truncate max-w-[130px]">
                    {item.name}
                  </span>
                  <span className="font-mono text-[10px] text-signal font-bold">
                    ${item.symbol}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-dim font-mono pt-1">
                  <span>{shorten(item.mint)}</span>
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/token/${item.mint}`}
                      className="text-cyan-400 hover:underline"
                    >
                      Grafik ↗
                    </Link>
                    <a
                      href={`https://pump.fun/coin/${item.mint}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted hover:text-mist"
                    >
                      Pump
                    </a>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick Status / Gas Fee Meter */}
      <div className="rounded border border-white/[0.08] bg-[#0c0f16] p-3 text-[10px] font-mono space-y-1">
        <div className="flex justify-between text-muted">
          <span>PRIORITY FEE:</span>
          <span className="text-signal font-bold">0.001 SOL (TURBO)</span>
        </div>
        <div className="flex justify-between text-muted">
          <span>MEV PROTECTION:</span>
          <span className="text-cyan-400 font-bold">JITO BUNDLE (ENABLED)</span>
        </div>
        <div className="flex justify-between text-muted">
          <span>ROUTING NODE:</span>
          <span className="text-emerald-400 font-bold">PUMPPORTAL FAST</span>
        </div>
      </div>
    </aside>
  );
}
