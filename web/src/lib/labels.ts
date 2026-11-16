import type { ShowCategory } from "../types";

export const CATEGORY_LABEL: Record<ShowCategory, string> = {
  new: "فصل اول",
  returning: "فصل جدید",
  announced: "اعلام‌شده",
};

export const CATEGORY_CHIP: Record<ShowCategory, string> = {
  new: "bg-amber-400/15 text-amber-300 ring-amber-400/30",
  returning: "bg-sky-400/15 text-sky-300 ring-sky-400/30",
  announced: "bg-violet-400/15 text-violet-300 ring-violet-400/30",
};

const STATUS_MAP: Array<[RegExp, string]> = [
  [/^returning series$/i, "در حال پخش"],
  [/^running$/i, "در حال پخش"],
  [/^ended$/i, "پایان‌یافته"],
  [/^canceled$/i, "لغو‌شده"],
  [/^cancelled$/i, "لغو‌شده"],
  [/^to be determined$/i, "تاریخ نامشخص"],
  [/^in development$/i, "در حال ساخت"],
  [/^in production$/i, "در حال ساخت"],
  [/^new series$/i, "سریال جدید"],
  [/^planned$/i, "برنامه‌ریزی‌شده"],
];

export function statusLabel(status?: string | null): string {
  if (!status) return "نامشخص";
  const match = STATUS_MAP.find(([pattern]) => pattern.test(status));
  if (match) return match[1];
  return status;
}

export const GENRE_LABEL: Record<string, string> = {
  Drama: "درام",
  Comedy: "کمدی",
  Crime: "جنایی",
  Thriller: "دلهره‌آور",
  Mystery: "معما",
  "Science-Fiction": "علمی‌تخیلی",
  "Sci-Fi": "علمی‌تخیلی",
  Fantasy: "فانتزی",
  Action: "اکشن",
  Adventure: "ماجراجویی",
  Horror: "ترسناک",
  Romance: "عاشقانه",
  Family: "خانوادگی",
  Animation: "انیمیشن",
  Documentary: "مستند",
  Reality: "واقع‌نما",
  Music: "موسیقی",
  War: "جنگی",
  History: "تاریخی",
  Western: "وسترن",
  "Game Show": "مسابقه",
  Supernatural: "ماوراطبیعی",
  "Medical": "پزشکی",
};

export function genreLabel(genre: string): string {
  return GENRE_LABEL[genre] ?? genre;
}