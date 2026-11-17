import type { Show } from "../types";

export interface FeaturedOptions {
  now?: number;
  favoriteIds?: Set<number>;
  /** Genres of the user's starred shows, used as a mild taste signal. */
  favoriteGenres?: string[];
  /** Keys already shown in tonight/live sections, e.g. "tmdb:123". */
  excludedKeys?: Set<string>;
  limit?: number;
}

const DAY = 86_400_000;
const CORE_WINDOW = 21 * DAY;
const MAX_WINDOW = 45 * DAY;

const GENRE_ALIASES: Record<string, string> = {
  drama: "drama", درام: "drama", دراما: "drama",
  comedy: "comedy", کمدی: "comedy",
  crime: "crime", جنایی: "crime",
  thriller: "thriller", هیجانانگیز: "thriller", دلهرهآور: "thriller",
  mystery: "mystery", معمایی: "mystery",
  "sci-fi": "scifi", "science-fiction": "scifi", "science fiction": "scifi",
  "علمی-تخیلی": "scifi", "علمی-تخیلی و فانتزی": "scifi",
  fantasy: "fantasy", فانتزی: "fantasy",
  animation: "animation", انیمیشن: "animation",
  documentary: "documentary", مستند: "documentary",
  family: "family", خانوادگی: "family",
  reality: "reality", رئالیتی: "reality",
  action: "action", اکشن: "action", "اکشن و ماجراجویی": "action",
  war: "war", جنگی: "war",
  western: "western", وسترن: "western",
};

export function canonicalGenre(value?: string | null): string {
  if (!value) return "";
  const key = value.trim().toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک");
  return GENRE_ALIASES[key] ?? key;
}

function showKey(show: Show): string {
  return `${show.source ?? "tvmaze"}:${show.id}`;
}

/** Lower confidence bound for a rating, so a lone 9.0 from a handful of
 * voters cannot outrank a steady 8.2 from thousands. Missing ratings are
 * penalized rather than treated as a perfect score. */
function qualityScore(show: Show, poolMean: number): number {
  const rating = typeof show.rating === "number" && show.rating > 0 ? show.rating : null;
  const votes = typeof show.votes === "number" && show.votes > 0 ? show.votes : 0;
  if (rating === null) return poolMean * 0.82;
  if (votes === 0) return rating * 0.94;
  const p = Math.min(1, Math.max(0, rating / 10));
  const z = 1.64;
  const denominator = 1 + (z * z) / votes;
  const centre = p + (z * z) / (2 * votes);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * votes)) / votes);
  return ((centre - margin) / denominator) * 10;
}

function percentile(value: number, sorted: number[]): number {
  if (sorted.length <= 1) return 0.5;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo / (sorted.length - 1);
}

/**
 * Strict, multi-criteria selection for the "پیشنهاد رادار" shelf. The old code
 * only sorted by `weight`; this compares rating quality, popularity, air-date
 * proximity, data confidence and genre fit, then enforces genre diversity.
 */
export function rankFeaturedShows(shows: Show[], options: FeaturedOptions = {}): Show[] {
  const now = options.now ?? Date.now();
  const limit = options.limit ?? 6;
  const favoriteIds = options.favoriteIds ?? new Set<number>();
  const favoriteGenres = new Set((options.favoriteGenres ?? []).map(canonicalGenre).filter(Boolean));
  const excluded = options.excludedKeys ?? new Set<string>();

  const candidates = shows.filter((show) => {
    if (!show.airstamp) return false;
    const diff = new Date(show.airstamp).getTime() - now;
    return diff >= -6 * 3_600_000 && diff <= MAX_WINDOW;
  });
  if (candidates.length === 0) return [];

  const ratings = candidates
    .map((show) => show.rating)
    .filter((value): value is number => typeof value === "number" && value > 0);
  const poolMean = ratings.length
    ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length
    : 6.8;
  const weights = candidates.map((show) => show.weight ?? 0).sort((a, b) => a - b);

  const scored = candidates.map((show) => {
    const days = Math.max(0, (new Date(show.airstamp!).getTime() - now) / DAY);
    const quality = qualityScore(show, poolMean);
    const popularity = percentile(show.weight ?? 0, weights);
    const proximity = Math.max(0, 1 - days / CORE_WINDOW);
    const votes = typeof show.votes === "number" ? show.votes : 0;
    const confidence = votes > 0
      ? Math.min(1, Math.log10(votes + 1) / 3.2)
      : typeof show.rating === "number" && show.rating > 0 ? 0.55 : 0.25;
    const genres = new Set((show.genres ?? []).map(canonicalGenre).filter(Boolean));
    let taste = 0;
    if (favoriteGenres.size && genres.size) {
      let hits = 0;
      genres.forEach((genre) => {
        if (favoriteGenres.has(genre)) hits += 1;
      });
      taste = hits / genres.size;
    }
    // Weights are redistributed when there is no taste signal, so the ranking
    // never silently treats "0" as a real preference.
    const score = favoriteGenres.size
      ? 0.4 * quality + 0.2 * popularity + 0.2 * proximity + 0.1 * confidence + 0.1 * taste
      : 0.45 * quality + 0.22 * popularity + 0.22 * proximity + 0.11 * confidence;
    return { show, score };
  });

  const qualified = scored
    .filter(({ show }) => {
      if (!show.posterPath && !show.posterOriginal) return false;
      if (show.source !== "tmdb" && favoriteIds.has(show.id)) return false;
      if (excluded.has(showKey(show))) return false;
      // Both gates matter: a low-rated but "popular" show is not a
      // suggestion, and a high rating from three voters is not either.
      return qualityScore(show, poolMean) >= 6.5 && (show.weight ?? 0) >= 80;
    })
    .sort((a, b) => b.score - a.score);

  const chosen: typeof qualified = [];
  const genreCount = new Map<string, number>();
  for (const entry of qualified) {
    if (chosen.length >= limit) break;
    const primary = canonicalGenre(entry.show.genres?.[0]);
    if (primary && (genreCount.get(primary) ?? 0) >= 2) continue;
    chosen.push(entry);
    if (primary) genreCount.set(primary, (genreCount.get(primary) ?? 0) + 1);
  }

  return chosen.map((entry) => entry.show);
}
