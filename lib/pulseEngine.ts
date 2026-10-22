"use client";

import { useEffect, useRef, useState } from "react";

// Pulse için gerçek veri motoru.
// Kaynaklar: PumpPortal WebSocket (yeni token, işlemler, migrasyon), tokenın metadata'sı
// (görsel + sosyal linkler), DexScreener (migrate olanlar), Binance/Coinbase (SOL fiyatı).
// Hesaplanamayan değerler (ör. bundle %) uydurulmaz; 0 ve "bilinmiyor" olarak bırakılır.

export type PulseToken = {
  mint: string;
  name: string;
  symbol: string;
  signature: string;
  marketCapSol: number;
  marketCapUsd: number;
  curveProgress: number; // 0-100 (bonding curve doluluğu)
  solInCurve: number; // eğriye giren gerçek SOL
  time: number;
  bundlePercent: number; // 0 = hesaplanmıyor
  top10Percent: number; // akışta gözlenen bakiyelerden
  devHoldingPercent: number;
  isDevSold: boolean;
  txCount: number;
  volumeSol: number;
  twitter?: string;
  telegram?: string;
  website?: string;
  justUpdated?: boolean;
  // gerçek veri alanları
  image?: string;
  description?: string;
  volumeUsd: number;
  buys: number;
  sells: number;
  holders: number;
  holdersKnown: boolean;
  devKnown: boolean;
  migrated: boolean;
  liquidityUsd: number;
  creator?: string;
  source: "pump" | "dex";
};

type Internal = PulseToken & {
  uri?: string;
  balances: Map<string, number>;
  creatorBalance: number;
  vSol: number;
  metaTries: number;
  migratedAt?: number;
  alerted: boolean;
  dexMcapUsd?: number;
  dexVolumeUsd?: number;
  dexLiquidityUsd?: number;
};

