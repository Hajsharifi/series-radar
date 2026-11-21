import type { MovieFavorite } from "../types";

const STORAGE_KEY = "sr:movie-favorites:v1";
const EVENT = "sr-movie-favorites-changed";

function normalize(item: Partial<MovieFavorite> & { movieId: number }): MovieFavorite {
  return {
    movieId: item.movieId,
    reminderEnabled: item.reminderEnabled !== false,
    addedAt: item.addedAt ?? new Date().toISOString(),
  };
}

/** One card per movie: keep a single row per TMDB id, earliest settings win. */
function collapseDuplicateRows(items: MovieFavorite[]): MovieFavorite[] {
  const seen = new Map<number, number>();
  const unique: MovieFavorite[] = [];
  for (const item of items) {
    const index = seen.get(item.movieId);
    if (index === undefined) {
      seen.set(item.movieId, unique.length);
      unique.push(item);
    } else if (item.addedAt < unique[index].addedAt) {
      unique[index] = item;
    }
  }
  return unique;
}

function persist(items: MovieFavorite[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

export function getMovieFavorites(): MovieFavorite[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Partial<MovieFavorite>>;
    if (!Array.isArray(parsed)) return [];
    const items = parsed
      .filter((item) => item && typeof item.movieId === "number")
      .map((item) => normalize(item as Partial<MovieFavorite> & { movieId: number }));
    const unique = collapseDuplicateRows(items);
    if (unique.length !== items.length) persist(unique);
    return unique;
  } catch {
    return [];
  }
}

function write(items: MovieFavorite[]) {
  persist(collapseDuplicateRows(items));
  window.dispatchEvent(new Event(EVENT));
}

/** Replace the whole list (used by backup restore), collapsing duplicates. */
export function replaceMovieFavorites(
  items: Array<Partial<MovieFavorite> & { movieId: number }>,
): void {
  write(
    items
      .filter((item) => item && typeof item.movieId === "number")
      .map((item) => normalize(item)),
  );
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
