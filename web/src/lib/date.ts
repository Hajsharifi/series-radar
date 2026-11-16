/** Jalali (Solar Hijri) conversion + Persian formatting, no Intl dependency. */

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
const PERSIAN_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

export function toPersianDigits(value: string | number): string {
  return String(value).replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

export function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** Gregorian Y-M-D -> Jalali Y-M-D (algorithm by jalaali-js, MIT) */
function toJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy: number;
  if (gy > 1600) {
    jy = 979;
    gy -= 1600;
  } else {
    jy = 0;
    gy -= 621;
  }
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) -
    80 +
    gd +
    g_d_m[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

export interface JalaliParts {
  jy: number;
  jm: number;
  jd: number;
  gy: number;
  gm: number;
  gd: number;
}

export function jalaliParts(date: Date): JalaliParts {
  const [jy, jm, jd] = toJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
  return { jy, jm, jd, gy: date.getFullYear(), gm: date.getMonth() + 1, gd: date.getDate() };
}

/** "۲۷ آبان ۱۴۰۵" — day, month and year are rendered as separate boxes so the
 * browser never re-orders them (a plain bidi run renders as "۱۴۰۵ آبان ۲۷"). */
export function jalaliDateParts(date: Date): { day: string; month: string; year: string } {
  const { jy, jm, jd } = jalaliParts(date);
  return {
    day: toPersianDigits(jd),
    month: PERSIAN_MONTHS[jm - 1],
    year: toPersianDigits(jy),
  };
}

export function jalaliDate(date: Date): string {
  const p = jalaliDateParts(date);
  return `${p.day} ${p.month} ${p.year}`;
}

export function gregorianDate(date: Date): string {
  return `${date.getDate()} ${
    ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][
      date.getMonth()
    ]
  } ${date.getFullYear()}`;
}

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function gregorianShort(date: Date): string {
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

/** A Date object that carries the Tehran calendar day (safe for Jalali/Gregorian formatting). */
export function tehranDateFromStamp(stamp?: string | null): Date | null {
  const parts = tehranParts(stamp);
  if (!parts) return null;
  return new Date(parts.y, parts.m - 1, parts.d, 12, 0, 0, 0);
}

export function jalaliFromStamp(stamp?: string | null): string {
  const date = tehranDateFromStamp(stamp);
  return date ? jalaliDate(date) : "نامشخص";
}

export function gregorianFromStamp(stamp?: string | null): string {
  const date = tehranDateFromStamp(stamp);
  return date ? gregorianDate(date) : "";
}

const TZ = "Asia/Tehran";

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** Parses an ISO instant (or null) and formats it in Tehran time. */
export function tehranParts(stamp?: string | null): {
  date: Date;
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
  weekday: number;
} | null {
  if (!stamp) return null;
  const instant = new Date(stamp);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    date: instant,
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    hh: Number(get("hour")) % 24,
    mm: Number(get("minute")),
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

export function tehranClock(stamp?: string | null): string {
  const parts = tehranParts(stamp);
  if (!parts) return "ساعت نامشخص";
  return `${toPersianDigits(pad(parts.hh))}:${toPersianDigits(pad(parts.mm))}`;
}

const WEEKDAYS_FA = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];

export function weekdayName(stamp?: string | null): string {
  const parts = tehranParts(stamp);
  if (!parts) return "";
  return WEEKDAYS_FA[parts.weekday];
}

/** Current moment expressed in Tehran wall-clock fields. */
export function tehranNow(): { y: number; m: number; d: number; hh: number; mm: number; stamp: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { y: get("year"), m: get("month"), d: get("day"), hh: get("hour") % 24, mm: get("minute"), stamp: now.getTime() };
}

/** Whole days from today (Tehran) until the given instant (Tehran). */
export function daysUntilTehran(stamp?: string | null): number | null {
  if (!stamp) return null;
  const target = tehranParts(stamp);
  const now = tehranNow();
  if (!target) return null;
  const targetMidnight = Date.UTC(target.y, target.m - 1, target.d);
  const nowMidnight = Date.UTC(now.y, now.m - 1, now.d);
  return Math.round((targetMidnight - nowMidnight) / 86_400_000);
}

/** Local Y-M-D of the Persian calendar date `days` from today (Tehran). */
export function dateAfterDays(days: number): { y: number; m: number; d: number } {
  const now = tehranNow();
  const shifted = new Date(Date.UTC(now.y, now.m - 1, now.d + days));
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() };
}

export function toIsoDay(date: { y: number; m: number; d: number }): string {
  return `${date.y}-${pad(date.m)}-${pad(date.d)}`;
}

/** Today / tomorrow / weekday / full Jalali label for an instant. */
export function dayLabel(stamp?: string | null): string {
  const days = daysUntilTehran(stamp);
  if (days === null) return "زمان پخش نامشخص";
  if (days === 0) return "امروز";
  if (days === 1) return "فردا";
  if (days === -1) return "دیروز";
  if (days < 0) return "پخش شده";
  if (days < 7) return WEEKDAYS_FA[tehranParts(stamp)!.weekday];
  return jalaliDate(tehranParts(stamp)!.date);
}

export function countdownLabel(stamp?: string | null): string {
  const days = daysUntilTehran(stamp);
  if (days === null) return "";
  if (days < 0) return "پخش شده";
  if (days === 0) return "امروز";
  if (days === 1) return "فردا";
  return `${toPersianDigits(days)} روز مانده`;
}

/** 09:00 Asia/Tehran as a real epoch (Iran is UTC+03:30, no DST since 2022). */
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;

function tehranWallToEpoch(y: number, m: number, d: number, hh: number, mm: number): number {
  return Date.UTC(y, m - 1, d, hh, mm, 0, 0) - TEHRAN_OFFSET_MS;
}

/** Epoch of the reminder: 09:00 Tehran on the day before the premiere. */
export function reminderTimeMs(stamp?: string | null): number | null {
  const parts = tehranParts(stamp);
  if (!parts) return null;
  const day = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
  day.setUTCDate(day.getUTCDate() - 1);
  return tehranWallToEpoch(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), 9, 0);
}

