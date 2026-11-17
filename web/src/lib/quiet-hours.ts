import { tehranParts, tehranWallToEpoch } from "./date";
import { getSettings, type AppSettings } from "./settings";

function parseClock(value: string): { hh: number; mm: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return { hh: Number(match[1]), mm: Number(match[2]) };
}

/**
 * Move a notification out of the user's quiet window. Returns -1 when moving
 * it would land after the event itself, so the app never sends a pointless
 * "starts soon" reminder after the broadcast.
 */
export function applyQuietHours(
  triggerAt: number,
  eventAt?: number | null,
  settings: AppSettings = getSettings(),
): number {
  if (!settings.quietHoursEnabled) return triggerAt;
  const start = parseClock(settings.quietStart);
  const end = parseClock(settings.quietEnd);
  if (!start || !end) return triggerAt;
  const startMinutes = start.hh * 60 + start.mm;
  const endMinutes = end.hh * 60 + end.mm;
  if (startMinutes === endMinutes) return triggerAt;

  const parts = tehranParts(new Date(triggerAt).toISOString());
  if (!parts) return triggerAt;
  const minutes = parts.hh * 60 + parts.mm;
  const crossesMidnight = startMinutes > endMinutes;
  const quiet = crossesMidnight
    ? minutes >= startMinutes || minutes < endMinutes
    : minutes >= startMinutes && minutes < endMinutes;
  if (!quiet) return triggerAt;

  // Cross-midnight windows that started yesterday end today; otherwise the
  // end is the same day (or tomorrow when the trigger is before midnight).
  const dayOffset = crossesMidnight && minutes >= startMinutes ? 1 : 0;
  const day = new Date(Date.UTC(parts.y, parts.m - 1, parts.d + dayOffset));
  const target = tehranWallToEpoch(
    day.getUTCFullYear(),
    day.getUTCMonth() + 1,
    day.getUTCDate(),
    end.hh,
    end.mm,
  );

  if (eventAt && target >= eventAt) return -1;
  return target;
}
