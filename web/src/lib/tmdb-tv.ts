import type { Show } from "../types";
import { MOVIE_API } from "./movies";

const TMDB_TV_CACHE = "sr:tmdbtv:v1";
const TMDB_TV_TTL = 24 * 60 * 60 * 1000;

interface TMDBTVShow {
  id: number;
  name: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  first_air_date?: string | null;
  genre_ids?: number[];
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  original_language?: string;
  status?: string;
  number_of_seasons?: number;
  episode_run_time?: number[];
  networks?: Array<{ name?: string; origin_country?: string }>;
}

interface TMDBTVResponse {
  page: number;
  results: TMDBTVShow[];
  total_pages: number;
  total_results: number;
}

const GENRE_FA: Record<number, string> = {
  10759: "اکشن و ماجراجویی",
  16: "انیمیشن",
  35: "کمدی",
  80: "جنایی",
  99: "مستند",
  18: "درام",
  10751: "خانوادگی",
  10762: "کودک",
  9648: "معمایی",
  10763: "خبری",
  10764: "رئالیتی",
  10765: "علمی‌تخیلی و فانتزی",
  10766: "سوپل‌آپرا",
  10767: "تاک‌شو",
  10768: "جنگی",
  37: "وسترن",
};

function genreNames(ids: number[]): string[] {
  return ids.map((id) => GENRE_FA[id]).filter(Boolean);
}

function tmdbPoster(path?: string | null): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/w500${path}`;
}

function normalizeTMDBTV(show: TMDBTVShow): Show {
  const firstAir = show.first_air_date ? show.first_air_date.slice(0, 10) : null;
  const seasonCount = show.number_of_seasons ?? 0;
  const category = seasonCount <= 1 ? "new" : "returning";
  return {
    id: show.id,
    title: show.name,
    originalTitle: show.original_name ?? undefined,
    overview: show.overview ?? undefined,
    posterPath: tmdbPoster(show.poster_path),
    posterOriginal: show.backdrop_path ? `https://image.tmdb.org/t/p/w780${show.backdrop_path}` : null,
    status: show.status ?? undefined,
    category: category as "new" | "returning" | "announced",
    seasonNumber: null,
    airDate: firstAir,
    airtime: null,
    airstamp: firstAir ? `${firstAir}T12:00:00Z` : null,
    network: show.networks?.[0]?.name ?? null,
    countryCode: show.networks?.[0]?.origin_country?.toUpperCase() ?? null,
    genres: genreNames(show.genre_ids ?? []),
    language: show.original_language ?? null,
    rating: typeof show.vote_average === "number" ? Math.round(show.vote_average * 10) / 10 : null,
    weight: Math.floor((show.popularity ?? 0) * 10),
    isDateConfirmed: Boolean(firstAir),
    officialSite: null,
    updatedAt: new Date().toISOString(),
  };
}

async function fetchTMDBTV(path: string): Promise<TMDBTVShow[]> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(MOVIE_API + path, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`TV HTTP ${response.status}`);
    const data = (await response.json()) as TMDBTVResponse;
    return data.results ?? [];
  } finally {
    window.clearTimeout(timer);
  }
}

function readCache(): TMDBTVShow[] | null {
  try {
    const raw = localStorage.getItem(TMDB_TV_CACHE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; items: TMDBTVShow[] };
    if (Date.now() - (parsed.at ?? 0) > TMDB_TV_TTL) return null;
    return parsed.items;
  } catch {
    return null;
  }
}

function writeCache(items: TMDBTVShow[]) {
  try {
    localStorage.setItem(TMDB_TV_CACHE, JSON.stringify({ at: Date.now(), items }));
  } catch {
    /* ignore */
  }
}

export async function fetchPopularTV(): Promise<Show[]> {
  const cached = readCache();
  if (cached?.length) return cached.map(normalizeTMDBTV);
  const results = await fetchTMDBTV("/api/tv/popular");
  writeCache(results);
  return results.map(normalizeTMDBTV);
}

export async function fetchTopRatedTV(): Promise<Show[]> {
  const results = await fetchTMDBTV("/api/tv/top_rated");
  return results.map(normalizeTMDBTV);
}

export async function fetchOnTheAirTV(): Promise<Show[]> {
  const results = await fetchTMDBTV("/api/tv/on_the_air");
  return results.map(normalizeTMDBTV);
}

export async function fetchAiringTodayTV(): Promise<Show[]> {
  const results = await fetchTMDBTV("/api/tv/airing_today");
  return results.map(normalizeTMDBTV);
}