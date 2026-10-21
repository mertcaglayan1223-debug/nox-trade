"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { createHotWallet, deleteHotWallet, loadHotWallet } from "@/lib/hotWallet";
import { launchWithKeypair } from "@/lib/launch";
import { loadPresets } from "@/lib/presets";
import { addActivity } from "@/lib/activity";
import { buttonClass, ghostButtonClass, shorten } from "@/components/ui";

type Props = {
  name: string;
  symbol: string;
  description: string;
  twitterUrl: string;
  presetId: string;
  agree: boolean;
  getImage: () => Promise<File>;
};

export default function QuickLaunch(props: Props) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [hot, setHot] = useState<Keypair | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<{ mint: string; signature: string } | null>(
    null
  );

  const isDevnet = connection.rpcEndpoint.includes("devnet");

  useEffect(() => {
    setHot(loadHotWallet());
  }, []);

  useEffect(() => {
    if (!hot) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    connection
      .getBalance(hot.publicKey)
      .then((lamports) => {
        if (!cancelled) setBalance(lamports / LAMPORTS_PER_SOL);
      })
      .catch(() => {
        if (!cancelled) setBalance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [connection, hot, refresh]);

  const confirmSignature = useCallback(
    async (signature: string) => {
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      const confirmation = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );
      if (confirmation.value.err) throw new Error("İşlem başarısız oldu.");
    },
    [connection]
  );

  function handleCreate() {
    setError(null);
    setNotice(null);
    setHot(createHotWallet());
  }

  function handleDelete() {
    if (
      !window.confirm(
        "Hızlı cüzdan silinecek. İçinde SOL varsa erişemezsin. Devam edilsin mi?"
      )
    ) {
      return;
    }
    deleteHotWallet();
    setHot(null);
    setResult(null);
  }

  async function handleAirdrop() {
    if (!hot || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const signature = await connection.requestAirdrop(
        hot.publicKey,
        LAMPORTS_PER_SOL
      );
      await confirmSignature(signature);
      setNotice("1 devnet SOL geldi.");
      setRefresh((n) => n + 1);
    } catch {
      setError(
        "Airdrop başarısız (devnet sınırı dolmuş olabilir). Aşağıdaki Phantom'dan gönderme seçeneğini dene."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleFund() {
    if (!hot || !publicKey || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: hot.publicKey,
          lamports: Math.round(0.05 * LAMPORTS_PER_SOL),
        })
      );
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      const signature = await sendTransaction(tx, connection);
      await confirmSignature(signature);
      setNotice("Hızlı cüzdana 0.05 SOL gönderildi.");
      setRefresh((n) => n + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(
        /reject/i.test(message) ? "Cüzdanda işlemi reddettin." : message
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleLaunch() {
    if (!hot || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setResult(null);
    try {
      const preset = loadPresets().find((p) => p.id === props.presetId);
      setStatus("Görsel hazırlanıyor…");
      const image = await props.getImage();
      const launched = await launchWithKeypair(
        {
          connection,
          payer: hot,
          name: props.name,
          symbol: props.symbol,
          description: props.description,
          website: preset?.website ?? "",
          twitter: props.twitterUrl,
          telegram: preset?.telegram ?? "",
          image,
          supply: preset?.supply ?? "1000000000",
          decimals: preset?.decimals === "9" ? 9 : 6,
          burnPercent: Number(preset?.burnPercent ?? "0") || 0,
          revokeMint: preset?.revokeMint ?? true,
          revokeFreeze: preset?.revokeFreeze ?? true,
          immutable: preset?.immutable ?? false,
        },
        setStatus
      );
      addActivity({
        type: "launch",
        mint: launched.mint,
        signature: launched.signature,
        label: `${props.name.trim()} (${props.symbol.trim().toUpperCase()}) hızlı cüzdanla oluşturuldu`,
      });
      setResult(launched);
      setRefresh((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setStatus("");
    }
  }

  if (!isDevnet) {
    return (
      <div className="rounded-lg border border-line bg-ink p-4 text-sm text-dim">
        Tek tıkla launch (hızlı cüzdan) güvenlik için şimdilik yalnızca
        Devnet&apos;te çalışır.
      </div>
    );
  }

  const canLaunch =
    !!hot &&
    !busy &&
    props.agree &&
    !!props.name.trim() &&
    !!props.symbol.trim() &&
    balance !== null &&
    balance >= 0.02;

  return (
    <div className="space-y-3 rounded-lg border border-line bg-ink p-4 text-left text-sm">
      <p className="font-semibold">Tek tıkla launch (hızlı cüzdan, Devnet)</p>
      <p className="text-dim">
        Hızlı cüzdan, bu tarayıcıda saklanan ayrı bir cüzdandır. Phantom
        penceresi çıkmadan token&apos;ı kendisi imzalar. Anahtarı bu tarayıcıda
        düz metin olarak durduğu için yalnızca Devnet ve küçük bakiye için
        kullan. Gerçek para koyma.
      </p>

      {!hot ? (
        <button type="button" onClick={handleCreate} className={ghostButtonClass}>
          Hızlı cüzdan oluştur
        </button>
      ) : (
        <div className="space-y-2">
          <p>
            <span className="text-dim">Adres: </span>
            <span title={hot.publicKey.toBase58()}>
              {shorten(hot.publicKey.toBase58())}
            </span>
            <span className="text-dim"> · Bakiye: </span>
            {balance === null ? "…" : `${balance.toFixed(4)} SOL`}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={handleAirdrop}
              className={ghostButtonClass}
            >
              1 devnet SOL iste
            </button>
            <button
              type="button"
              disabled={busy || !publicKey}
              onClick={handleFund}
              className={ghostButtonClass}
            >
              Phantom&apos;dan 0.05 SOL gönder
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleDelete}
              className={ghostButtonClass}
            >
              Sil
            </button>
          </div>

          <button
            type="button"
            disabled={!canLaunch}
            onClick={handleLaunch}
            className={buttonClass}
          >
            {busy && status ? status : "Tek tıkla launch"}
          </button>
          {!props.agree && (
            <p className="text-xs text-dim">
              Başlamak için yukarıdaki onay kutusunu işaretle.
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-signal">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-dim">
          {notice}
        </p>
      )}
      {result && (
        <div className="space-y-1 rounded-lg border border-line p-3">
          <p className="font-semibold">Token oluşturuldu 🎉</p>
          <p className="break-all">
            <span className="text-dim">Mint adresi: </span>
            {result.mint}
          </p>
          <p className="space-x-4">
            <a
              className="underline"
              target="_blank"
              rel="noreferrer"
              href={`https://explorer.solana.com/address/${result.mint}?cluster=devnet`}
            >
              Explorer
            </a>
            <a
              className="underline"
              target="_blank"
              rel="noreferrer"
              href={`https://explorer.solana.com/tx/${result.signature}?cluster=devnet`}
            >
              İşlemi aç
            </a>
          </p>
          <p className="text-dim">
            Token hızlı cüzdanda durur. Yönetmek için o cüzdanın anahtarı gerekir,
            bu yüzden deneme amaçlıdır.
          </p>
        </div>
      )}
    </div>
  );
}
