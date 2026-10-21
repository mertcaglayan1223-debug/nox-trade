"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

function shorten(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export default function WalletStatus() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [airdropBusy, setAirdropBusy] = useState(false);
  const [airdropMsg, setAirdropMsg] = useState<string | null>(null);

  const isDevnet = connection.rpcEndpoint.includes("devnet");

  useEffect(() => {
    if (!publicKey) {
      setBalance(null);
      setError(null);
      return;
    }
    let cancelled = false;
    connection
      .getBalance(publicKey)
      .then((lamports) => {
        if (!cancelled) {
          setBalance(lamports / LAMPORTS_PER_SOL);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Bakiye alınamadı. RPC bağlantısını kontrol et.");
      });
    return () => {
      cancelled = true;
    };
  }, [connection, publicKey, refresh]);

  async function handleAirdrop() {
    if (!publicKey || airdropBusy) return;
    setAirdropBusy(true);
    setAirdropMsg(null);
    try {
      const signature = await connection.requestAirdrop(
        publicKey,
        LAMPORTS_PER_SOL
      );
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );
      setAirdropMsg("1 devnet SOL cüzdanına geldi.");
      setRefresh((n) => n + 1);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setAirdropMsg(
        /429|limit|too many|rate/i.test(raw)
          ? "Devnet faucet'in sınırı doldu ya da çok yoğun. Birkaç saat sonra tekrar dene."
          : `Airdrop başarısız: ${raw.slice(0, 160)}`
      );
    } finally {
      setAirdropBusy(false);
    }
  }

  if (!publicKey) {
    return (
      <p className="text-dim">
        Başlamak için cüzdanını bağla. Şimdilik yalnızca Devnet kullanılıyor.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-xl border border-line bg-panel p-5 text-left">
        <dt className="text-dim">Cüzdan</dt>
        <dd className="font-medium" title={publicKey.toBase58()}>
          {shorten(publicKey.toBase58())}
        </dd>
        <dt className="text-dim">Ağ</dt>
        <dd className="font-medium">{isDevnet ? "Devnet" : "Özel RPC"}</dd>
        <dt className="text-dim">Bakiye</dt>
        <dd className="font-medium">
          {error ? (
            <span className="text-signal">{error}</span>
          ) : balance === null ? (
            "Yükleniyor…"
          ) : (
            `${balance.toFixed(4)} SOL`
          )}
        </dd>
      </dl>

      {isDevnet && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleAirdrop}
            disabled={airdropBusy}
            className="h-10 w-full rounded-lg border border-line bg-panel text-sm font-semibold transition hover:border-signal focus:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:cursor-not-allowed disabled:opacity-60"
          >
            {airdropBusy ? "İstek gönderiliyor…" : "1 devnet SOL iste (Airdrop)"}
          </button>
          {airdropMsg && (
            <p role="status" className="text-sm text-dim">
              {airdropMsg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}