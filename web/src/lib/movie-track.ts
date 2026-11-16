export interface TrackedMovie {
  movieId: number;
  addedAt: string;
  reminderEnabled: boolean;
}

const STORAGE_KEY = "sr:movie-track:v1";
const EVENT = "sr-movie-track-changed";

export function getTrackedMovies(): TrackedMovie[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TrackedMovie[];
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item.movieId === "number")
      : [];
  } catch {
    return [];
  }
}

function write(items: TrackedMovie[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function isTracked(movieId: number): boolean {
  return getTrackedMovies().some((item) => item.movieId === movieId);
}

export function addTrackedMovie(movieId: number): void {
  const items = getTrackedMovies();
  if (items.some((item) => item.movieId === movieId)) return;
  items.push({ movieId, addedAt: new Date().toISOString(), reminderEnabled: true });
  write(items);
}

export function removeTrackedMovie(movieId: number): void {
  write(getTrackedMovies().filter((item) => item.movieId !== movieId));
}

export function toggleTrackedMovie(movieId: number, enabled: boolean): void {
  if (enabled) addTrackedMovie(movieId);
  else removeTrackedMovie(movieId);
}

export function setTrackedReminderEnabled(movieId: number, enabled: boolean): void {
  write(
    getTrackedMovies().map((item) =>
      item.movieId === movieId ? { ...item, reminderEnabled: enabled } : item,
    ),
  );
}

export function subscribeTrackedMovies(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}