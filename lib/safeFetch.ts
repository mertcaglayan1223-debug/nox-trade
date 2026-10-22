// Sunucu tarafı yardımcı: yalnızca izinli IPFS/Arweave/CDN adreslerine, yönlendirmeleri
// tek tek doğrulayarak ve boyut sınırıyla istek atar (SSRF koruması).

const EXACT_HOSTS = new Set([
  "ipfs.io",
  "cf-ipfs.com",
  "cloudflare-ipfs.com",
  "gateway.pinata.cloud",
  "pump.mypinata.cloud",
  "arweave.net",
  "nftstorage.link",
  "dweb.link",
  "w3s.link",
  "gateway.irys.xyz",
  "cdn.dexscreener.com",
]);
const SUFFIX_HOSTS = [
  ".ipfs.dweb.link",
  ".ipfs.w3s.link",
  ".ipfs.nftstorage.link",
  ".ipfs.cf-ipfs.com",
  ".mypinata.cloud",
  ".arweave.net",
];

export function normalizeAllowedUrl(raw: string): URL | null {
  let s = raw.trim();
  if (!s || s.length > 500) return null;
  if (s.startsWith("ipfs://")) {
    s = "https://ipfs.io/ipfs/" + s.slice(7).replace(/^ipfs\//, "");
  }
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "443") return null;
  const host = url.hostname.toLowerCase();
  const ok =
    EXACT_HOSTS.has(host) || SUFFIX_HOSTS.some((suffix) => host.endsWith(suffix));
  return ok ? url : null;
}

async function readCapped(res: Response, max: number): Promise<Uint8Array | null> {
  const reader = res.body?.getReader();
  if (!reader) {
    const all = new Uint8Array(await res.arrayBuffer());
    return all.byteLength <= max ? all : null;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export type SafeResult =
  | { ok: true; bytes: Uint8Array; type: string }
  | { ok: false; status: number };

export async function safeGet(
  start: URL,
  options: { maxBytes: number; timeoutMs: number; accept: string }
): Promise<SafeResult> {
  let url = start;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    for (let hop = 0; hop < 4; hop++) {
      const res = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: options.accept, "User-Agent": "memecoin-deployer/1.0" },
        cache: "no-store",
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return { ok: false, status: 502 };
        const next = normalizeAllowedUrl(new URL(location, url).toString());
        if (!next) return { ok: false, status: 502 };
        url = next;
        continue;
      }
      if (!res.ok) return { ok: false, status: res.status };
      const bytes = await readCapped(res, options.maxBytes);
      if (!bytes) return { ok: false, status: 413 };
      const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      return { ok: true, bytes, type };
    }
    return { ok: false, status: 502 };
  } catch {
    return { ok: false, status: 504 };
  } finally {
    clearTimeout(timer);
  }
}
