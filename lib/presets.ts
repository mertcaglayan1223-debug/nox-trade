// Kayıtlı launch ve trading ön ayarları (bu tarayıcıda saklanır)
export type Preset = {
  id: string;
  name: string;
  supply: string;
  decimals: string;
  burnPercent: string;
  revokeMint: boolean;
  revokeFreeze: boolean;
  immutable: boolean;
  website: string;
  telegram: string;
};

const KEY = "launch-presets";

export function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p.id === "string" && typeof p.name === "string")
      .map((p) => ({
        id: p.id as string,
        name: p.name as string,
        supply: typeof p.supply === "string" ? p.supply : "1000000000",
        decimals: p.decimals === "9" ? "9" : "6",
        burnPercent: typeof p.burnPercent === "string" ? p.burnPercent : "0",
        revokeMint: p.revokeMint !== false,
        revokeFreeze: p.revokeFreeze !== false,
        immutable: p.immutable === true,
        website: typeof p.website === "string" ? p.website : "",
        telegram: typeof p.telegram === "string" ? p.telegram : "",
      }))
      .slice(0, 10);
  } catch {
    return [];
  }
}

export function savePresets(list: Preset[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 10)));
  } catch {}
}

// ── AXIOM TRADING PRESETS (P1, P2, P3) ──
export type TradingPreset = {
  id: "P1" | "P2" | "P3";
  name: string;
  buyAmountSol: number;
  slippagePercent: number;
  priorityFeeSol: number;
  bribeTipSol: number;
  mevMode: "off" | "secure";
  autoConfirm: boolean;
};

export const DEFAULT_TRADING_PRESETS: TradingPreset[] = [
  {
    id: "P1",
    name: "Safe Standard",
    buyAmountSol: 0.1,
    slippagePercent: 15,
    priorityFeeSol: 0.001,
    bribeTipSol: 0.001,
    mevMode: "secure",
    autoConfirm: false,
  },
  {
    id: "P2",
    name: "Fast Momentum",
    buyAmountSol: 0.5,
    slippagePercent: 25,
    priorityFeeSol: 0.005,
    bribeTipSol: 0.002,
    mevMode: "secure",
    autoConfirm: true,
  },
  {
    id: "P3",
    name: "Turbo Snipe",
    buyAmountSol: 1.0,
    slippagePercent: 35,
    priorityFeeSol: 0.015,
    bribeTipSol: 0.005,
    mevMode: "secure",
    autoConfirm: true,
  },
];

const TRADING_KEY = "axiom-trading-presets";

export function loadTradingPresets(): TradingPreset[] {
  if (typeof window === "undefined") return DEFAULT_TRADING_PRESETS;
  try {
    const raw = localStorage.getItem(TRADING_KEY);
    if (!raw) return DEFAULT_TRADING_PRESETS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length >= 3) return parsed;
    return DEFAULT_TRADING_PRESETS;
  } catch {
    return DEFAULT_TRADING_PRESETS;
  }
}

export function saveTradingPresets(presets: TradingPreset[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TRADING_KEY, JSON.stringify(presets));
  } catch {}
}

// ── AXIOM PULSE 14-METRICS FILTER CONFIG ──
export type PulseFilterConfig = {
  minAgeSec: number;
  maxAgeSec: number;
  minMcapUsd: number;
  maxMcapUsd: number;
  minLiquiditySol: number;
  maxLiquiditySol: number;
  maxDevHoldingPercent: number; // 0: dev out only, 100: all
  maxTop10Percent: number; // e.g. 30
  maxBundlePercent: number; // e.g. 15
  minVolumeSol: number;
  minTxCount: number;
  requireSocials: boolean;
};

export const DEFAULT_PULSE_FILTERS: PulseFilterConfig = {
  minAgeSec: 0,
  maxAgeSec: 86400,
  minMcapUsd: 0,
  maxMcapUsd: 1000000,
  minLiquiditySol: 0,
  maxLiquiditySol: 500,
  maxDevHoldingPercent: 100,
  maxTop10Percent: 100,
  maxBundlePercent: 100,
  minVolumeSol: 0,
  minTxCount: 0,
  requireSocials: false,
};
