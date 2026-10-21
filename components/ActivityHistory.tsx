"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  ACTIVITY_EVENT,
  Activity,
  ActivityType,
  clearActivity,
  loadActivity,
} from "@/lib/activity";
import { ago, ghostButtonClass, shorten } from "@/components/ui";

const TYPE_LABEL: Record<ActivityType, string> = {
  launch: "Oluşturma",
  burn: "Yakma",
  send: "Gönderme",
  revoke: "Yetki kapatma",
  buy: "Hızlı Alım",
  sell: "Hızlı Satış",
};

export default function ActivityHistory() {
  const { connection } = useConnection();
  const [items, setItems] = useState<Activity[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const cluster = connection.rpcEndpoint.includes("devnet")
    ? "?cluster=devnet"
    : "";

  useEffect(() => {
    const refresh = () => setItems(loadActivity());
    refresh();
    window.addEventListener(ACTIVITY_EVENT, refresh);
    const id = setInterval(() => setNow(Date.now()), 10000);
    return () => {
      window.removeEventListener(ACTIVITY_EVENT, refresh);
      clearInterval(id);
    };
  }, []);

  return (
    <section className="w-full space-y-4 rounded-xl border border-line bg-panel p-5 text-left">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Geçmiş</h2>
          <p className="text-sm text-dim">
            Bu tarayıcıda yaptığın işlemler. Sunucuda saklanmaz.
          </p>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={clearActivity}
            className={ghostButtonClass}
          >
            Temizle
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-dim">Henüz bir işlem yok.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => (
            <li
              key={a.id}
              className="rounded-lg border border-line bg-ink p-3 text-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{TYPE_LABEL[a.type]}</span>
                <span className="text-dim">{ago(a.time, now)}</span>
              </div>
              <p className="mt-1">{a.label}</p>
              <div className="mt-1 flex items-center justify-between gap-3 text-dim">
                <span title={a.mint}>{shorten(a.mint)}</span>
                <a
                  className="underline"
                  target="_blank"
                  rel="noreferrer"
                  href={`https://explorer.solana.com/tx/${a.signature}${cluster}`}
                >
                  İşlemi aç
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
