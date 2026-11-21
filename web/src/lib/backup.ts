import { getFavorites, replaceFavorites } from "./favorites";
import { getMovieFavorites, replaceMovieFavorites } from "./movie-favorites";
import { getTrackedMovies } from "./movie-track";

export interface BackupData {
  version: number;
  exportedAt: string;
  favorites: ReturnType<typeof getFavorites>;
  movieFavorites: ReturnType<typeof getMovieFavorites>;
  trackedMovies: ReturnType<typeof getTrackedMovies>;
  /** Watched episode ids, namespaced by `tmdb:` / `tvmaze:`. */
  episodeTracking?: Record<string, number[]>;
}

const EPISODE_KEY = "sr:episode-tracking:v2";

export function exportBackup(): BackupData {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    favorites: getFavorites(),
    movieFavorites: getMovieFavorites(),
    trackedMovies: getTrackedMovies(),
    episodeTracking: readEpisodeTracking(),
  };
}

function readEpisodeTracking(): Record<string, number[]> {
  try {
    const parsed = JSON.parse(localStorage.getItem(EPISODE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function downloadBackup(): void {
  const data = exportBackup();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `radar-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importBackup(jsonText: string): { ok: boolean; error?: string } {
  try {
    const data = JSON.parse(jsonText) as BackupData;
    if (!data.version || !data.favorites || !data.movieFavorites || !data.trackedMovies) {
      return { ok: false, error: "فرمت فایل معتبر نیست" };
    }
    replaceFavorites(data.favorites);
    localStorage.removeItem("sr:favorites:v1");
    replaceMovieFavorites(data.movieFavorites);
    localStorage.setItem("sr:movie-track:v1", JSON.stringify(data.trackedMovies));
    if (data.episodeTracking) {
      localStorage.setItem(EPISODE_KEY, JSON.stringify(data.episodeTracking));
      window.dispatchEvent(new Event("sr-episode-tracking-changed"));
    }
    window.dispatchEvent(new Event("sr-favorites-changed"));
    window.dispatchEvent(new Event("sr-movie-track-changed"));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "خطا در پردازش فایل: " + (e instanceof Error ? e.message : String(e)) };
  }
}

export function readBackupFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}