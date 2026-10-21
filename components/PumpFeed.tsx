"use client";

import { useEffect, useRef, useState } from "react";

type PumpItem = {
  mint: string;
  signature: string;
  name: string;
  symbol: string;
  marketCapSol?: number;
  time: number;
};

const WS_URL = "wss://pumpportal.fun/api/data";
const MAX_ITEMS = 40;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function clip(value: unknown, max: number) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function shorten(value: string) {
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function ago(time: number, now: number) {
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 60) return `${seconds} sn önce`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} dk önce`;
  return `${Math.round(minutes / 60)} sa önce`;
}

export default function PumpFeed() {
  const [items, setItems] = useState<PumpItem[]>([]);
  const [listening, setListening] = useState(true);
  const [status, setStatus] = useState("bağlanıyor");
  const [received, setReceived] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const buffer = useRef<PumpItem[]>([]);
  const receivedRef = useRef(0);
  const retry = useRef(0);

  // Gelen token'ları saniyede bir toplu olarak ekrana yansıt (yavaş bilgisayarı yormamak için)
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      setReceived(receivedRef.current);
      if (buffer.current.length > 0) {
        const fresh = buffer.current;
        buffer.current = [];
        setItems((prev) => [...fresh, ...prev].slice(0, MAX_ITEMS));
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!listening) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      setStatus("bağlanıyor");
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        retry.current = 0;
        setStatus("bağlı");
        ws?.send(JSON.stringify({ method: "subscribeNewToken" }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data));
          if (!data || typeof data !== "object") return;
          const mint = typeof data.mint === "string" ? data.mint : "";
          if (!BASE58.test(mint)) return; // abonelik onayı gibi mesajları atla
          if (data.txType && data.txType !== "create") return;

          receivedRef.current += 1;
          buffer.current.unshift({
            mint,
            signature: clip(data.signature, 100),
            name: clip(data.name, 40),
            symbol: clip(data.symbol, 12),
            marketCapSol:
              typeof data.marketCapSol === "number"
                ? data.marketCapSol
                : undefined,
            time: Date.now(),
          });
          if (buffer.current.length > 100) buffer.current.length = 100;
        } catch {
          // bozuk mesajı atla
        }
      };

      ws.onclose = () => {
        if (closed) return;
        setStatus("koptu, yeniden deneniyor");
        retry.current += 1;
        const delay = Math.min(30000, 1000 * 2 ** retry.current);
        timer = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, [listening]);

  return (
    <section className="w-full space-y-4 rounded-xl border border-line bg-panel p-5 text-left">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Pump.fun canlı akışı</h2>
          <p className="text-sm text-dim">
            Gerçek ağ (mainnet), yalnızca okuma · bağlantı:{" "}
            {listening ? status : "duraklatıldı"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setListening((v) => !v)}
          className="h-9 rounded-lg border border-line px-3 text-sm font-semibold transition hover:border-signal focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          {listening ? "Duraklat" : "Devam et"}
        </button>
      </div>

      <p className="rounded-lg border border-line bg-ink p-2 text-xs text-dim">
        Gelen yeni token: {received}. Kaynak: PumpPortal, resmî olmayan
        üçüncü taraf bir veri servisi (ücretsiz, sınırları olabilir). Yeni
        token&apos;ların çoğu yüksek risklidir, bu liste yatırım tavsiyesi
        değildir.
      </p>

      {items.length === 0 ? (
        <p className="text-sm text-dim">Yeni token bekleniyor…</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.mint}
              className="rounded-lg border border-line bg-ink p-3 text-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">
                  {item.name || "İsimsiz"}
                  {item.symbol ? ` (${item.symbol})` : ""}
                </span>
                <span className="text-dim">{ago(item.time, now)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-dim">
                <span title={item.mint}>
                  {shorten(item.mint)}
                  {item.marketCapSol !== undefined
                    ? ` · ${item.marketCapSol.toFixed(1)} SOL piyasa değeri`
                    : ""}
                </span>
                <span className="space-x-3">
                  <a
                    className="underline"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://explorer.solana.com/address/${item.mint}`}
                  >
                    Explorer
                  </a>
                  <a
                    className="underline"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://pump.fun/coin/${item.mint}`}
                  >
                    pump.fun
                  </a>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
