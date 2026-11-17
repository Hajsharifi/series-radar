const KEY = "sr:settings:v1";

export interface AppSettings {
  /** Lead time used for new favorites and for movie releases. */
  defaultLeadHours: number;
  /** Suppress notifications during this local (Tehran) window. */
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
}

const DEFAULT: AppSettings = {
  defaultLeadHours: 24,
  quietHoursEnabled: false,
  quietStart: "23:00",
  quietEnd: "07:00",
};

export const LEAD_OPTIONS = [
  { hours: 1, label: "۱ ساعت" },
  { hours: 6, label: "۶ ساعت" },
  { hours: 12, label: "۱۲ ساعت" },
  { hours: 24, label: "۱ روز" },
  { hours: 48, label: "۲ روز" },
  { hours: 168, label: "۱ هفته" },
] as const;

function validTime(value: unknown, fallback: string): string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
}

export function getSettings(): AppSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "{}");
    const hours = Number(parsed?.defaultLeadHours);
    return {
      defaultLeadHours: LEAD_OPTIONS.some((option) => option.hours === hours)
        ? hours
        : DEFAULT.defaultLeadHours,
      quietHoursEnabled: parsed?.quietHoursEnabled === true,
      quietStart: validTime(parsed?.quietStart, DEFAULT.quietStart),
      quietEnd: validTime(parsed?.quietEnd, DEFAULT.quietEnd),
    };
  } catch {
    return { ...DEFAULT };
  }
}

function save(next: AppSettings): AppSettings {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("sr-settings-changed"));
  return next;
}

export function setDefaultLeadHours(hours: number): AppSettings {
  const current = getSettings();
  return save({ ...current, defaultLeadHours: hours });
}

export function setQuietHours(enabled: boolean, start: string, end: string): AppSettings {
  const current = getSettings();
  return save({
    ...current,
    quietHoursEnabled: enabled,
    quietStart: validTime(start, current.quietStart),
    quietEnd: validTime(end, current.quietEnd),
  });
}
