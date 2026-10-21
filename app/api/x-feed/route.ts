import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Üçüncü taraf veri servisi (TwexAPI). X ile bağlantılı değildir.
const BASE = "https://api.twexapi.io/twitter";
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const CACHE_MS = 60000; // 60 saniye in-memory önbellek (kredi israfını önler)
const CREDITS_PER_TWEET = 5;

type FeedTweet = {
  id: string;
  handle: string;
  text: string;
  createdAt: number | null;
  url: string;
  authorName?: string;
  verified?: boolean;
  views?: string;
  retweets?: number;
  replies?: number;
  detectedCAs?: string[];
  imageUrl?: string;
};

const cache = new Map<string, { at: number; tweets: FeedTweet[] }>();
const durableTweetsMap = new Map<string, FeedTweet>();
let cachedBalance: { at: number; value: number } | null = null;

// Solana CA (Contract Address) Regex: 32-44 karakter Base58 (örneğin ...pump adresleri)
function extractSolanaCAs(text: string): string[] {
  const matches = text.match(/\b([1-9A-HJ-NP-Za-km-z]{32,44}(?:pump)?)\b/g) || [];
  return Array.from(new Set(matches)).filter((addr) => {
    if (addr.length < 32 || addr.length > 44) return false;
    if (/^(http|https|status|twitter|com|net|org|github|youtu)/i.test(addr)) return false;
    // En azından 1 rakam veya büyük/küçük harf karışımı içermeli
    return /[0-9]/.test(addr) && /[A-Z]/.test(addr);
  });
}

async function fetchTwexBalance(key: string): Promise<number | null> {
  if (cachedBalance && Date.now() - cachedBalance.at < 30000) {
    return cachedBalance.value;
  }
  try {
    const res = await fetch("https://api.twexapi.io/balance", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      if (typeof data.data === "number") {
        cachedBalance = { at: Date.now(), value: data.data };
        return data.data;
      }
    }
  } catch {}
  return cachedBalance?.value ?? null;
}

function parseDate(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

// Birden fazla API anahtarı desteği (virgülle ayrılmış): biri biterse diğerine geçer
function pickKeys(): string[] {
  const raw = process.env.TWEXAPI_KEYS || process.env.TWEXAPI_KEY || "";
  return raw
    .split(/[,;\n]+/)
    .map((k) => k.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const keys = pickKeys();
  const primaryKey = keys[0] || "";

  if (params.get("status") === "1") {
    const balance = primaryKey ? await fetchTwexBalance(primaryKey) : null;
    return NextResponse.json({ configured: Boolean(primaryKey), balance, keysCount: keys.length });
  }
  if (!primaryKey) {
    return NextResponse.json(
      {
        error:
          "TWEXAPI_KEY ayarlı değil. .env.local dosyasına ekle ve siteyi yeniden başlat.",
        fatal: true,
      },
      { status: 503 }
    );
  }

  const handles = Array.from(
    new Set(
      (params.get("handles") || "")
        .split(",")
        .map((h) => h.trim().replace(/^@/, ""))
        .filter((h) => HANDLE.test(h))
        .map((h) => h.toLowerCase())
    )
  ).slice(0, 10);
  if (handles.length === 0) {
    return NextResponse.json(
      { error: "Geçerli bir hesap adı yok." },
      { status: 400 }
    );
  }

  const countParam = Number(params.get("count"));
  const count = Math.min(5, Math.max(1, Number.isFinite(countParam) ? countParam : 1));

  const tweets: FeedTweet[] = [];
  const errors: { handle: string; error: string }[] = [];
  let fetchedTotal = 0;

  for (const handle of handles) {
    const cacheKey = `${handle}:${count}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      tweets.push(...hit.tweets);
      continue;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let success = false;

    // Anahtar rotasyonu: primaryKey ile dene, hata verirse yedek anahtarlara geç
    for (const key of keys) {
      try {
        const url = `${BASE}/${encodeURIComponent(handle)}/timeline/page`;
        const authHeaders = { Authorization: `Bearer ${key}` };
        let res = await fetch(url, {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ next_cursor: "", count }),
          signal: controller.signal,
          cache: "no-store",
        });
        if (res.status === 404 || res.status === 405) {
          res = await fetch(`${url}?count=${count}`, {
            method: "GET",
            headers: authHeaders,
            signal: controller.signal,
            cache: "no-store",
          });
        }

        if (!res.ok) {
          // Bu key bittiyse veya reddettiyse sıradakine geç
          continue;
        }

        const json = await res.json().catch(() => null);
        const candidates = [json?.data, json?.tweets, json?.data?.tweets, json?.result];
        const found = candidates.find((c) => Array.isArray(c)) as unknown[] | undefined;
        const rows: unknown[] = found ?? [];
        const list: FeedTweet[] = [];

        for (const row of rows) {
          const r = row as Record<string, unknown>;
          const rawId = r.tweet_id ?? r.id_str ?? r.id;
          const id = rawId === undefined || rawId === null ? "" : String(rawId);
          const text =
            typeof r.full_text === "string"
              ? r.full_text
              : typeof r.text === "string"
              ? r.text
              : "";
          if (!/^\d{5,25}$/.test(id) || !text) continue;

          const detectedCAs = extractSolanaCAs(text);
          let imageUrl: string | undefined = undefined;
          if (Array.isArray(r.media) && (r.media[0] as any)?.media_url_https) {
            imageUrl = (r.media[0] as any).media_url_https;
          } else if (r.extended_entities && Array.isArray((r.extended_entities as any).media)) {
            imageUrl = (r.extended_entities as any).media[0]?.media_url_https;
          }

          const tweetItem: FeedTweet = {
            id,
            handle,
            text: text.slice(0, 600),
            createdAt: parseDate(r.created_at),
            url: `https://x.com/${handle}/status/${id}`,
            authorName: typeof r.author_name === "string" ? r.author_name : typeof r.user_name === "string" ? r.user_name : undefined,
            verified: Boolean(r.author_is_blue_verified || r.author_verified),
            views: r.view_count ? String(r.view_count) : undefined,
            retweets: typeof r.retweet_count === "number" ? r.retweet_count : undefined,
            replies: typeof r.reply_count === "number" ? r.reply_count : undefined,
            detectedCAs: detectedCAs.length > 0 ? detectedCAs : undefined,
            imageUrl,
          };

          list.push(tweetItem);
          durableTweetsMap.set(id, tweetItem);
        }

        if (list.length > 0) {
          fetchedTotal += list.length;
          cache.set(cacheKey, { at: Date.now(), tweets: list });
          tweets.push(...list);
          success = true;
          break; // Başarılı oldu, sonraki hesaba geç
        }
      } catch {
        // sonraki key'i dene
      }
    }

    clearTimeout(timer);

    // Canlı istek yapılamadıysa veya boş döndüyse, ring buffer'dan önceki tweetleri getir (akış asla kesilmez)
    if (!success) {
      const fallbackList = Array.from(durableTweetsMap.values())
        .filter((t) => t.handle.toLowerCase() === handle.toLowerCase())
        .slice(0, count);

      if (fallbackList.length > 0) {
        tweets.push(...fallbackList);
      }
    }

    // Servisi yormamak için hesaplar arasında kısa bekleme
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  tweets.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  const remainingCredits = await fetchTwexBalance(primaryKey);
  return NextResponse.json({
    tweets,
    errors,
    creditsUsed: fetchedTotal * CREDITS_PER_TWEET,
    remainingCredits,
  });
}
