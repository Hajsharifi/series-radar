export interface NativeReminder {
  id: number;
  title: string;
  /** Epoch milliseconds (already converted from 09:00 Tehran). */
  triggerAt: number;
  body: string;
  /** Series and movies may share numeric ids, so the kind keeps alarms apart. */
  kind?: "show" | "movie" | "movie_track";
  /** In-app hash route opened when the notification is tapped. */
  route?: string;
}

interface AndroidReminderBridge {
  sync(payload: string): void;
  requestNotificationPermission?(): void;
  openExactAlarmSettings?(): void;
  updateWidgetData?(json: string): void;
  openExternal?(url: string): void;
  downloadAndInstall?(url: string, version: string): void;
  setSystemBarsColor?(color: string): void;
}

declare global {
  interface Window {
    AndroidReminders?: AndroidReminderBridge;
  }
}

export function isNativeApp(): boolean {
  return typeof window !== "undefined" && Boolean(window.AndroidReminders);
}

/** Hands the upcoming favorited premieres to the Android AlarmManager. */
export function syncNativeReminders(items: NativeReminder[]): void {
  if (!isNativeApp()) return;
  try {
    window.AndroidReminders?.sync(JSON.stringify(items));
  } catch {
    /* bridge must never break the UI */
  }
}

export function requestNotificationPermission(): void {
  if (!isNativeApp()) return;
  try {
    window.AndroidReminders?.requestNotificationPermission?.();
  } catch {
    /* ignore */
  }
}

/** Opens Android's "alarms & reminders" screen so 09:00 stays exact. */
export function openExactAlarmSettings(): void {
  if (!isNativeApp()) return;
  try {
    window.AndroidReminders?.openExactAlarmSettings?.();
  } catch {
    /* ignore */
  }
}

/** Opens a URL in the user's browser / YouTube app instead of a WebView iframe. */
export function openExternalUrl(url: string): void {
  if (!url) return;
  if (isNativeApp()) {
    try {
      if (window.AndroidReminders?.openExternal) {
        window.AndroidReminders.openExternal(url);
        return;
      }
    } catch {
      /* fall through to browser */
    }
  }
  window.open(url, "_blank", "noopener");
}

/** Downloads the GitHub release APK and hands it to the package installer. */
export function downloadAndInstallApk(url: string, version: string): void {
  if (!isNativeApp()) {
    window.open(url, "_blank", "noopener");
    return;
  }
  try {
    window.AndroidReminders?.downloadAndInstall?.(url, version);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

/** Keeps the Android status/navigation bars in sync with the AMOLED theme. */
export function setSystemBarsColor(color: string): void {
  try {
    window.AndroidReminders?.setSystemBarsColor?.(color);
  } catch {
    /* ignore */
  }
}

/** Sends widget data (next 3 upcoming items) to Android widget. */
export function updateWidgetData(items: Array<{
  id: number;
  title: string;
  subtitle: string;
  type: "series" | "movie";
  posterUrl?: string;
}>): void {
  if (!isNativeApp()) return;
  try {
    window.AndroidReminders?.updateWidgetData?.(JSON.stringify(items));
  } catch {
    /* ignore */
  }
}
