"use client";

import { useEffect, useRef, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getMetadataPda } from "@/lib/metadata";

type FeedItem = {
  mint: string;
  signature: string;
  time: number;
  name?: string;
  symbol?: string;
};

type Stats = {
  received: number;
  mints: number;
  shown: number;
  failed: number;
  lastError: string;
};

function parseMetadata(data: Uint8Array): { name: string; symbol: string } {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const decoder = new TextDecoder();
  let offset = 65;
  const readString = () => {
    const length = view.getUint32(offset, true);
    offset += 4;
    const text = decoder.decode(data.subarray(offset, offset + length));
    offset += length;
    return text.replace(/\0+$/, "").trim();
  };
  const name = readString();
  const symbol = readString();
  return { name, symbol };
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

export default function TokenFeed() {
  const { connection } = useConnection();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [listening, setListening] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [stats, setStats] = useState<Stats>({
    received: 0,
    mints: 0,
    shown: 0,
    failed: 0,
    lastError: "",
  });

  const queue = useRef<string[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const retries = useRef<Map<string, number>>(new Map());
  const busy = useRef(false);
  const counters = useRef<Stats>({
    received: 0,
    mints: 0,
    shown: 0,
    failed: 0,
    lastError: "",
  });

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      setStats({ ...counters.current });
    }, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!listening) return;
    let active = true;
    let subscription: number | null = null;
    setNote(null);

    try {
      subscription = connection.onLogs(
        TOKEN_PROGRAM_ID,
        (info) => {
          counters.current.received += 1;
          if (info.err) return;
          if (!info.logs.some((l) => l.includes("Instruction: InitializeMint"))) {
            return;
          }
          if (seen.current.has(info.signature)) return;
          if (seen.current.size > 500) seen.current.clear();
          seen.current.add(info.signature);
          counters.current.mints += 1;
          if (queue.current.length < 30) queue.current.push(info.signature);
        },
        "confirmed"
      );
    } catch (err) {
      counters.current.lastError =
        err instanceof Error ? err.message : "Bağlantı kurulamadı";
      setNote("Canlı bağlantı kurulamadı. Sayfayı yenilemeyi dene.");
    }

    const timer = setInterval(async () => {
      if (busy.current || queue.current.length === 0) return;
      busy.current = true;
      const signature = queue.current.shift()!;
      try {
        const tx = await connection.getParsedTransaction(signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });
        if (!active) return;
        if (!tx) {
          const tries = (retries.current.get(signature) ?? 0) + 1;
          retries.current.set(signature, tries);
          if (tries <= 2) {
            queue.current.push(signature);
          } else {
            counters.current.failed += 1;
            counters.current.lastError = "İşlem detayı alınamadı";
          }
          return;
        }

        const instructions = [
          ...tx.transaction.message.instructions,
          ...(tx.meta?.innerInstructions ?? []).flatMap((i) => i.instructions),
        ];
        let mint: string | null = null;
        for (const ix of instructions) {
          if (
            "parsed" in ix &&
            ix.program === "spl-token" &&
            (ix.parsed.type === "initializeMint" ||
              ix.parsed.type === "initializeMint2")
          ) {
            mint = ix.parsed.info.mint as string;
            break;
          }
        }
        if (!mint) return;

        let name: string | undefined;
        let symbol: string | undefined;
        try {
          const account = await connection.getAccountInfo(
            getMetadataPda(new PublicKey(mint)),
            "confirmed"
          );
          if (account) {
            const meta = parseMetadata(account.data);
            name = meta.name || undefined;
            symbol = meta.symbol || undefined;
          }
        } catch {
          // metadata yoksa isimsiz göster
        }

        if (!active) return;
        counters.current.shown += 1;
        setItems((prev) =>
          [{ mint, signature, time: Date.now(), name, symbol }, ...prev].slice(
            0,
            25
          )
        );
      } catch (err) {
        counters.current.failed += 1;
        counters.current.lastError =
          err instanceof Error ? err.message.slice(0, 120) : "Bilinmeyen hata";
      } finally {
        busy.current = false;
      }
    }, 800);

    return () => {
      active = false;
      clearInterval(timer);
      if (subscription !== null) {
        connection.removeOnLogsListener(subscription).catch(() => {});
      }
    };
  }, [connection, listening]);

  return (
    <section className="w-full space-y-4 rounded-xl border border-line bg-panel p-5 text-left">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Canlı token akışı</h2>
          <p className="text-sm text-dim">
            {listening ? "Yeni token'lar dinleniyor…" : "Duraklatıldı"}
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
        Teşhis: gelen olay {stats.received} · yeni token {stats.mints} ·
        gösterilen {stats.shown} · hata {stats.failed}
        {stats.lastError ? ` · son hata: ${stats.lastError}` : ""}
      </p>

      {note && (
        <p role="alert" className="text-sm text-signal">
          {note}
        </p>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-dim">
          Henüz yeni token görmedim. Devnet, mainnet&apos;e göre çok daha sessiz,
          bu yüzden birkaç dakika sürebilir. Kendi oluşturduğun token da buraya
          düşer.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.signature}
              className="rounded-lg border border-line bg-ink p-3 text-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">
                  {item.name
                    ? `${item.name}${item.symbol ? ` (${item.symbol})` : ""}`
                    : "İsimsiz token"}
                </span>
                <span className="text-dim">{ago(item.time, now)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-dim">
                <span title={item.mint}>{shorten(item.mint)}</span>
                <a
                  className="underline"
                  target="_blank"
                  rel="noreferrer"
                  href={`https://explorer.solana.com/address/${item.mint}?cluster=devnet`}
                >
                  Explorer
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}