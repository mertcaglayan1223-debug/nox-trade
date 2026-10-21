"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  AuthorityType,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createBurnInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import { createMetadataInstruction } from "@/lib/metadata";
import { addActivity } from "@/lib/activity";
import { Draft } from "@/lib/draft";
import { Preset, loadPresets, savePresets } from "@/lib/presets";
import {
  Field,
  buttonClass,
  formatUnits,
  ghostButtonClass,
  inputClass,
  shorten,
} from "@/components/ui";

const MIN_SOL = 0.02; // mint + metadata + token hesabı için yaklaşık ücret payı
const MAX_SUPPLY = 1000000000000;
const U64_MAX = BigInt("18446744073709551615");
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

type Result = { mint: string; signature: string };

export default function TokenForm({ draft }: { draft?: Draft | null }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [supply, setSupply] = useState("1000000000");
  const [decimals, setDecimals] = useState("6");
  const [burnPercent, setBurnPercent] = useState("0");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [revokeMint, setRevokeMint] = useState(true);
  const [revokeFreeze, setRevokeFreeze] = useState(true);
  const [immutable, setImmutable] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetId, setPresetId] = useState("");
  const [presetName, setPresetName] = useState("");

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  // Kayıtlı ön ayarları yükle
  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  // Tweet'ten gelen taslağı forma uygula
  useEffect(() => {
    if (!draft) return;
    if (draft.presetId) applyPreset(draft.presetId);
    setName(draft.name);
    setSymbol(draft.symbol);
    setDescription(draft.description);
    setTwitter(draft.twitter);
    if (draft.image) setImage(draft.image);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  useEffect(() => {
    if (!image) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  // Sağdaki özet kartı için hesaplamalar
  const summary = useMemo(() => {
    const d = Number(decimals);
    const burn = Math.min(99, Number(burnPercent) || 0);
    let total: bigint | null = null;
    let remaining: bigint | null = null;
    if (/^\d+$/.test(supply) && supply.length > 0) {
      total = BigInt(supply);
      remaining = total - (total * BigInt(burn)) / BigInt(100);
    }
    return { d, burn, total, remaining };
  }, [supply, decimals, burnPercent]);

  function applyPreset(id: string) {
    setPresetId(id);
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    setSupply(p.supply);
    setDecimals(p.decimals);
    setBurnPercent(p.burnPercent);
    setRevokeMint(p.revokeMint);
    setRevokeFreeze(p.revokeFreeze);
    setImmutable(p.immutable);
    setWebsite(p.website);
    setTelegram(p.telegram);
    setPresetName(p.name);
  }

  function saveCurrentAsPreset() {
    const n = presetName.trim().slice(0, 30);
    if (!n) return;
    const existing = presets.find((x) => x.name === n);
    const preset: Preset = {
      id: existing?.id ?? `${Date.now()}`,
      name: n,
      supply,
      decimals,
      burnPercent,
      revokeMint,
      revokeFreeze,
      immutable,
      website,
      telegram,
    };
    const next = existing
      ? presets.map((x) => (x.id === existing.id ? preset : x))
      : [...presets, preset].slice(-10);
    setPresets(next);
    savePresets(next);
    setPresetId(preset.id);
  }

  function deletePreset() {
    if (!presetId) return;
    const next = presets.filter((x) => x.id !== presetId);
    setPresets(next);
    savePresets(next);
    setPresetId("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!publicKey) {
      return setError("Lütfen önce sağ üstteki butondan Phantom veya Solana cüzdanınızı bağlayın.");
    }
    if (busy) return;
    setError(null);
    setResult(null);

    const cleanName = name.trim();
    const cleanSymbol = symbol.trim().toUpperCase();
    const supplyNumber = Number(supply);
    const decimalsNumber = Number(decimals);
    const burn = Number(burnPercent || "0");

    if (!cleanName || cleanName.length > 32) {
      return setError("İsim 1 ile 32 karakter arasında olmalı.");
    }
    if (!cleanSymbol || cleanSymbol.length > 10) {
      return setError("Sembol 1 ile 10 karakter arasında olmalı.");
    }
    if (
      !/^\d+$/.test(supply) ||
      supplyNumber < 1 ||
      supplyNumber > MAX_SUPPLY
    ) {
      return setError("Arz 1 ile 1.000.000.000.000 arasında bir tam sayı olmalı.");
    }
    if (decimalsNumber !== 6 && decimalsNumber !== 9) {
      return setError("Ondalık sayısı 6 ya da 9 olmalı.");
    }
    const unit = BigInt(10) ** BigInt(decimalsNumber);
    if (BigInt(supply) * unit > U64_MAX) {
      return setError(
        "Bu arz, seçtiğin ondalık sayısıyla çok büyük. Arzı küçült ya da ondalığı 6 yap."
      );
    }
    if (!Number.isInteger(burn) || burn < 0 || burn > 99) {
      return setError("Yakılacak oran 0 ile 99 arasında bir tam sayı olmalı.");
    }
    if (!image) return setError("Bir görsel seçmelisin.");
    if (!IMAGE_TYPES.includes(image.type)) {
      return setError("Görsel PNG, JPG, GIF veya WEBP olmalı.");
    }
    if (image.size > MAX_IMAGE_BYTES) {
      return setError("Görsel en fazla 2 MB olabilir.");
    }

    setBusy(true);
    try {
      const balance = await connection.getBalance(publicKey);
      if (balance / LAMPORTS_PER_SOL < MIN_SOL) {
        throw new Error(
          `Yetersiz devnet SOL. En az ${MIN_SOL} SOL gerekiyor, cüzdanında ${(
            balance / LAMPORTS_PER_SOL
          ).toFixed(4)} SOL var.`
        );
      }

      // 1) Görsel ve metadata'yı IPFS'e yükle
      setStatus("Görsel ve bilgiler IPFS'e yükleniyor…");
      const fd = new FormData();
      fd.append("image", image);
      fd.append("name", cleanName);
      fd.append("symbol", cleanSymbol);
      fd.append("description", description);
      fd.append("website", website);
      fd.append("twitter", twitter);
      fd.append("telegram", telegram);
      const upload = await fetch("/api/upload", { method: "POST", body: fd });
      const uploadJson = await upload.json().catch(() => ({}));
      if (!upload.ok || !uploadJson.uri) {
        throw new Error(uploadJson.error || "Yükleme başarısız oldu.");
      }

      // 2) İşlemi hazırla
      setStatus("İşlem hazırlanıyor…");
      const mintKeypair = Keypair.generate();
      const rent = await getMinimumBalanceForRentExemptMint(connection);
      const ata = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        publicKey
      );
      const amount = BigInt(supply) * unit;
      const burnAmount = (amount * BigInt(burn)) / BigInt(100);

      const tx = new Transaction();
      tx.add(
        SystemProgram.createAccount({
          fromPubkey: publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: MINT_SIZE,
          lamports: rent,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMint2Instruction(
          mintKeypair.publicKey,
          decimalsNumber,
          publicKey,
          revokeFreeze ? null : publicKey,
          TOKEN_PROGRAM_ID
        ),
        createAssociatedTokenAccountIdempotentInstruction(
          publicKey,
          ata,
          publicKey,
          mintKeypair.publicKey
        ),
        createMetadataInstruction({
          mint: mintKeypair.publicKey,
          mintAuthority: publicKey,
          payer: publicKey,
          updateAuthority: publicKey,
          name: cleanName,
          symbol: cleanSymbol,
          uri: uploadJson.uri,
          isMutable: !immutable,
        }),
        createMintToInstruction(
          mintKeypair.publicKey,
          ata,
          publicKey,
          amount
        )
      );
      if (burnAmount > BigInt(0)) {
        tx.add(
          createBurnInstruction(
            ata,
            mintKeypair.publicKey,
            publicKey,
            burnAmount
          )
        );
      }
      if (revokeMint) {
        tx.add(
          createSetAuthorityInstruction(
            mintKeypair.publicKey,
            publicKey,
            AuthorityType.MintTokens,
            null
          )
        );
      }

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      // 3) Cüzdanda imzala ve gönder
      setStatus("Phantom'da işlemi onayla…");
      const signature = await sendTransaction(tx, connection, {
        signers: [mintKeypair],
      });

      setStatus("Zincirde onaylanıyor…");
      const confirmation = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );
      if (confirmation.value.err) {
        throw new Error("İşlem zincirde başarısız oldu.");
      }

      const mintAddress = mintKeypair.publicKey.toBase58();
      addActivity({
        type: "launch",
        mint: mintAddress,
        signature,
        label: `${cleanName} (${cleanSymbol}) oluşturuldu`,
      });
      setResult({ mint: mintAddress, signature });
      setStatus("");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(
        /reject/i.test(message) ? "Cüzdanda işlemi reddettin." : message
      );
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full space-y-4 rounded-xl border border-line bg-panel p-5"
    >
      <h2 className="text-left text-xl font-bold">Token oluştur</h2>

      <div className="space-y-2 rounded-lg border border-line bg-ink p-3 text-left">
        <p className="text-sm font-medium">Ön ayarlar</p>
        <select
          className={inputClass}
          value={presetId}
          onChange={(e) => applyPreset(e.target.value)}
          aria-label="Kayıtlı ön ayar"
        >
          <option value="">Ön ayar seç…</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            className={inputClass}
            value={presetName}
            maxLength={30}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Ön ayar adı"
            aria-label="Ön ayar adı"
          />
          <button
            type="button"
            className={ghostButtonClass}
            onClick={saveCurrentAsPreset}
          >
            Kaydet
          </button>
          {presetId && (
            <button
              type="button"
              className={ghostButtonClass}
              onClick={deletePreset}
            >
              Sil
            </button>
          )}
        </div>
        <p className="text-xs text-dim">
          Arz, ondalık, yakma oranı, yetkiler, metadata kilidi ve linkler
          kaydedilir. Bu tarayıcıda saklanır.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="İsim" hint="En fazla 32 karakter">
          <input
            className={inputClass}
            value={name}
            maxLength={32}
            onChange={(e) => setName(e.target.value)}
            placeholder="Örn. Test Coin"
          />
        </Field>
        <Field label="Sembol" hint="En fazla 10 karakter">
          <input
            className={inputClass}
            value={symbol}
            maxLength={10}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="TEST"
          />
        </Field>
      </div>

      <Field label="Açıklama">
        <textarea
          className={inputClass}
          rows={3}
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Toplam arz" hint="Örn. 1000000000 = bir milyar token">
          <input
            className={inputClass}
            inputMode="numeric"
            value={supply}
            onChange={(e) => setSupply(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
        <Field
          label="Ondalık sayısı"
          hint="6 (pump.fun gibi) ya da 9 (SOL gibi)"
        >
          <select
            className={inputClass}
            value={decimals}
            onChange={(e) => setDecimals(e.target.value)}
          >
            <option value="6">6</option>
            <option value="9">9</option>
          </select>
        </Field>
      </div>

      <Field
        label="Oluştururken yakılacak arz (%)"
        hint="0 ile 99 arası. Yakılan token kalıcı olarak yok olur ve toplam arz düşer."
      >
        <input
          className={inputClass}
          inputMode="numeric"
          value={burnPercent}
          onChange={(e) =>
            setBurnPercent(e.target.value.replace(/\D/g, "").slice(0, 2))
          }
        />
      </Field>

      <Field label="Görsel" hint="PNG, JPG, GIF veya WEBP, en fazla 2 MB">
        <input
          type="file"
          accept={IMAGE_TYPES.join(",")}
          className={inputClass}
          onChange={(e) => setImage(e.target.files?.[0] ?? null)}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4">
        <Field label="Web sitesi (isteğe bağlı)">
          <input
            className={inputClass}
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://"
          />
        </Field>
        <Field label="Twitter / X (isteğe bağlı)">
          <input
            className={inputClass}
            value={twitter}
            onChange={(e) => setTwitter(e.target.value)}
            placeholder="https://x.com/..."
          />
        </Field>
        <Field label="Telegram (isteğe bağlı)">
          <input
            className={inputClass}
            value={telegram}
            onChange={(e) => setTelegram(e.target.value)}
            placeholder="https://t.me/..."
          />
        </Field>
      </div>

      <div className="space-y-2 text-left text-sm">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={revokeMint}
            onChange={(e) => setRevokeMint(e.target.checked)}
          />
          <span>
            Mint yetkisini kapat (arz sabitlenir, sonradan yeni token basılamaz)
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={revokeFreeze}
            onChange={(e) => setRevokeFreeze(e.target.checked)}
          />
          <span>Freeze yetkisini kapat (kimsenin token&apos;ı dondurulamaz)</span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={immutable}
            onChange={(e) => setImmutable(e.target.checked)}
          />
          <span>
            Metadata&apos;yı değiştirilemez yap (isim, sembol ve görsel
            sonradan değişmez, geri alınamaz)
          </span>
        </label>
      </div>

      <div className="rounded-lg border border-line bg-ink p-4 text-left text-sm">
        <p className="mb-2 font-semibold">Özet</p>
        <div className="flex gap-3">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Seçilen görsel önizlemesi"
              className="h-16 w-16 shrink-0 rounded-lg border border-line object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-line text-xs text-dim">
              Görsel yok
            </div>
          )}
          <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-dim">Token</dt>
            <dd>
              {name.trim() || "—"}
              {symbol.trim() ? ` (${symbol.trim().toUpperCase()})` : ""}
            </dd>
            <dt className="text-dim">Toplam arz</dt>
            <dd>
              {summary.total !== null
                ? formatUnits(summary.total * BigInt(10) ** BigInt(summary.d), summary.d)
                : "—"}
            </dd>
            <dt className="text-dim">Cüzdanında kalacak</dt>
            <dd>
              {summary.remaining !== null
                ? formatUnits(
                    summary.remaining * BigInt(10) ** BigInt(summary.d),
                    summary.d
                  )
                : "—"}
              {summary.burn > 0 ? ` (%${summary.burn} yakılıyor)` : ""}
            </dd>
            <dt className="text-dim">Mint yetkisi</dt>
            <dd>{revokeMint ? "Kapalı" : "Sende"}</dd>
            <dt className="text-dim">Freeze yetkisi</dt>
            <dd>{revokeFreeze ? "Kapalı" : "Sende"}</dd>
            <dt className="text-dim">Metadata</dt>
            <dd>{immutable ? "Değiştirilemez" : "Değiştirilebilir"}</dd>
            <dt className="text-dim">Tahmini ücret</dt>
            <dd>≈ 0.01 SOL (Devnet)</dd>
          </dl>
        </div>
      </div>

      <button type="submit" disabled={busy} className={buttonClass}>
        {busy ? status || "Çalışıyor…" : "Token'ı oluştur"}
      </button>

      {error && (
        <p role="alert" className="text-left text-sm text-signal">
          {error}
        </p>
      )}

      {result && (
        <div className="space-y-2 rounded-lg border border-line bg-ink p-4 text-left text-sm">
          <p className="font-semibold">Token oluşturuldu 🎉</p>
          <p className="break-all">
            <span className="text-dim">Mint adresi: </span>
            {result.mint}
          </p>
          <p className="text-dim">
            Kısa adres: {shorten(result.mint)}. &quot;Token yönet&quot;
            sekmesinden yakabilir, gönderebilir ya da yetkilerini kapatabilirsin.
          </p>
          <p className="space-x-4">
            <a
              className="underline"
              target="_blank"
              rel="noreferrer"
              href={`https://explorer.solana.com/address/${result.mint}?cluster=devnet`}
            >
              Token&apos;ı explorer&apos;da aç
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
        </div>
      )}
    </form>
  );
}
