"use client";

import { useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Field, buttonClass, ghostButtonClass, inputClass, shorten } from "@/components/ui";

export default function RaydiumLiquidity() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const [mint, setMint] = useState("");
  const [tokenAmount, setTokenAmount] = useState("1000000000");
  const [solAmount, setSolAmount] = useState("5");
  const [solPriceUsd, setSolPriceUsd] = useState("180");
  const [poolType, setPoolType] = useState<"cpmm" | "amm">("cpmm");

  const isDevnet = connection.rpcEndpoint.includes("devnet");

  // Hesaplamalar
  const calc = useMemo(() => {
    const t = Number(tokenAmount) || 0;
    const s = Number(solAmount) || 0;
    const sp = Number(solPriceUsd) || 180;

    if (t <= 0 || s <= 0) {
      return { priceSol: 0, priceUsd: 0, mcapUsd: 0 };
    }

    const priceSol = s / t;
    const priceUsd = priceSol * sp;
    const mcapUsd = priceUsd * t;

    return { priceSol, priceUsd, mcapUsd };
  }, [tokenAmount, solAmount, solPriceUsd]);

  const raydiumUrl = useMemo(() => {
    const base = isDevnet
      ? "https://devnet.raydium.io/liquidity/create/"
      : "https://raydium.io/liquidity/create/";
    return mint ? `${base}?token0=${mint}&token1=sol` : base;
  }, [mint, isDevnet]);

  return (
    <div className="w-full space-y-5 rounded border border-[#181c28] bg-[#0c0e14] p-5 text-left font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#181c28] pb-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-indigo-400 animate-ping" />
          <h2 className="text-sm font-bold text-white tracking-tight uppercase">RAYDIUM CPMM / AMM LIQUIDITY POOL</h2>
        </div>
        <span className="text-[10px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/25 px-2 py-0.5 rounded font-bold">
          SOLANA DEX INTEGRATION
        </span>
      </div>

      {/* Havuz Türü Seçimi */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setPoolType("cpmm")}
          className={`rounded-lg border p-4 text-left transition ${
            poolType === "cpmm"
              ? "border-signal bg-signal/10"
              : "border-line bg-ink/40 hover:border-dim"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-mist">Raydium CPMM (Önerilen)</span>
            <span className="text-xs text-signal font-semibold">Düşük Ücret</span>
          </div>
          <p className="text-xs text-dim mt-2">
            OpenBook Market ID gerektirmez. Havuz açma maliyeti sadece ~0.05 SOL&apos;dur.
            Standart memecoin lansmanları için en ideal çözümdür.
          </p>
        </button>

        <button
          type="button"
          onClick={() => setPoolType("amm")}
          className={`rounded-lg border p-4 text-left transition ${
            poolType === "amm"
              ? "border-signal bg-signal/10"
              : "border-line bg-ink/40 hover:border-dim"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-mist">Raydium AMM V4 (Klasik)</span>
            <span className="text-xs text-dim font-semibold">Orderbook</span>
          </div>
          <p className="text-xs text-dim mt-2">
            OpenBook Market gerektirir (yaklaşık 0.4 - 2.8 SOL market oluşturma maliyeti vardır).
            Geleneksel emir defteri entegrasyonu sunar.
          </p>
        </button>
      </div>

      {/* Havuz Parametreleri Formu */}
      <div className="space-y-4 rounded-lg border border-line bg-ink/50 p-5">
        <h3 className="text-base font-semibold text-mist">1. Token & Havuz Parametreleri</h3>

        <Field label="Token Mint Adresi" hint="Likidite ekleyeceğiniz token'ın adresi">
          <input
            type="text"
            placeholder="Örn: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
            className={inputClass}
            value={mint}
            onChange={(e) => setMint(e.target.value.trim())}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Havuza Konacak Token" hint="Örn: 800.000.000">
            <input
              type="text"
              className={inputClass}
              value={tokenAmount}
              onChange={(e) => setTokenAmount(e.target.value)}
            />
          </Field>
          <Field label="Havuza Konacak SOL" hint="Örn: 5 SOL">
            <input
              type="number"
              step="0.1"
              min="0.1"
              className={inputClass}
              value={solAmount}
              onChange={(e) => setSolAmount(e.target.value)}
            />
          </Field>
          <Field label="SOL / USD Fiyatı (Tahmini)" hint="Piyasa değeri hesabı için">
            <input
              type="number"
              className={inputClass}
              value={solPriceUsd}
              onChange={(e) => setSolPriceUsd(e.target.value)}
            />
          </Field>
        </div>

        {/* Fiyat & Piyasa Değeri Özeti */}
        <div className="rounded-lg border border-line bg-ink p-4 space-y-2 text-sm">
          <p className="font-semibold text-xs text-dim uppercase tracking-wider">
            Lansman Fiyatı & Başlangıç Değerleme
          </p>
          <div className="grid grid-cols-2 gap-4 pt-1 sm:grid-cols-3">
            <div>
              <p className="text-xs text-dim">Token Fiyatı (SOL):</p>
              <p className="font-mono text-signal text-sm font-semibold">
                {calc.priceSol.toFixed(9)} SOL
              </p>
            </div>
            <div>
              <p className="text-xs text-dim">Token Fiyatı (USD):</p>
              <p className="font-mono text-mist text-sm font-semibold">
                ${calc.priceUsd < 0.000001 ? calc.priceUsd.toExponential(4) : calc.priceUsd.toFixed(6)}
              </p>
            </div>
            <div>
              <p className="text-xs text-dim">Başlangıç Market Cap:</p>
              <p className="font-mono text-mist text-sm font-semibold">
                ${Math.round(calc.mcapUsd).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Aksiyon & Yönlendirme */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-mist">2. Havuzu Raydium&apos;da Başlatın</h3>
        <p className="text-xs text-dim">
          Raydium üzerinde likidite ekleme işlemi havuz sözleşmesini imzalama ve LP tokenları teslim alma 
          adımlarını içerir. Aşağıdaki butona tıklayarak seçtiğiniz token parametreleriyle doğrudan Raydium 
          arayüzüne gidebilirsiniz:
        </p>

        <div className="flex flex-wrap gap-3">
          <a
            href={raydiumUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-sky-500 px-5 py-3 font-semibold text-ink text-sm hover:bg-sky-400 transition"
          >
            Raydium&apos;da Havuz Oluştur ↗ ({isDevnet ? "Devnet" : "Mainnet"})
          </a>
          <a
            href="https://rugcheck.xyz"
            target="_blank"
            rel="noreferrer"
            className={ghostButtonClass}
          >
            RugCheck Güvenlik Analizi ↗
          </a>
        </div>
      </div>

      {/* LP Token Yakma & Güvenlik Rehberi */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-2 text-xs text-mist">
        <p className="font-bold text-amber-400">🛡️ Güvenilirlik & RugPull Koruması (Önemli):</p>
        <ul className="list-disc list-inside space-y-1 text-dim">
          <li>
            Havuzu açtıktan sonra cüzdanınıza <strong>LP (Likidite Sağlayıcı) token&apos;ları</strong> gelecektir.
          </li>
          <li>
            Yatırımcıların güvenini kazanmak için bu LP token&apos;ları <strong>Solana Token Manager</strong> sekmesinden 
            tamamen yakabilir (%100 Burn) veya bir kilit sözleşmesine bağlayabilirsiniz.
          </li>
          <li>
            LP yakıldığında DexScreener ve DexTools üzerinde <strong>&quot;Liquidity Burned / Locked&quot;</strong> rozeti 
            çıkar ve güven skoru maksimuma yükselir.
          </li>
        </ul>
      </div>
    </div>
  );
}
