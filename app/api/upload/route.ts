import { NextResponse } from "next/server";

export const runtime = "nodejs";

const PINATA_UPLOAD_URL = "https://uploads.pinata.cloud/v3/files";
const IPFS_GATEWAY = "https://ipfs.io/ipfs/";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

function clean(value: FormDataEntryValue | null, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanUrl(value: FormDataEntryValue | null): string {
  const v = clean(value, 200);
  return /^https?:\/\//i.test(v) ? v : "";
}

async function pinToIpfs(jwt: string, file: Blob, fileName: string) {
  const form = new FormData();
  form.append("network", "public");
  form.append("file", file, fileName);

  const res = await fetch(PINATA_UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Pinata hatası (${res.status}): ${text.slice(0, 200)}`);
  }
  let cid: string | undefined;
  try {
    cid = JSON.parse(text)?.data?.cid;
  } catch {
    // aşağıdaki kontrol hatayı verecek
  }
  if (!cid) throw new Error("Pinata bir CID döndürmedi.");
  return cid;
}

export async function POST(req: Request) {
  const jwt = (process.env.PINATA_JWT || "").trim().replace(/^["']|["']$/g, "");
  if (!jwt) {
    return NextResponse.json(
      {
        error:
          "PINATA_JWT ayarlı değil. .env.local dosyasını kontrol et ve siteyi yeniden başlat.",
      },
      { status: 500 }
    );
  }

  try {
    const form = await req.formData();
    const image = form.get("image");
    const name = clean(form.get("name"), 32);
    const symbol = clean(form.get("symbol"), 10);
    const description = clean(form.get("description"), 500);

    if (!name || !symbol) {
      return NextResponse.json(
        { error: "İsim ve sembol zorunlu." },
        { status: 400 }
      );
    }
    if (!image || typeof image === "string") {
      return NextResponse.json({ error: "Görsel seçmelisin." }, { status: 400 });
    }
    if (!IMAGE_TYPES.includes(image.type)) {
      return NextResponse.json(
        { error: "Görsel PNG, JPG, GIF veya WEBP olmalı." },
        { status: 400 }
      );
    }
    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Görsel en fazla 2 MB olabilir." },
        { status: 400 }
      );
    }

    const website = cleanUrl(form.get("website"));
    const twitter = cleanUrl(form.get("twitter"));
    const telegram = cleanUrl(form.get("telegram"));

    // 1) Görseli yükle
    const imageCid = await pinToIpfs(jwt, image, image.name || "token-image");
    const imageUri = IPFS_GATEWAY + imageCid;

    // 2) Metadata JSON'unu yükle
    const metadata = {
      name,
      symbol,
      description,
      image: imageUri,
      external_url: website || undefined,
      properties: {
        files: [{ uri: imageUri, type: image.type }],
        category: "image",
      },
      extensions: {
        website: website || undefined,
        twitter: twitter || undefined,
        telegram: telegram || undefined,
      },
    };
    const metadataBlob = new Blob([JSON.stringify(metadata)], {
      type: "application/json",
    });
    const metadataCid = await pinToIpfs(jwt, metadataBlob, "metadata.json");

    return NextResponse.json({ uri: IPFS_GATEWAY + metadataCid });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Yükleme başarısız.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