const WS_URL = "wss://pumpportal.fun/api/data";
const TOTAL_SUPPLY = 1000000000;
const VIRTUAL_SOL = 30; // pump.fun bonding curve başlangıç sanal SOL'u
const GRADUATION_SOL = 85; // migrasyon için eğriye girmesi gereken gerçek SOL (yaklaşık)
const MAX_TOKENS = 300;
const FLUSH_MS = 500;

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function progressFrom(vSol: number) {
  return Math.min(100, Math.max(0, ((vSol - VIRTUAL_SOL) / GRADUATION_SOL) * 100));
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function blank(mint: string): Internal {
  return {
    mint,
    name: `Token ${mint.slice(0, 4)}`,
    symbol: "…",
    signature: "",
    marketCapSol: 0,
    marketCapUsd: 0,
    curveProgress: 0,
    solInCurve: 0,
    time: Date.now(),
    bundlePercent: 0,
    top10Percent: 0,
    devHoldingPercent: 0,
    isDevSold: false,
    txCount: 0,
    volumeSol: 0,
    volumeUsd: 0,
    buys: 0,
    sells: 0,
    holders: 0,
    holdersKnown: false,
    devKnown: false,
    migrated: false,
    liquidityUsd: 0,
    source: "pump",
    balances: new Map(),
    creatorBalance: 0,
    vSol: VIRTUAL_SOL,
    metaTries: 0,
    alerted: false,
  };
}

function toPulse(i: Internal, price: number): PulseToken {
  let top10 = 0;
  let holders = 0;
  if (i.source === "pump" && i.balances.size > 0) {
    const values = Array.from(i.balances.values())
      .filter((v) => v > 0)
      .sort((a, b) => b - a);
    holders = values.length;
    top10 = (values.slice(0, 10).reduce((s, v) => s + v, 0) / TOTAL_SUPPLY) * 100;
  }
  const devPct = i.devKnown ? (Math.max(0, i.creatorBalance) / TOTAL_SUPPLY) * 100 : 0;
  const mcapUsd = i.dexMcapUsd ?? i.marketCapSol * price;
  const volUsd = i.dexVolumeUsd ?? i.volumeSol * price;
  const liqUsd = i.dexLiquidityUsd ?? Math.max(0, i.vSol - VIRTUAL_SOL) * price;

  return {
    mint: i.mint,
    name: i.name,
    symbol: i.symbol,
    signature: i.signature,
    marketCapSol: i.marketCapSol,
    marketCapUsd: Math.round(mcapUsd),
    curveProgress: Number(i.curveProgress.toFixed(1)),
    solInCurve: Number(i.solInCurve.toFixed(2)),
    time: i.time,
    bundlePercent: 0,
    top10Percent: round1(top10),
    devHoldingPercent: round1(devPct),
    isDevSold: i.devKnown && i.creatorBalance <= 0,
    txCount: i.txCount,
    volumeSol: price > 0 ? Number((volUsd / price).toFixed(2)) : Number(i.volumeSol.toFixed(2)),
    twitter: i.twitter,
    telegram: i.telegram,
    website: i.website,
    image: i.image,
    description: i.description,
    volumeUsd: Math.round(volUsd),
    buys: i.buys,
    sells: i.sells,
    holders,
    holdersKnown: i.source === "pump" && i.balances.size > 0,
    devKnown: i.devKnown,
    migrated: i.migrated,
    liquidityUsd: Math.round(liqUsd),
    creator: i.creator,
    source: i.source,
  };
}

export function usePulseEngine(opts: {
  enabled: boolean;
  finalFrom: number;
  onFinalStretch?: () => void;
}) {
  const [tokens, setTokens] = useState<PulseToken[]>([]);
  const [solUsd, setSolUsd] = useState(0);
  const [status, setStatus] = useState("bağlanıyor");

  const store = useRef(new Map<string, Internal>());
  const dirty = useRef(false);
  const solRef = useRef(0);
  const alertRef = useRef(opts.onFinalStretch);
  const finalRef = useRef(opts.finalFrom);
  alertRef.current = opts.onFinalStretch;
  finalRef.current = opts.finalFrom;

  // SOL/USD fiyatı
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch("/api/sol-price");
        const json = await res.json();
        if (!stop && typeof json.usd === "number" && json.usd > 0) {
          solRef.current = json.usd;
          setSolUsd(json.usd);
          dirty.current = true;
        }
      } catch {
        // bir sonraki denemede tekrar
      }
    };
    load();
    const id = setInterval(load, 30000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  // Değişen verileri 500 ms'de bir toplu olarak ekrana yansıt
  useEffect(() => {
    const id = setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      const price = solRef.current;
      const sorted = Array.from(store.current.values()).sort(
        (a, b) => (b.migratedAt ?? b.time) - (a.migratedAt ?? a.time)
      );
      setTokens(sorted.map((i) => toPulse(i, price)));
    }, FLUSH_MS);
    return () => clearInterval(id);
  }, []);

  // Açılışta son migrasyonlarla "Migrated" sütununu doldur
  useEffect(() => {
    let stop = false;
    fetch("/api/recent-migrations")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (stop || !json || !Array.isArray(json.tokens)) return;
        for (const t of json.tokens) {
          if (typeof t?.mint !== "string" || !BASE58.test(t.mint)) continue;
          if (store.current.has(t.mint)) continue;
          const i = blank(t.mint);
          i.name = str(t.name, 60) || i.name;
          i.symbol = str(t.symbol, 16) || i.symbol;
          i.image = typeof t.image === "string" ? t.image : undefined;
          i.source = "dex";
          i.migrated = true;
          i.curveProgress = 100;
          i.time = num(t.createdAt) ?? Date.now();
          i.migratedAt = i.time;
          i.dexMcapUsd = num(t.marketCapUsd);
          i.dexVolumeUsd = num(t.volumeUsd);
          i.dexLiquidityUsd = num(t.liquidityUsd);
          i.txCount = num(t.txCount) ?? 0;
          store.current.set(t.mint, i);
        }
        dirty.current = true;
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, []);

  // WebSocket + metadata + DexScreener işçileri
  useEffect(() => {
    if (!opts.enabled) {
      setStatus("duraklatıldı");
      return;
    }

    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 0;
    let reconnect: ReturnType<typeof setTimeout> | null = null;

    const pendingSub = new Set<string>();
    const pendingUnsub = new Set<string>();
    const metaQueue: string[] = [];
    let metaInflight = 0;

    const send = (obj: unknown) => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    };

    const flushSubs = () => {
      if (pendingSub.size > 0) {
        const keys = Array.from(pendingSub).slice(0, 50);
        keys.forEach((k) => pendingSub.delete(k));
        send({ method: "subscribeTokenTrade", keys });
      }
      if (pendingUnsub.size > 0) {
        const keys = Array.from(pendingUnsub).slice(0, 50);
        keys.forEach((k) => pendingUnsub.delete(k));
        send({ method: "unsubscribeTokenTrade", keys });
      }
    };

    const evict = () => {
      if (store.current.size <= MAX_TOKENS) return;
      const candidates = Array.from(store.current.values())
        .filter((i) => !i.migrated)
        .sort((a, b) => a.time - b.time);
      for (const i of candidates) {
        if (store.current.size <= MAX_TOKENS) break;
        store.current.delete(i.mint);
        pendingUnsub.add(i.mint);
      }
      if (store.current.size > MAX_TOKENS) {
        const rest = Array.from(store.current.values()).sort(
          (a, b) => (a.migratedAt ?? a.time) - (b.migratedAt ?? b.time)
        );
        for (const i of rest) {
          if (store.current.size <= MAX_TOKENS) break;
          store.current.delete(i.mint);
        }
      }
    };

    const checkAlert = (i: Internal) => {
      if (!i.alerted && !i.migrated && i.curveProgress >= finalRef.current) {
        i.alerted = true;
        alertRef.current?.();
      }
    };

    const handleCreate = (d: Record<string, unknown>) => {
      const mint = str(d.mint, 60);
      if (!BASE58.test(mint) || store.current.has(mint)) return;
      const i = blank(mint);
      i.name = str(d.name, 60) || i.name;
      i.symbol = str(d.symbol, 16) || i.symbol;
      i.signature = str(d.signature, 100);
      i.uri = typeof d.uri === "string" ? d.uri.slice(0, 500) : undefined;
      i.creator = typeof d.traderPublicKey === "string" ? d.traderPublicKey : undefined;
      const vSol = num(d.vSolInBondingCurve);
      if (vSol !== undefined) {
        i.vSol = vSol;
        i.solInCurve = Math.max(0, vSol - VIRTUAL_SOL);
        i.curveProgress = progressFrom(vSol);
      }
      i.marketCapSol = num(d.marketCapSol) ?? 0;
      const initialBuy = num(d.initialBuy);
      if (i.creator && initialBuy !== undefined) {
        i.devKnown = true;
        i.creatorBalance = initialBuy;
        if (initialBuy > 0) {
          i.balances.set(i.creator, initialBuy);
          i.volumeSol += num(d.solAmount) ?? 0;
          i.txCount = 1;
          i.buys = 1;
        }
      }
      store.current.set(mint, i);
      evict();
      pendingSub.add(mint);
      if (i.uri) metaQueue.push(mint);
      dirty.current = true;
    };

    const handleTrade = (d: Record<string, unknown>) => {
      const mint = str(d.mint, 60);
      const i = store.current.get(mint);
      if (!i) return;
      // Migrasyon sonrası havuzdan gelen işlem
      if (typeof d.pool === "string" && d.pool !== "pump" && !i.migrated) {
        i.migrated = true;
        i.curveProgress = 100;
        i.migratedAt = Date.now();
        pendingUnsub.add(mint);
        dirty.current = true;
        return;
      }
      if (i.migrated) return;

      i.volumeSol += num(d.solAmount) ?? 0;
      i.txCount += 1;
      if (d.txType === "buy") i.buys += 1;
      else i.sells += 1;

      const vSol = num(d.vSolInBondingCurve);
      if (vSol !== undefined) {
        i.vSol = vSol;
        i.solInCurve = Math.max(0, vSol - VIRTUAL_SOL);
        i.curveProgress = progressFrom(vSol);
      }
      const mcap = num(d.marketCapSol);
      if (mcap !== undefined) i.marketCapSol = mcap;

      const wallet = typeof d.traderPublicKey === "string" ? d.traderPublicKey : "";
      const balance = num(d.newTokenBalance);
      if (wallet && balance !== undefined) {
        i.balances.set(wallet, balance);
        if (wallet === i.creator) {
          i.devKnown = true;
          i.creatorBalance = balance;
        }
      }
      checkAlert(i);
      dirty.current = true;
    };

    const handleMigrate = (d: Record<string, unknown>) => {
      const mint = str(d.mint, 60);
      if (!BASE58.test(mint)) return;
      let i = store.current.get(mint);
      if (!i) {
        i = blank(mint);
        i.source = "dex";
        store.current.set(mint, i);
      }
      i.migrated = true;
      i.curveProgress = 100;
      i.migratedAt = Date.now();
      pendingUnsub.add(mint);
      evict();
      dirty.current = true;
    };

    const onMessage = (event: MessageEvent) => {
      try {
        const d = JSON.parse(String(event.data)) as Record<string, unknown>;
        if (!d || typeof d !== "object" || typeof d.mint !== "string") return;
        const type = d.txType;
        if (type === "create" || (!type && d.name && d.symbol && d.uri)) handleCreate(d);
        else if (type === "buy" || type === "sell") handleTrade(d);
        else if (type === "migrate") handleMigrate(d);
      } catch {
        // bozuk mesajı atla
      }
    };

    const connect = () => {
      setStatus("bağlanıyor");
      ws = new WebSocket(WS_URL);
      ws.onopen = () => {
        retry = 0;
        setStatus("bağlı");
        send({ method: "subscribeNewToken" });
        send({ method: "subscribeMigration" });
        store.current.forEach((i) => {
          if (!i.migrated && i.source === "pump") pendingSub.add(i.mint);
        });
      };
      ws.onmessage = onMessage;
      ws.onclose = () => {
        if (closed) return;
        setStatus("koptu, yeniden deneniyor");
        retry += 1;
        reconnect = setTimeout(connect, Math.min(15000, 1000 * 2 ** retry));
      };
      ws.onerror = () => ws?.close();
    };
    connect();

    const subTimer = setInterval(flushSubs, 400);

    // Metadata (görsel + sosyal linkler): aynı anda en fazla 3 istek
    const metaTimer = setInterval(() => {
      while (metaInflight < 3 && metaQueue.length > 0) {
        const mint = metaQueue.shift()!;
        const i = store.current.get(mint);
        if (!i || !i.uri) continue;
        metaInflight += 1;
        fetch(`/api/token-meta?uri=${encodeURIComponent(i.uri)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => {
            if (j && typeof j === "object") {
              i.image = typeof j.image === "string" ? j.image : i.image;
              i.twitter = typeof j.twitter === "string" ? j.twitter : i.twitter;
              i.telegram = typeof j.telegram === "string" ? j.telegram : i.telegram;
              i.website = typeof j.website === "string" ? j.website : i.website;
              i.description = typeof j.description === "string" ? j.description : i.description;
              dirty.current = true;
            } else if (i.metaTries < 3) {
              i.metaTries += 1;
              setTimeout(() => metaQueue.push(mint), 4000 * i.metaTries);
            }
          })
          .catch(() => {
            if (i.metaTries < 3) {
              i.metaTries += 1;
              setTimeout(() => metaQueue.push(mint), 4000 * i.metaTries);
            }
          })
          .finally(() => {
            metaInflight -= 1;
          });
      }
    }, 300);

    // Migrate olan tokenlar için DexScreener verisi (15 sn'de bir, en yeni 10 token)
    let dexBusy = false;
    const dexTimer = setInterval(async () => {
      if (dexBusy) return;
      dexBusy = true;
      try {
        const list = Array.from(store.current.values())
          .filter((i) => i.migrated)
          .sort((a, b) => (b.migratedAt ?? b.time) - (a.migratedAt ?? a.time))
          .slice(0, 10);
        for (const i of list) {
          try {
            const res = await fetch(`/api/dex-token?mint=${i.mint}`);
            if (!res.ok) continue;
            const j = await res.json();
            if (j.name && i.symbol === "…") i.name = String(j.name);
            if (j.symbol && i.symbol === "…") i.symbol = String(j.symbol);
            if (typeof j.image === "string" && !i.image) i.image = j.image;
            if (typeof j.twitter === "string" && !i.twitter) i.twitter = j.twitter;
            if (typeof j.telegram === "string" && !i.telegram) i.telegram = j.telegram;
            if (typeof j.website === "string" && !i.website) i.website = j.website;
            if (typeof j.marketCap === "number") i.dexMcapUsd = j.marketCap;
            if (typeof j.volumeH24 === "number") i.dexVolumeUsd = j.volumeH24;
            if (typeof j.liquidityUsd === "number") i.dexLiquidityUsd = j.liquidityUsd;
            if (typeof j.txH24 === "number" && j.txH24 > 0) i.txCount = j.txH24;
            dirty.current = true;
          } catch {
            // sıradaki token
          }
          await new Promise((resolve) => setTimeout(resolve, 350));
        }
      } finally {
        dexBusy = false;
      }
    }, 15000);

    return () => {
      closed = true;
      if (reconnect) clearTimeout(reconnect);
      clearInterval(subTimer);
      clearInterval(metaTimer);
      clearInterval(dexTimer);
      ws?.close();
    };
  }, [opts.enabled]);

  return { tokens, solUsd, status };
}
