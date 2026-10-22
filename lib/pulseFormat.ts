import type { PulseToken } from "@/lib/pulseEngine";

export function fmtUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "$0";
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function proxyImage(url?: string): string | undefined {
  return url ? `/api/token-img?u=${encodeURIComponent(url)}` : undefined;
}

// Kart bileşenine verilecek hazır (biçimlendirilmiş) token nesnesi
export function toCardToken(
  t: PulseToken,
  age: string,
  quickAmount: number,
  solUsd: number
) {
  const usd = solUsd > 0;
  return {
    ...t,
    age,
    image: proxyImage(t.image),
    mcapLabel: usd ? fmtUsd(t.marketCapUsd) : `${t.marketCapSol.toFixed(1)} SOL`,
    volumeLabel: usd ? fmtUsd(t.volumeUsd) : `${t.volumeSol.toFixed(1)} SOL`,
    liquidityLabel: usd ? fmtUsd(t.liquidityUsd) : `${t.solInCurve.toFixed(1)} SOL`,
    bondingProgress: t.curveProgress,
    quickBuyAmount: quickAmount,
  };
}
