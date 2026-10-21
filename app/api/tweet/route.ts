import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Yalnızca twitter.com / x.com tweet bağlantılarına izin verilir
const TWEET_URL =
  /^https?:\/\/(?:www\.|mobile\.)?(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})/i;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&nbsp;": " ",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
};

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d{1,6});/g, (_, code) => {
      const n = Number(code);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    })
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e)
    .replace(/https?:\/\/t\.co\/\S+/g, "")
    .replace(/pic\.twitter\.com\/\S+/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("url") || "";
  const match = raw.trim().match(TWEET_URL);
  if (!match) {
    return NextResponse.json(
      {
        error:
          "Geçerli bir tweet bağlantısı değil. Örnek: https://x.com/kullanici/status/1234567890",
      },
      { status: 400 }
    );
  }

  const canonical = `https://twitter.com/${match[1]}/status/${match[2]}`;
  try {
    const res = await fetch(
      `https://publish.twitter.com/oembed?omit_script=1&dnt=true&url=${encodeURIComponent(
        canonical
      )}`,
      { headers: { Accept: "application/json" }, cache: "no-store" }
    );
    if (!res.ok) {
      return NextResponse.json(
        {
          error:
            res.status === 404
              ? "Tweet bulunamadı ya da herkese açık değil."
              : `Tweet servisi hata verdi (${res.status}). Biraz sonra tekrar dene.`,
        },
        { status: 502 }
      );
    }
    const data = await res.json();
    const html = typeof data.html === "string" ? data.html : "";
    const paragraph = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const text = htmlToText(paragraph ? paragraph[1] : "").slice(0, 500);

    return NextResponse.json({
      text,
      author:
        typeof data.author_name === "string"
          ? data.author_name.slice(0, 60)
          : "",
      handle: match[1],
      url: canonical,
    });
  } catch {
    return NextResponse.json(
      { error: "Tweet alınamadı. İnternet bağlantını kontrol et." },
      { status: 502 }
    );
  }
}
