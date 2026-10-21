"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { launchOnPump } from "@/lib/pumpLaunch";
import { loadHotWallet } from "@/lib/hotWallet";
import { loadSubWallets, SubWallet } from "@/lib/multiWallet";
import { executeSubWalletBundleBuys, BundleBuyResult } from "@/lib/bundleLaunch";
import {
  Field,
  buttonClass,
  ghostButtonClass,
  inputClass,
  shorten,
} from "@/components/ui";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export default function PumpLaunch() {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const [devBuySol, setDevBuySol] = useState("0");
  const [priorityFee, setPriorityFee] = useState("0.0005");
  const [useHotWallet, setUseHotWallet] = useState(false);
  const [hotWallet, setHotWallet] = useState<Keypair | null>(null);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ mint: string; signature: string } | null>(
    null
  );

  // Bundle (Block-0) State
  const [enableBundle, setEnableBundle] = useState(false);
  const [bundleBuyAmount, setBundleBuyAmount] = useState("0.01");
  const [subWallets, setSubWallets] = useState<SubWallet[]>([]);
  const [bundleBusy, setBundleBusy] = useState(false);
  const [bundleResults, setBundleResults] = useState<BundleBuyResult[] | null>(null);

  useEffect(() => {
    setHotWallet(loadHotWallet());
  }, []);

  // Alt cüzdanları localStorage'dan yükle
  useEffect(() => {
    setSubWallets(loadSubWallets());
  }, []);

  useEffect(() => {
    if (!image) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  async function handleLaunch(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    const cleanName = name.trim();
    const cleanSymbol = symbol.trim().toUpperCase();
    const buySol = Number(devBuySol) || 0;

    if (!cleanName || cleanName.length > 32) {
      return setError("Token ismi 1 ile 32 karakter arasında olmalıdır.");
    }
    if (!cleanSymbol || cleanSymbol.length > 10) {
      return setError("Token sembolü 1 ile 10 karakter arasında olmalıdır.");
    }
    if (!image) {
      return setError("Lütfen token için bir logo görseli yükleyin.");
    }
    if (!IMAGE_TYPES.includes(image.type)) {
      return setError("Görsel PNG, JPG, GIF veya WEBP formatında olmalıdır.");
    }
    if (image.size > MAX_IMAGE_BYTES) {
      return setError("Görsel boyutu en fazla 2 MB olabilir.");
    }

    let activeSignerPubKey: string;
    let signerFn: (tx: any) => Promise<any>;

    if (useHotWallet) {
      if (!hotWallet) {
        return setError("Hızlı cüzdan bulunamadı. Lütfen 'Tweet'ten taslak' sekmesinden hızlı cüzdan oluşturun.");
      }
      activeSignerPubKey = hotWallet.publicKey.toBase58();
      signerFn = async (tx) => {
        tx.sign([hotWallet]);
        return tx;
      };
    } else {
      if (!publicKey || !signTransaction) {
        return setError("Lütfen önce sağ üstteki butondan Phantom veya Solana cüzdanınızı bağlayın.");
      }
      activeSignerPubKey = publicKey.toBase58();
      signerFn = signTransaction;
    }

    setBusy(true);
    setBundleResults(null);
    try {
      const res = await launchOnPump({
        connection,
        payerPublicKey: activeSignerPubKey,
        signTransaction: signerFn,
        name: cleanName,
        symbol: cleanSymbol,
        description,
        website,
        twitter,
        telegram,
        image,
        devBuySol: buySol,
        priorityFee: Number(priorityFee) || 0.0005,
        onStatus: setStatus,
      });

      setResult(res);
      setStatus("");

      // ── Block-0 Bundle Alımı ──
      if (enableBundle && subWallets.length > 0) {
        setBundleBusy(true);
        setStatus("⚡ Block-0 bundle alımları başlatılıyor…");
        try {
          const bundleOut = await executeSubWalletBundleBuys(
            connection,
            res.mint,
            subWallets,
            Number(bundleBuyAmount) || 0.01,
            Number(priorityFee) || 0.001,
            setStatus
          );
          setBundleResults(bundleOut.results);
          setStatus(
            `✅ Bundle tamamlandı: ${bundleOut.totalSuccess}/${bundleOut.results.length} başarılı · ${bundleOut.totalSolSpent.toFixed(3)} SOL`
          );
        } catch (bundleErr) {
          const msg = bundleErr instanceof Error ? bundleErr.message : String(bundleErr);
          setStatus(`⚠️ Bundle hatası: ${msg}`);
        } finally {
          setBundleBusy(false);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(/reject/i.test(msg) ? "Cüzdanda işlemi reddettiniz." : msg);
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full space-y-4 rounded-sm border border-[#1A1F26] bg-[#0c0e12] p-4 text-left font-mono text-xs">
      <div className="flex items-center justify-between border-b border-[#1A1F26] pb-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#00FFA3] animate-ping" />
          <h2 className="text-xs font-bold text-white tracking-tight uppercase">PUMP.FUN BONDING CURVE DEPLOYER</h2>
        </div>
        <span className="text-[9px] text-[#00FFA3] bg-[#00FFA3]/10 border border-[#00FFA3]/25 px-1.5 py-0.2 rounded-sm font-bold">
          BLOCK-0 BUNDLE READY
        </span>
      </div>

      <form onSubmit={handleLaunch} className="space-y-5">
        {/* Token Temel Bilgileri */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Token İsmi *" hint="Maks. 32 karakter">
            <input
              type="text"
              required
              maxLength={32}
              placeholder="Örn: Pepe King"
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Sembol (Ticker) *" hint="Maks. 10 karakter">
            <input
              type="text"
              required
              maxLength={10}
              placeholder="Örn: PEPE"
              className={inputClass}
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Açıklama" hint="Token&apos;ın hikayesi ve meme içeriği">
          <textarea
            rows={3}
            maxLength={500}
            placeholder="Topluluk temelli memecoin projesi..."
            className={inputClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        {/* Görsel Yükleme */}
        <Field label="Logo / Görsel *" hint="PNG, JPG, WEBP (Maks 2 MB)">
          <div className="flex items-center gap-4">
            <input
              type="file"
              accept={IMAGE_TYPES.join(",")}
              onChange={(e) => setImage(e.target.files?.[0] || null)}
              className="text-sm text-dim file:mr-4 file:rounded-lg file:border-0 file:bg-line file:px-4 file:py-2 file:text-sm file:font-semibold file:text-mist hover:file:bg-signal/20 hover:file:text-signal"
            />
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="Önizleme"
                className="h-14 w-14 rounded-full border border-line object-cover shadow-sm"
              />
            )}
          </div>
        </Field>

        {/* Sosyal Medya Linkleri */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Twitter / X Linki">
            <input
              type="url"
              placeholder="https://x.com/..."
              className={inputClass}
              value={twitter}
              onChange={(e) => setTwitter(e.target.value)}
            />
          </Field>
          <Field label="Telegram Grubu">
            <input
              type="url"
              placeholder="https://t.me/..."
              className={inputClass}
              value={telegram}
              onChange={(e) => setTelegram(e.target.value)}
            />
          </Field>
          <Field label="Web Sitesi">
            <input
              type="url"
              placeholder="https://..."
              className={inputClass}
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </Field>
        </div>

        {/* Geliştirici İlk Alım & Öncelik Ayarları */}
        <div className="rounded-lg border border-line bg-ink/60 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">Geliştirici İlk Alımı (Dev Buy)</span>
            <span className="text-xs text-dim">Token çıktığı anda ilk alımı yapın</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-dim block mb-1">İlk Alım Tutarı (SOL)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.0"
                className={inputClass}
                value={devBuySol}
                onChange={(e) => setDevBuySol(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-dim block mb-1">Priority Fee (Hızlandırma - SOL)</label>
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                className={inputClass}
                value={priorityFee}
                onChange={(e) => setPriorityFee(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Block-0 Bundle Alımı (Alt Cüzdanlar) */}
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input
                id="bundle-toggle"
                type="checkbox"
                checked={enableBundle}
                onChange={(e) => setEnableBundle(e.target.checked)}
                className="h-4 w-4 rounded border-line text-cyan-500 focus:ring-cyan-500 bg-ink cursor-pointer"
              />
              <label htmlFor="bundle-toggle" className="font-semibold text-sm text-cyan-400 cursor-pointer select-none">
                ⚡ Block-0 Bundle Alımı Yap (Alt Cüzdanlar)
              </label>
            </div>
            <span className="text-xs text-dim">
              {subWallets.length > 0 ? (
                <span className="text-emerald-400 font-mono">
                  {subWallets.filter((w) => (w.balanceSol || 0) >= (Number(bundleBuyAmount) || 0) + 0.002).length} / {subWallets.length} cüzdan hazır
                </span>
              ) : (
                <span className="text-amber-400">Alt cüzdan bulunamadı</span>
              )}
            </span>
          </div>

          {enableBundle && (
            <div className="space-y-3 pt-1 border-t border-cyan-500/20 text-xs">
              <p className="text-dim leading-relaxed">
                Token kontratı Pump.fun üzerinde oluştuktan hemen sonra, bakiyesi yeterli olan tüm alt cüzdanlardan aynı anda (paralel) alım emri gönderilir. Sıfır cüzdan popup onayı gerektirir.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-dim block mb-1">Cüzdan Başına Alım (SOL)</label>
                  <input
                    type="number"
                    step="0.005"
                    min="0.001"
                    placeholder="0.01"
                    className={inputClass}
                    value={bundleBuyAmount}
                    onChange={(e) => setBundleBuyAmount(e.target.value)}
                  />
                </div>
                <div className="flex flex-col justify-end">
                  <div className="rounded border border-line bg-ink/70 p-2.5 text-xs text-dim">
                    Tahmini Bundle Harcaması:{" "}
                    <span className="text-cyan-400 font-bold font-mono">
                      {(
                        subWallets.filter((w) => (w.balanceSol || 0) >= (Number(bundleBuyAmount) || 0) + 0.002).length *
                        (Number(bundleBuyAmount) || 0)
                      ).toFixed(3)}{" "}
                      SOL
                    </span>
                  </div>
                </div>
              </div>
              {subWallets.length === 0 && (
                <div className="rounded bg-amber-500/10 border border-amber-500/20 p-2 text-amber-300">
                  ⚠️ Henüz hiç alt cüzdan oluşturmadınız. Yan menüden <strong>Çoklu Cüzdan</strong> sekmesine gidip cüzdan üretebilir ve bakiye aktarabilirsiniz.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cüzdan Seçimi */}
        {hotWallet && (
          <label className="flex items-center gap-2 text-sm text-dim cursor-pointer">
            <input
              type="checkbox"
              checked={useHotWallet}
              onChange={(e) => setUseHotWallet(e.target.checked)}
              className="rounded border-line"
            />
            <span>Hızlı Hot Wallet ({shorten(hotWallet.publicKey.toBase58())}) ile imzala (Phantom onayı beklemez)</span>
          </label>
        )}

        <button type="submit" disabled={busy || bundleBusy} className={buttonClass}>
          {busy || bundleBusy ? status || "İşlem yürütülüyor…" : "🚀 Pump.fun'da Başlat"}
        </button>

        {error && (
          <p role="alert" className="text-sm text-signal font-medium">
            ⚠️ {error}
          </p>
        )}

        {result && (
          <div className="space-y-3 rounded-lg border border-signal/40 bg-signal/10 p-5 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-xl">🎉</span>
              <p className="text-base font-bold text-signal">Lansman Başarılı!</p>
            </div>
            <p className="text-mist">
              Token&apos;ınız Pump.fun üzerinde başarıyla oluşturuldu ve bonding curve alım satıma açıldı.
            </p>
            <div className="space-y-1 bg-ink/80 p-3 rounded border border-line">
              <p className="text-xs text-dim">Mint Adresi:</p>
              <code className="text-xs text-signal select-all block break-all font-mono">
                {result.mint}
              </code>
            </div>

            {/* Block-0 Bundle Sonuçları */}
            {bundleResults && bundleResults.length > 0 && (
              <div className="space-y-2 rounded-lg border border-cyan-500/30 bg-ink/80 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-cyan-400 flex items-center gap-1.5">
                    ⚡ Block-0 Bundle Alım Sonuçları ({bundleResults.filter((r) => r.success).length}/{bundleResults.length} Başarılı)
                  </span>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {bundleResults.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded bg-panel p-2 border border-line"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`inline-block h-2 w-2 rounded-full ${r.success ? "bg-emerald-400" : "bg-red-400"}`} />
                        <span className="font-mono text-mist font-medium">{r.walletLabel}</span>
                        <span className="text-dim font-mono">{shorten(r.walletPubKey)}</span>
                      </div>
                      {r.success && r.signature ? (
                        <a
                          href={`https://explorer.solana.com/tx/${r.signature}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-cyan-400 hover:underline font-mono"
                        >
                          {shorten(r.signature)} ↗
                        </a>
                      ) : (
                        <span className="text-red-400 truncate max-w-[180px]" title={r.error}>
                          {r.error || "Başarısız"}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5 pt-1.5">
              <Link
                href={`/token/${result.mint}`}
                className="rounded-sm border border-[#00E5FF] bg-[#00E5FF]/15 hover:bg-[#00E5FF] hover:text-black px-2.5 py-1 font-bold text-[#00E5FF] text-[10px] transition flex items-center gap-1"
              >
                📈 GRAFİK (URL) ↗
              </Link>
              <a
                href={`https://pump.fun/coin/${result.mint}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-sm bg-[#00FFA3] hover:bg-[#03E781] px-2.5 py-1 font-bold text-black text-[10px] transition flex items-center gap-1"
              >
                Pump.fun ↗
              </a>
              <a
                href={`https://explorer.solana.com/tx/${result.signature}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-sm border border-[#1A1F26] hover:border-slate-400 px-2 py-1 text-slate-400 hover:text-white text-[10px] transition"
              >
                Solana Explorer ↗
              </a>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                  `🚀 $${symbol} az önce @pumpfun üzerinde yayına girdi!\n\nKontrat: ${result.mint}\n\nhttps://pump.fun/coin/${result.mint}`
                )}`}
                target="_blank"
                rel="noreferrer"
                className={ghostButtonClass}
              >
                X&apos;te Duyur 📣
              </a>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
