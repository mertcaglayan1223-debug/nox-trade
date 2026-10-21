"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type FeedTweet = {
  id: string;
  handle: string;
  text: string;
  createdAt: number | null;
  url: string;
};

type FeedResponse = {
  tweets?: FeedTweet[];
  errors?: { handle: string; error: string }[];
  creditsUsed?: number;
  error?: string;
  fatal?: boolean;
};

const HANDLES_KEY = "xfeed-handles";
const CREDITS_KEY = "xfeed-credits-used";
const CREDIT_LIMIT = 20000; // ücretsiz başlangıç kredisi
const STOP_AT = 0.9; // kredinin %90'ında otomatik dur
const CREDITS_PER_TWEET = 5;
const POLL_COUNT = 1; // her kontrolde hesap başına en yeni 1 tweet
const MAX_ITEMS = 60;
const MAX_HANDLES = 10;
const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
const INTERVALS = [3, 5, 10, 15];

function ago(time: number | null, now: number) {
  if (time === null) return "";
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 60) return `${seconds} sn önce`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  return `${Math.round(hours / 24)} gün önce`;
}

export default function XLiveFeed() {
  const [handles, setHandles] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [interval, setIntervalMin] = useState(5);
  const [running, setRunning] = useState(false);
  const [tweets, setTweets] = useState<FeedTweet[]>([]);
  const [used, setUsed] = useState(0);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const handlesRef = useRef<string[]>([]);
  const usedRef = useRef(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HANDLES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const list = parsed
            .filter((h) => typeof h === "string" && HANDLE_RE.test(h))
            .slice(0, MAX_HANDLES);
          setHandles(list);
          handlesRef.current = list;
        }
      }
      const rawUsed = Number(localStorage.getItem(CREDITS_KEY) || "0");
      if (Number.isFinite(rawUsed) && rawUsed > 0) {
        setUsed(rawUsed);
        usedRef.current = rawUsed;
      }
    } catch {
      // okunamazsa boş başla
    }
    setLoaded(true);

    fetch("/api/x-feed?status=1")
      .then((r) => r.json())
      .then((j) => setConfigured(Boolean(j.configured)))
      .catch(() => setConfigured(null));
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    handlesRef.current = handles;
    try {
      localStorage.setItem(HANDLES_KEY, JSON.stringify(handles));
    } catch {
      // sessizce geç
    }
  }, [handles, loaded]);

  const poll = useCallback(async () => {
    if (handlesRef.current.length === 0) return;
    if (usedRef.current >= CREDIT_LIMIT * STOP_AT) {
      setRunning(false);
      setError("Kredi bütçesinin %90'ına ulaşıldı, akış durduruldu.");
      return;
    }
    try {
      const res = await fetch(
        `/api/x-feed?handles=${encodeURIComponent(
          handlesRef.current.join(",")
        )}&count=${POLL_COUNT}`
      );
      const json = (await res.json().catch(() => ({}))) as FeedResponse;
      if (!res.ok) {
        setError(json.error || "Akış alınamadı.");
        if (json.fatal) setRunning(false);
        return;
      }
      setError(null);

      const total = usedRef.current + (json.creditsUsed || 0);
      usedRef.current = total;
      setUsed(total);
      try {
        localStorage.setItem(CREDITS_KEY, String(total));
      } catch {
        // sessizce geç
      }

      const fresh = json.tweets ?? [];
      setTweets((prev) => {
        const known = new Set(prev.map((t) => t.id));
        const added = fresh.filter((t) => !known.has(t.id));
        return [...added, ...prev]
          .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
          .slice(0, MAX_ITEMS);
      });
      setPartial(
        json.errors && json.errors.length > 0
          ? json.errors.map((e) => `@${e.handle}: ${e.error}`).join(" · ")
          : null
      );
    } catch {
      setError("Sunucuya ulaşılamadı.");
    }
  }, []);

  useEffect(() => {
    if (!running) return;
    poll();
    const id = setInterval(poll, interval * 60000);
    return () => clearInterval(id);
  }, [running, interval, poll]);

  function addHandle() {
    const clean = input.trim().replace(/^@/, "");
    if (!HANDLE_RE.test(clean)) {
      setError("Geçerli bir X kullanıcı adı yaz (harf, rakam, alt çizgi, en fazla 15).");
      return;
    }
    if (handles.some((h) => h.toLowerCase() === clean.toLowerCase())) {
      setError("Bu hesap zaten listede.");
      return;
    }
    if (handles.length >= MAX_HANDLES) {
      setError(`En fazla ${MAX_HANDLES} hesap izleyebilirsin.`);
      return;
    }
    setError(null);
    setHandles((prev) => [...prev, clean]);
    setInput("");
  }

  function removeHandle(handle: string) {
    setHandles((prev) => prev.filter((h) => h !== handle));
  }

  function resetCredits() {
    usedRef.current = 0;
    setUsed(0);
    try {
      localStorage.setItem(CREDITS_KEY, "0");
    } catch {
      // sessizce geç
    }
  }

  async function copyLink(tweet: FeedTweet) {
    try {
      await navigator.clipboard.writeText(tweet.url);
      setCopied(tweet.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("Panoya kopyalanamadı. Bağlantıyı elle kopyala.");
    }
  }

  const perHour =
    handles.length * (60 / interval) * CREDITS_PER_TWEET * POLL_COUNT;
  const remaining = Math.max(0, CREDIT_LIMIT * STOP_AT - used);
  const hoursLeft = perHour > 0 ? remaining / perHour : null;

  const card =
    "rounded-lg border border-axiom-border bg-axiom-card p-4";
  const fieldClass =
    "w-full rounded-md border border-axiom-border bg-axiom-bg px-3 py-2 text-sm text-white placeholder:text-axiom-textMuted focus:outline-none focus:ring-2 focus:ring-axiom-cyan";
  const btnClass =
    "h-9 rounded-md border border-axiom-borderLight px-3 text-sm font-semibold text-white transition hover:border-axiom-cyan focus:outline-none focus-visible:ring-2 focus-visible:ring-axiom-cyan disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-4 bg-axiom-bg p-4 text-white md:p-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Gerçek X akışı</h1>
          <p className="text-sm text-axiom-textMuted">
            İzlediğin hesapların en yeni tweet&apos;leri. Veri üçüncü taraf bir
            servisten (TwexAPI) gelir, X ile ilişkisi yoktur ve servis
            kesilebilir.
          </p>
        </div>
        <a className="text-sm underline text-axiom-cyan" href="/">
          Ana sayfa
        </a>
      </div>

      {configured === false && (
        <div role="alert" className={`${card} text-sm text-axiom-crimson`}>
          <p className="font-semibold">Servis anahtarı ayarlı değil.</p>
          <p>
            <code>.env.local</code> dosyana{" "}
            <code>TWEXAPI_KEY=anahtarın</code> satırını ekle ve{" "}
            <code>npm run dev</code>&apos;i yeniden başlat.
          </p>
        </div>
      )}

      <section className={`${card} space-y-3`}>
        <h2 className="font-semibold">İzlenen hesaplar</h2>
        <div className="flex gap-2">
          <input
            className={fieldClass}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addHandle();
            }}
            placeholder="kullaniciadi (@ olmadan)"
            aria-label="X kullanıcı adı"
          />
          <button type="button" onClick={addHandle} className={btnClass}>
            Ekle
          </button>
        </div>
        {handles.length === 0 ? (
          <p className="text-sm text-axiom-textMuted">Henüz hesap eklemedin.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {handles.map((h) => (
              <li
                key={h}
                className="flex items-center gap-2 rounded-full border border-axiom-border px-3 py-1 text-sm"
              >
                @{h}
                <button
                  type="button"
                  onClick={() => removeHandle(h)}
                  className="text-axiom-textMuted hover:text-white"
                  aria-label={`@${h} hesabını çıkar`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${card} space-y-3`}>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm">
            <span className="mr-2 text-axiom-textMuted">Kontrol aralığı</span>
            <select
              className="rounded-md border border-axiom-border bg-axiom-bg px-2 py-1 text-sm"
              value={interval}
              onChange={(e) => setIntervalMin(Number(e.target.value))}
            >
              {INTERVALS.map((m) => (
                <option key={m} value={m}>
                  {m} dk
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={handles.length === 0 || configured === false}
            onClick={() => setRunning((v) => !v)}
            className={btnClass}
          >
            {running ? "Durdur" : "Başlat"}
          </button>
          <span className="text-sm text-axiom-textMuted">
            {running ? "● Çalışıyor" : "Durdu"}
          </span>
        </div>

        <div className="text-sm text-axiom-textMuted">
          <p>
            Kredi: {used.toLocaleString("tr-TR")} /{" "}
            {CREDIT_LIMIT.toLocaleString("tr-TR")} kullanıldı (tahmini).{" "}
            <button type="button" onClick={resetCredits} className="underline">
              Sayacı sıfırla
            </button>
          </p>
          <p>
            Bu ayarla yaklaşık {Math.round(perHour)} kredi/saat harcanır
            {hoursLeft !== null
              ? `, bütçenin %90'ı yaklaşık ${
                  hoursLeft < 48
                    ? `${Math.round(hoursLeft)} saatte`
                    : `${Math.round(hoursLeft / 24)} günde`
                } biter.`
              : "."}{" "}
            Her aralıkta hesap başına {POLL_COUNT} tweet okunur ({POLL_COUNT * CREDITS_PER_TWEET}{" "}
            kredi). %90&apos;a gelince akış kendiliğinden durur.
          </p>
        </div>
      </section>

      {error && (
        <p role="alert" className="text-sm text-axiom-crimson">
          {error}
        </p>
      )}
      {partial && <p className="text-sm text-axiom-textMuted">{partial}</p>}

      <section className="space-y-2">
        {tweets.length === 0 ? (
          <p className="text-sm text-axiom-textMuted">
            Henüz tweet yok. Hesap ekleyip <strong>Başlat</strong>&apos;a bas.
          </p>
        ) : (
          tweets.map((t) => (
            <article key={t.id} className={card}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-axiom-cyan">@{t.handle}</span>
                <span className="text-axiom-textMuted">{ago(t.createdAt, now)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{t.text}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <a
                  className="underline"
                  href={t.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Tweet&apos;i aç
                </a>
                <button
                  type="button"
                  className="underline"
                  onClick={() => copyLink(t)}
                >
                  {copied === t.id ? "Kopyalandı" : "Bağlantıyı kopyala"}
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      <p className="text-xs text-axiom-textMuted">
        Bu tweet&apos;ler gerçek hesaplardan gelir. Bir tweet sahibinin sözlerini
        ya da adını kullanan bir token, o kişi onaylamadıkça onun projesiymiş
        gibi sunulmamalıdır.
      </p>
    </main>
  );
}
