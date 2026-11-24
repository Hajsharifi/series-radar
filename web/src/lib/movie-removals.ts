import type { MovieStage } from "./movies";

export interface MovieRemoval {
  movieId: number;
  title: string;
  reason: "available" | "expired";
  at: string;
  posterPath?: string | null;
}

const STORAGE_KEY = "sr:movie-removals:v1";
const DISMISS_KEY = "sr:movie-removals-dismissed:v1";
const EVENT = "sr-movie-removals-changed";
const KEEP_DAYS = 90;

function prune(items: MovieRemoval[]): MovieRemoval[] {
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  return items.filter((item) => {
    const time = new Date(item.at).getTime();
    return Number.isFinite(time) && time >= cutoff;
  });
}

export function getMovieRemovals(): MovieRemoval[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MovieRemoval[];
    if (!Array.isArray(parsed)) return [];
    const clean = prune(parsed.filter((item) => item && typeof item.movieId === "number"));
    if (clean.length !== parsed.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    return clean.sort((a, b) => b.at.localeCompare(a.at));
  } catch {
    return [];
  }
}

/** Records why a favorite left the list. Idempotent per movie. */
export function recordMovieRemoval(
  movieId: number,
  title: string,
  stage: MovieStage,
  posterPath?: string | null,
): void {
  const reason: MovieRemoval["reason"] = stage === "expired" ? "expired" : "available";
  const items = getMovieRemovals();
  if (items.some((item) => item.movieId === movieId)) return;
  items.unshift({ movieId, title, reason, at: new Date().toISOString(), posterPath: posterPath ?? null });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 100)));
  } catch {
    /* ignore storage failures */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Removals added after the banner was last dismissed. Hiding the banner never
 * deletes the history - only the explicit button in Settings/History does. */
export function getPendingMovieRemovals(): MovieRemoval[] {
  let dismissedAt = 0;
  try {
    dismissedAt = Number(localStorage.getItem(DISMISS_KEY)) || 0;
  } catch {
    /* ignore */
  }
  return getMovieRemovals().filter((item) => {
    const at = new Date(item.at).getTime();
    return Number.isFinite(at) && at > dismissedAt;
  });
}

/** Hides the current banner without touching the stored history. */
export function dismissMovieRemovals(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function clearMovieRemovals(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(DISMISS_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeMovieRemovals(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
