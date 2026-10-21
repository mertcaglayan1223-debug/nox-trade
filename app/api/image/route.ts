import { NextResponse } from "next/server";

export const runtime = "nodejs";

const POLLINATIONS = "https://image.pollinations.ai/prompt/";
const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function imageResponse(bytes: Uint8Array, type: string) {
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": type, "Cache-Control": "no-store" },
  });
}

// Cloudflare Workers AI (ücretsiz günlük hak): .env.local içinde
// CLOUDFLARE_ACCOUNT_ID ve CLOUDFLARE_API_TOKEN varsa bu kullanılır.
async function viaCloudflare(
  account: string,
  token: string,
  prompt: string,
  signal: AbortSignal
) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
      account
    )}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, steps: 8 }),
      signal,
    }
  );

  if (res.status === 401 || res.status === 403) {
    return fail(
      "Cloudflare anahtarı geçersiz ya da yetkisiz. .env.local dosyasını kontrol et.",
      502
    );
  }
  if (res.status === 429) {
    return fail("Cloudflare günlük ücretsiz hakkı doldu. Yarın tekrar dene.", 429);
  }
  if (!res.ok) {
    return fail(`Cloudflare görsel servisi hata verdi (${res.status}).`, 502);
  }

  const json = await res.json().catch(() => null);
  const base64 = json?.result?.image;
  if (typeof base64 !== "string") {
    return fail("Cloudflare beklenmeyen bir yanıt döndürdü.", 502);
  }
  const bytes = new Uint8Array(Buffer.from(base64, "base64"));
  if (bytes.byteLength > MAX_BYTES) {
    return fail("Üretilen görsel çok büyük.", 502);
  }
  const type = bytes[0] === 0x89 ? "image/png" : "image/jpeg";
  return imageResponse(bytes, type);
}

async function viaPollinations(
  prompt: string,
  seed: string,
  signal: AbortSignal
) {
  const res = await fetch(
    `${POLLINATIONS}${encodeURIComponent(
      prompt
    )}?width=512&height=512&model=flux&nologo=true&seed=${seed}`,
    { signal, cache: "no-store" }
  );

  if (res.status === 402) {
    return fail(
      "Ücretsiz anonim görsel servisi artık ödeme istiyor (402). \"Basit logo oluştur\" butonunu kullan ya da ücretsiz bir Cloudflare anahtarı ekle.",
      402
    );
  }
  if (res.status === 429) {
    return fail(
      "Ücretsiz görsel servisi meşgul. Biraz bekleyip tekrar dene ya da \"Basit logo oluştur\"u kullan.",
      429
    );
  }
  if (!res.ok) {
    return fail(`Görsel servisi hata verdi (${res.status}).`, 502);
  }
  const type = (res.headers.get("content-type") || "").split(";")[0].trim();
  if (!ALLOWED.includes(type)) {
    return fail("Görsel servisi beklenmeyen bir yanıt döndürdü.", 502);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) {
    return fail("Üretilen görsel çok büyük.", 502);
  }
  return imageResponse(bytes, type);
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;

  const idea =
    (params.get("idea") || "")
      .replace(/[^\p{L}\p{N}\s,]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "funny mascot";

  const seedParam = params.get("seed") || "";
  const seed = /^\d{1,9}$/.test(seedParam)
    ? seedParam
    : String(Math.floor(Math.random() * 1e9));

  // Gerçek kişi, marka logosu ve yazı istemeyen sabit bir çerçeve
  const prompt =
    "meme coin mascot logo, cute cartoon animal or object, flat vector illustration, " +
    "centered, plain background, no text, no letters, no real people, no brand logos, " +
    `theme: ${idea}`;

  const account = (process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const token = (process.env.CLOUDFLARE_API_TOKEN || "").trim();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    if (account && token) {
      return await viaCloudflare(account, token, prompt, controller.signal);
    }
    return await viaPollinations(prompt, seed, controller.signal);
  } catch {
    return fail("Görsel üretilemedi. Servis kapalı ya da yavaş olabilir.", 504);
  } finally {
    clearTimeout(timer);
  }
}
