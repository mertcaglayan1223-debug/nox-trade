"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

type Tracked = { address: string; label: string };
type Tx = { signature: string; time: number | null; ok: boolean };
type Info = { balance: number | null; txs: Tx[]; error?: string };

const STORAGE_KEY = "tracked-wallets";
const MAX_WALLETS = 10;
const POLL_MS = 20000;

const inputClass =
  "w-full rounded-lg border border-line bg-ink px-3 py-2 text-mist placeholder:text-dim/60 focus:outline-none focus:ring-2 focus:ring-signal";

function shorten(value: string) {
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export default function WalletTracker() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const [wallets, setWallets] = useState<Tracked[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [info, setInfo] = useState<Record<string, Info>>({});
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Kayıtlı listeyi tarayıcıdan oku
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setWallets(
            parsed
              .filter((w) => w && typeof w.address === "string")
              .map((w) => ({
                address: w.address as string,
                label: typeof w.label === "string" ? w.label : "",
              }))
              .slice(0, MAX_WALLETS)
          );
        }
      }
    } catch {
      // okunamazsa boş liste ile devam
    }
    setLoaded(true);
  }, []);

  // Listeyi tarayıcıya kaydet
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
    } catch {
      // kaydedilemezse sessizce geç
    }
  }, [wallets, loaded]);

  const refresh = useCallback(
    async (list: Tracked[]) => {
      for (const w of list) {
        try {
          const pk = new PublicKey(w.address);
          const [lamports, sigs] = await Promise.all([
            connection.getBalance(pk),
            connection.getSignaturesForAddress(pk, { limit: 5 }),
          ]);
          setInfo((prev) => ({
            ...prev,
            [w.address]: {
              balance: lamports / LAMPORTS_PER_SOL,
              txs: sigs.map((s) => ({
                signature: s.signature,
                time: s.blockTime ?? null,
                ok: !s.err,
              })),
            },
          }));
        } catch {
          setInfo((prev) => ({
            ...prev,
            [w.address]: {
              balance: prev[w.address]?.balance ?? null,
              txs: prev[w.address]?.txs ?? [],
              error: "Veri alınamadı (RPC yoğun olabilir).",
            },
          }));
        }
        // herkese açık RPC'yi yormamak için kısa bekleme
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    },
    [connection]
  );

  useEffect(() => {
    if (!loaded || wallets.length === 0) return;
    refresh(wallets);
    const id = setInterval(() => refresh(wallets), POLL_MS);
    return () => clearInterval(id);
  }, [wallets, loaded, refresh]);

  function addWallet(rawAddress: string, rawLabel: string) {
    setError(null);
    const trimmed = rawAddress.trim();
    try {
      new PublicKey(trimmed);
    } catch {
      setError("Geçerli bir Solana adresi değil.");
      return false;
    }
    if (wallets.some((w) => w.address === trimmed)) {
      setError("Bu cüzdan zaten listede.");
      return false;
    }
    if (wallets.length >= MAX_WALLETS) {
      setError(`En fazla ${MAX_WALLETS} cüzdan takip edebilirsin.`);
      return false;
    }
    setWallets((prev) => [
      ...prev,
      { address: trimmed, label: rawLabel.trim().slice(0, 30) },
    ]);
    return true;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (addWallet(address, label)) {
      setAddress("");
      setLabel("");
    }
  }

  function removeWallet(addr: string) {
    setWallets((prev) => prev.filter((w) => w.address !== addr));
    setInfo((prev) => {
      const copy = { ...prev };
      delete copy[addr];
      return copy;
    });
  }

  return (
    <section className="w-full space-y-4 rounded-xl border border-line bg-panel p-5 text-left">
      <div>
        <h2 className="text-xl font-bold">Cüzdan takibi</h2>
        <p className="text-sm text-dim">
          Adres ekle, bakiyesini ve son işlemlerini 20 saniyede bir gör. Liste
          bu tarayıcıda saklanır.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          className={inputClass}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Cüzdan adresi"
          aria-label="Cüzdan adresi"
        />
        <div className="flex gap-2">
          <input
            className={inputClass}
            value={label}
            maxLength={30}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Etiket (isteğe bağlı)"
            aria-label="Etiket"
          />
          <button
            type="submit"
            className="h-10 shrink-0 rounded-lg bg-signal px-4 text-sm font-semibold text-ink transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-mist"
          >
            Ekle
          </button>
        </div>
        {publicKey && (
          <button
            type="button"
            onClick={() => addWallet(publicKey.toBase58(), "Benim cüzdanım")}
            className="text-sm underline"
          >
            Bağlı cüzdanımı ekle
          </button>
        )}
        {error && (
          <p role="alert" className="text-sm text-signal">
            {error}
          </p>
        )}
      </form>

      {wallets.length === 0 ? (
        <p className="text-sm text-dim">Henüz takip ettiğin cüzdan yok.</p>
      ) : (
        <ul className="space-y-3">
          {wallets.map((w) => {
            const data = info[w.address];
            return (
              <li
                key={w.address}
                className="rounded-lg border border-line bg-ink p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {w.label || "Etiketsiz"}{" "}
                      <span className="font-normal text-dim" title={w.address}>
                        {shorten(w.address)}
                      </span>
                    </p>
                    <p className="text-dim">
                      {data?.balance != null
                        ? `${data.balance.toFixed(4)} SOL`
                        : "Yükleniyor…"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeWallet(w.address)}
                    className="text-dim underline hover:text-mist"
                    aria-label={`${w.label || shorten(w.address)} cüzdanını listeden çıkar`}
                  >
                    Çıkar
                  </button>
                </div>

                {data?.error && (
                  <p className="mt-2 text-signal">{data.error}</p>
                )}

                {data && data.txs.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-line pt-2">
                    {data.txs.map((tx) => (
                      <li
                        key={tx.signature}
                        className="flex items-center justify-between gap-3 text-dim"
                      >
                        <a
                          className="underline"
                          target="_blank"
                          rel="noreferrer"
                          href={`https://explorer.solana.com/tx/${tx.signature}?cluster=devnet`}
                        >
                          {shorten(tx.signature)}
                        </a>
                        <span>
                          {tx.ok ? "Başarılı" : "Başarısız"}
                          {tx.time
                            ? ` · ${new Date(tx.time * 1000).toLocaleString(
                                "tr-TR"
                              )}`
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {data && data.txs.length === 0 && !data.error && (
                  <p className="mt-2 text-dim">Bu adreste henüz işlem yok.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
