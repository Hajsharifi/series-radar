import type { Show } from "../types";

export function posterUrl(show: Show, large = false): string | null {
  const value = large ? show.posterOriginal ?? show.posterPath : show.posterPath ?? show.posterOriginal;
  if (!value) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `https://image.tmdb.org/t/p/${large ? "w780" : "w500"}${value}`;
}

/** Simple deterministic fallback so a missing poster never shows a broken image. */
const GRADIENTS = [
  "linear-gradient(135deg,#1e293b 0%,#334155 55%,#475569 100%)",
  "linear-gradient(135deg,#3b0764 0%,#6b21a8 55%,#a855f7 100%)",
  "linear-gradient(135deg,#7c2d12 0%,#b45309 55%,#f59e0b 100%)",
  "linear-gradient(135deg,#064e3b 0%,#0f766e 55%,#14b8a6 100%)",
  "linear-gradient(135deg,#0c1a3a 0%,#1d4ed8 55%,#38bdf8 100%)",
];

export function posterGradient(show: Show): string {
  return GRADIENTS[Math.abs(show.id) % GRADIENTS.length];
}

export function posterFallbackLabel(show: Show): string {
  return show.title.slice(0, 2).toUpperCase();
}