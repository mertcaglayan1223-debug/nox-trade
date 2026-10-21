import { ReactNode } from "react";

export const inputClass =
  "w-full rounded-sm border border-[#1A1F26] bg-[#090A0C] px-2.5 py-1 text-[11px] font-mono text-slate-200 placeholder:text-slate-600 focus:border-[#00FFA3] focus:outline-none transition shadow-none";

export const buttonClass =
  "h-7 w-full rounded-sm border border-[#00FFA3] bg-[#00FFA3]/15 font-mono font-bold text-[#00FFA3] hover:bg-[#00FFA3] hover:text-black text-[11px] uppercase tracking-wider transition active:scale-[0.99] focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 shadow-none";

export const ghostButtonClass =
  "h-7 rounded-sm border border-[#1A1F26] bg-[#090A0C] px-2.5 font-mono text-[11px] font-semibold text-slate-400 transition hover:border-[#00FFA3] hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-left space-y-1">
      <div className="flex items-center justify-between">
        <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
          {label}
        </span>
        {hint && <span className="block text-[9px] font-mono text-slate-600">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

export function shorten(value: string) {
  if (!value) return "";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function ago(time: number, now: number) {
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function toRaw(value: string, decimals: number): bigint | null {
  const v = value.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(v)) return null;
  const [whole, fraction = ""] = v.split(".");
  if (fraction.length > decimals) return null;
  const padded = fraction.padEnd(decimals, "0");
  return BigInt(whole + padded);
}

export function formatUnits(raw: bigint, decimals: number): string {
  const base = BigInt(10) ** BigInt(decimals);
  const whole = raw / base;
  const remainder = raw % base;
  if (remainder === 0n) return whole.toString();
  const remainderStr = remainder.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${remainderStr}`;
}
