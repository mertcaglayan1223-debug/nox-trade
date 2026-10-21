"use client";

import { FormEvent, useEffect, useState } from "react";
import { Draft } from "@/lib/draft";
import { Preset, loadPresets } from "@/lib/presets";
import QuickLaunch from "@/components/QuickLaunch";
import {
  Field,
  buttonClass,
  ghostButtonClass,
  inputClass,
} from "@/components/ui";

type Tweet = { text: string; author: string; handle: string; url: string };

function buildDescription(tweet: Tweet) {
  const credit = `\n\nKaynak: ${tweet.author || "@" + tweet.handle} (@${tweet.handle})`;
  return (tweet.text.slice(0, 500 - credit.length) + credit).trim();
}

function suggest(text: string) {
  const words = text
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const name = words.slice(0, 3).join(" ").slice(0, 32) || "Yeni Token";
  const symbol = (words[0] || "TOKEN").toUpperCase().slice(0, 6);
  return { name, symbol };
}

// Görsel fikri: @etiketleri, linkleri ve büyük harfle başlayan kelimeleri
// (özel isim olma ihtimali) atar, geriye genel konu kelimeleri bırakır.
function ideaFrom(text: string) {
  const words = text
    .replace(/https?:\/\/\S+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !/^[@#]/.test(w) && !/^\p{Lu}/u.test(w))
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase())
    .filter((w) => w.length >= 4);
  const unique = Array.from(new Set(words)).slice(0, 5);
  return unique.length > 0 ? unique.join(", ") : "funny mascot";
}

function hashString(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// İnternet ve yapay zeka gerektirmeyen basit logo: renkli zemin + sembol harfleri
async function makeLogoFile(symbol: string, seed: number): Promise<File> {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tarayıcı çizim desteği sunmuyor.");

  let h = hashString(`${symbol}:${seed}`);
  const rand = () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 4294967296;
  };

  const hue = Math.floor(rand() * 360);
  const hue2 = (hue + 40 + Math.floor(rand() * 80)) % 360;
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, `hsl(${hue}, 80%, 55%)`);
  gradient.addColorStop(1, `hsl(${hue2}, 80%, 40%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.fillStyle = `hsla(${hue2}, 90%, 80%, 0.18)`;
    ctx.arc(rand() * size, rand() * size, 30 + rand() * 90, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.arc(size / 2, size / 2, 190, 0, Math.PI * 2);
  ctx.fill();

  const text = symbol.trim().slice(0, 4).toUpperCase() || "?";
  ctx.fillStyle = `hsl(${hue}, 70%, 30%)`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${text.length > 3 ? 110 : 140}px system-ui, sans-serif`;
  ctx.fillText(text, size / 2, size / 2 + 6);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );
  if (!blob) throw new Error("Logo oluşturulamadı.");
  return new File([blob], "logo.png", { type: "image/png" });
}

