export type ActivityType = "launch" | "burn" | "send" | "revoke" | "buy" | "sell";

export type Activity = {
  id: string;
  type: ActivityType;
  mint: string;
  signature: string;
  label: string;
  time: number;
};

const KEY = "activity-log";
const MAX = 100;
export const ACTIVITY_EVENT = "activity-changed";

export function loadActivity(): Activity[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (a) =>
          a && typeof a.mint === "string" && typeof a.signature === "string"
      )
      .slice(0, MAX) as Activity[];
  } catch {
    return [];
  }
}

export function addActivity(entry: Omit<Activity, "id" | "time">) {
  try {
    const list = loadActivity();
    list.unshift({
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      time: Date.now(),
    });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    window.dispatchEvent(new Event(ACTIVITY_EVENT));
  } catch {
    // kaydedilemezse sessizce geç
  }
}

export function clearActivity() {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(ACTIVITY_EVENT));
  } catch {
    // sessizce geç
  }
}
