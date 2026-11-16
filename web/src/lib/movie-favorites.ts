import type { MovieFavorite } from "../types";

const STORAGE_KEY = "sr:movie-favorites:v1";
const EVENT = "sr-movie-favorites-changed";

export function getMovieFavorites(): MovieFavorite[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MovieFavorite[];
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item.movieId === "number")
      : [];
  } catch {
    return [];
  }
}

function write(items: MovieFavorite[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function isMovieFavorite(movieId: number): boolean {
  return getMovieFavorites().some((item) => item.movieId === movieId);
}

export function addMovieFavorite(movieId: number): void {
  const items = getMovieFavorites();
  if (items.some((item) => item.movieId === movieId)) return;
  items.push({ movieId, reminderEnabled: true, addedAt: new Date().toISOString() });
  write(items);
}

export function removeMovieFavorite(movieId: number): void {
  write(getMovieFavorites().filter((item) => item.movieId !== movieId));
}

export function toggleMovieFavorite(movieId: number, enabled: boolean): void {
  if (enabled) addMovieFavorite(movieId);
  else removeMovieFavorite(movieId);
}

export function setMovieReminderEnabled(movieId: number, enabled: boolean): void {
  write(
    getMovieFavorites().map((item) =>
      item.movieId === movieId ? { ...item, reminderEnabled: enabled } : item,
    ),
  );
}

export function subscribeMovieFavorites(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