export default function TweetDraft({ onUse }: { onUse: (d: Draft) => void }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tweet, setTweet] = useState<Tweet | null>(null);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [agree, setAgree] = useState(false);

  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetId, setPresetId] = useState("");

  const [idea, setIdea] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [imageError, setImageError] = useState<string | null>(null);
  const [logoSeed, setLogoSeed] = useState(0);

  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  async function handleFetch(e: FormEvent) {
    e.preventDefault();
    if (loading || !url.trim()) return;
    setLoading(true);
    setError(null);
    setTweet(null);
    setAgree(false);
    setImageFile(null);
    setImageUrl(null);
    setImageError(null);
    try {
      const res = await fetch(`/api/tweet?url=${encodeURIComponent(url.trim())}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Tweet alınamadı.");
      const t = json as Tweet;
      setTweet(t);
      const s = suggest(t.text);
      setName(s.name);
      setSymbol(s.symbol);
      setIdea(ideaFrom(t.text));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tweet alınamadı.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (generating || cooldown > 0) return;
    setGenerating(true);
    setImageError(null);
    try {
      const res = await fetch(
        `/api/image?idea=${encodeURIComponent(idea)}&seed=${Math.floor(
          Math.random() * 1e9
        )}`
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Görsel üretilemedi.");
      }
      const blob = await res.blob();
      const ext =
        blob.type === "image/png"
          ? "png"
          : blob.type === "image/webp"
          ? "webp"
          : blob.type === "image/gif"
          ? "gif"
          : "jpg";
      setImageFile(new File([blob], `token.${ext}`, { type: blob.type }));
      setImageUrl(URL.createObjectURL(blob));
    } catch (err) {
      setImageError(
        err instanceof Error ? err.message : "Görsel üretilemedi."
      );
    } finally {
      setGenerating(false);
      setCooldown(15);
    }
  }

  async function handleLogo() {
    setImageError(null);
    try {
      const file = await makeLogoFile(symbol, logoSeed + 1);
      setLogoSeed((n) => n + 1);
      setImageFile(file);
      setImageUrl(URL.createObjectURL(file));
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Logo oluşturulamadı.");
    }
  }

  function handleUse() {
    if (!tweet) return;
    const cleanName = name.trim().slice(0, 32);
    const cleanSymbol = symbol.trim().toUpperCase().slice(0, 10);
    if (!cleanName || !cleanSymbol) {
      setError("İsim ve sembol boş olamaz.");
      return;
    }
    const credit = `\n\nKaynak: ${tweet.author || "@" + tweet.handle} (@${tweet.handle})`;
    onUse({
      id: Date.now(),
      name: cleanName,
      symbol: cleanSymbol,
      description: (tweet.text.slice(0, 500 - credit.length) + credit).trim(),
      twitter: tweet.url,
      image: imageFile,
      presetId: presetId || undefined,
    });
  }

  return (
    <section className="w-full space-y-4 rounded-xl border border-line bg-panel p-5 text-left">
      <div>
        <h2 className="text-xl font-bold">Tweet&apos;ten token taslağı</h2>
        <p className="text-sm text-dim">
          Herkese açık bir tweet bağlantısı yapıştır. İsim, sembol, açıklama ve
          bir görsel hazırlanır, kayıtlı ön ayarın uygulanır ve token formu
          dolar. Son adımda Phantom&apos;da sen onaylarsın.
        </p>
      </div>

      <form onSubmit={handleFetch} className="space-y-2">
        <Field label="Tweet bağlantısı">
          <input
            className={inputClass}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://x.com/kullanici/status/..."
          />
        </Field>
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className={ghostButtonClass}
        >
          {loading ? "Getiriliyor…" : "Tweet'i getir"}
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-signal">
          {error}
        </p>
      )}

      {tweet && (
        <div className="space-y-4">
          <blockquote className="rounded-lg border border-line bg-ink p-4 text-sm">
            <p className="whitespace-pre-wrap">
              {tweet.text || "(Bu tweet'te metin bulunamadı)"}
            </p>
            <footer className="mt-2 text-dim">
              {tweet.author} (@{tweet.handle})
            </footer>
          </blockquote>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Token ismi (düzenleyebilirsin)">
              <input
                className={inputClass}
                value={name}
                maxLength={32}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Sembol (düzenleyebilirsin)">
              <input
                className={inputClass}
                value={symbol}
                maxLength={10}
                onChange={(e) => setSymbol(e.target.value)}
              />
            </Field>
          </div>

          <div className="space-y-2 rounded-lg border border-line bg-ink p-4">
            <p className="font-semibold">Görsel</p>
            <Field
              label="Görsel fikri (İngilizce kelimeler daha iyi sonuç verir)"
              hint="Gerçek kişi, marka ya da logo yazma. Görsel bunlardan uzak durması için yönlendirilir."
            >
              <input
                className={inputClass}
                value={idea}
                maxLength={120}
                onChange={(e) => setIdea(e.target.value)}
              />
            </Field>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating || cooldown > 0}
              className={ghostButtonClass}
            >
              {generating
                ? "Üretiliyor… (30 sn sürebilir)"
                : cooldown > 0
                ? `Tekrar üret (${cooldown} sn)`
                : imageUrl
                ? "Tekrar üret"
                : "Görsel üret"}
            </button>
            <button
              type="button"
              onClick={handleLogo}
              disabled={!symbol.trim()}
              className={ghostButtonClass}
            >
              {imageUrl ? "Başka bir basit logo" : "Basit logo oluştur (internet gerektirmez)"}
            </button>
            {imageError && (
              <p role="alert" className="text-sm text-signal">
                {imageError}
              </p>
            )}
            {imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt="Üretilen token görseli"
                className="h-32 w-32 rounded-lg border border-line object-cover"
              />
            )}
            <p className="text-xs text-dim">
              &quot;Görsel üret&quot; ücretsiz internet servislerini kullanır ve
              zaman zaman ödeme isteyip hata verebilir. &quot;Basit logo
              oluştur&quot; her zaman çalışır: sembolünden renkli bir logo çizer
              (yapay zeka değildir). İstersen formda kendi görselini de
              seçebilirsin.
            </p>
          </div>

          <Field
            label="Ön ayar"
            hint="Arz, yetkiler, yakma oranı ve linkler bu ön ayardan gelir."
          >
            <select
              className={inputClass}
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
            >
              <option value="">Ön ayar kullanma</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="rounded-lg border border-line bg-ink p-4 text-sm">
            <p className="mb-2 font-semibold">Önemli</p>
            <p className="text-dim">
              Başkasının adını, fotoğrafını ya da sözlerini kullanan bir token,
              o kişi onaylamadığı sürece onun projesiymiş gibi sunulmamalı.
              Alıcıları yanıltmak hem etik değil hem de hukuki risk taşır.
              Açıklamaya kaynağı otomatik ekliyoruz. Telegram ve web adresini
              yapay zeka açamaz, bunlar ön ayarından gelir.
            </p>
            <label className="mt-3 flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
              />
              <span>
                Bu token&apos;ın tweet sahibi tarafından onaylandığını ima
                etmeyeceğim.
              </span>
            </label>
          </div>

          <button
            type="button"
            disabled={!agree}
            onClick={handleUse}
            className={buttonClass}
          >
            Token formuna aktar
          </button>

          <QuickLaunch
            name={name}
            symbol={symbol}
            description={buildDescription(tweet)}
            twitterUrl={tweet.url}
            presetId={presetId}
            agree={agree}
            getImage={async () => imageFile ?? (await makeLogoFile(symbol, logoSeed + 1))}
          />
        </div>
      )}
    </section>
  );
}
