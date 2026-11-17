const KEY = "sr:settings:v1";

export interface AppSettings {
  /** Lead time used for new favorites and for movie releases. */
  defaultLeadHours: number;
}

const DEFAULT: AppSettings = { defaultLeadHours: 24 };

export const LEAD_OPTIONS = [
  { hours: 1, label: "۱ ساعت" },
  { hours: 6, label: "۶ ساعت" },
  { hours: 12, label: "۱۲ ساعت" },
  { hours: 24, label: "۱ روز" },
  { hours: 48, label: "۲ روز" },
  { hours: 168, label: "۱ هفته" },
] as const;

export function getSettings(): AppSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "{}");
    const hours = Number(parsed?.defaultLeadHours);
    if (LEAD_OPTIONS.some((option) => option.hours === hours)) return { defaultLeadHours: hours };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT };
}

export function setDefaultLeadHours(hours: number): AppSettings {
  const next: AppSettings = { defaultLeadHours: hours };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("sr-settings-changed"));
  return next;
}
