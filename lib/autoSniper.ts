// Axiom & J7Tracker High-Speed Auto-Sniper Engine
// Automatically buys Solana tokens on Pump.fun when VIPs tweet or CAs are detected

export type AutoSniperConfig = {
  enabled: boolean;
  maxSolAmount: number;
  slippage: number;
  priorityFeeSol: number;
  bribeTipSol: number; // Jito / Fast Block tip
  onlyVipAccounts: boolean;
  minFollowers: number;
  targetMcapLimit: number; // Do not snipe if MC exceeds (in SOL)
  autoSellTakeProfitPercent: number; // e.g. 100 for 2x
  autoSellStopLossPercent: number; // e.g. 50
};

export type AutoSnipeLog = {
  id: string;
  timestamp: number;
  ca: string;
  tweetAuthor: string;
  amountSol: number;
  signature?: string;
  status: "success" | "failed" | "skipped";
  reason?: string;
};

const CONFIG_KEY = "axiom_auto_sniper_config";
const LOGS_KEY = "axiom_auto_sniper_logs";

export const DEFAULT_AUTO_SNIPER_CONFIG: AutoSniperConfig = {
  enabled: false,
  maxSolAmount: 0.1,
  slippage: 15,
  priorityFeeSol: 0.005,
  bribeTipSol: 0.002,
  onlyVipAccounts: true,
  minFollowers: 50000,
  targetMcapLimit: 300,
  autoSellTakeProfitPercent: 100,
  autoSellStopLossPercent: 40,
};

export function loadAutoSniperConfig(): AutoSniperConfig {
  if (typeof window === "undefined") return DEFAULT_AUTO_SNIPER_CONFIG;
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_AUTO_SNIPER_CONFIG;
    return { ...DEFAULT_AUTO_SNIPER_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_AUTO_SNIPER_CONFIG;
  }
}

export function saveAutoSniperConfig(cfg: AutoSniperConfig) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  } catch {}
}

export function loadAutoSnipeLogs(): AutoSnipeLog[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addAutoSnipeLog(log: Omit<AutoSnipeLog, "id" | "timestamp">) {
  if (typeof window === "undefined") return;
  try {
    const prev = loadAutoSnipeLogs();
    const entry: AutoSnipeLog = {
      ...log,
      id: `snipe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    };
    const updated = [entry, ...prev].slice(0, 50);
    localStorage.setItem(LOGS_KEY, JSON.stringify(updated));
  } catch {}
}