/** Reminder epoch for a plain YYYY-MM-DD release day (movies have no airtime). */
export function reminderTimeMsForDay(day?: string | null): number | null {
  if (!day) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!match) return reminderTimeMs(day);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() - 1);
  return tehranWallToEpoch(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), 9, 0);
}

/** "امروز" / "فردا" / "N روز مانده" for a plain YYYY-MM-DD release day. */
export function dayCountdownLabel(day?: string | null): string {
  if (!day) return "";
  const stamp = `${day}T12:00:00Z`;
  return countdownLabel(stamp);
}

/** Default reminder: 24h before, at 09:00 Tehran. */
export function reminderDate(stamp?: string | null): Date | null {
  const epoch = reminderTimeMs(stamp);
  if (epoch === null) return null;
  const parts = tehranParts(new Date(epoch).toISOString());
  if (!parts) return null;
  return new Date(parts.y, parts.m - 1, parts.d, 12, 0, 0, 0);
}

export function reminderLabel(stamp?: string | null): string {
  const date = reminderDate(stamp);
  if (!date) return "نامشخص";
  const day = jalaliDate(date);
  return `${day} ساعت ۰۹:۰۰`;
}

export function relativeSyncLabel(iso?: string | null): string {
  if (!iso) return "هنوز به‌روزرسانی نشده";
  const stamp = new Date(iso).getTime();
  if (Number.isNaN(stamp)) return "نامشخص";
  const seconds = Math.max(0, Math.round((Date.now() - stamp) / 1000));
  if (seconds < 60) return "همین حالا";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${toPersianDigits(minutes)} دقیقه پیش`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${toPersianDigits(hours)} ساعت پیش`;
  return jalaliDate(new Date(stamp));
}