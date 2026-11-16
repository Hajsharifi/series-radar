import { toPersianDigits } from "./date";

/** Compact USD label for cards and tables: "۲.۵۲ میلیارد دلار". */
export function usdShort(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "نامشخص";
  if (value >= 1_000_000_000) return `${toPersianDigits((value / 1_000_000_000).toFixed(2))} میلیارد دلار`;
  if (value >= 1_000_000) return `${toPersianDigits((value / 1_000_000).toFixed(1))} میلیون دلار`;
  if (value >= 1_000) return `${toPersianDigits(Math.round(value / 1_000))} هزار دلار`;
  return `${toPersianDigits(value)} دلار`;
}

/** Full USD amount with thousands separators: "$۱۹۰٬۰۰۰٬۰۰۰". */
export function usdFull(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "نامشخص";
  return `$${toPersianDigits(value.toLocaleString("en-US"))}`;
}

export function faNumber(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return toPersianDigits(value.toLocaleString("en-US"));
}
