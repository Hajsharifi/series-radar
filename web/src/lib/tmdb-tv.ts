import type { Show } from "../types";
import { MOVIE_API } from "./movies";
import { eventKindFromEpisode } from "./show-event";
import { cachedFetchJson } from "./offline";

const TMDB_TV_CACHE = "sr:tmdbtv:v3";
const TMDB_TV_TTL = 24 * 60 * 60 * 1000;

/** The API already normalizes TMDB fields into the Show shape. */
interface BackendTVShow extends Show {
  firstAirDate?: string | null;
  votes?: number | null;
}

interface TMDBTVResponse {
  page?: number;
  results: BackendTVShow[];
  total_pages?: number;
  total_results?: number;
}

/** Map an API item into the radar schedule. Brand-new series use their first
 * air date; mid-season episodes stay in the dedicated live sections. */
function toScheduleShow(item: BackendTVShow): Show {
  const firstAir = item.firstAirDate ? item.firstAirDate.slice(0, 10) : null;
  const next = item.nextEpisode ?? null;
  const kind = eventKindFromEpisode(next, item.numberOfSeasons);
  return {
    ...item,
    source: "tmdb",
    category: kind === "series-premiere" ? "new" : kind === "season-premiere" ? "returning" : "announced",
    eventKind: kind,
    seasonNumber: next?.season ?? null,
    nextEpisode: next,
    airDate: firstAir,
    airtime: null,
    airstamp: firstAir ? `${firstAir}T12:00:00Z` : null,
    network: item.network ?? item.networkNames?.[0] ?? null,
    rating: typeof item.rating === "number" ? Math.round(item.rating * 10) / 10 : null,
    votes: item.votes ?? null,
    weight: Math.floor((item.popularity ?? 0) * 10),
    isDateConfirmed: Boolean(firstAir),
    updatedAt: item.updatedAt ?? new Date().toISOString(),
  };
}

async function fetchTMDBTV(path: string): Promise<BackendTVShow[]> {
  const data = await cachedFetchJson<TMDBTVResponse>(MOVIE_API + path, 20000);
  return data.results ?? [];
}

function readCache(): BackendTVShow[] | null {
  try {
    const raw = localStorage.getItem(TMDB_TV_CACHE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; items: BackendTVShow[] };
    if (Date.now() - (parsed.at ?? 0) > TMDB_TV_TTL) return null;
    return parsed.items;
  } catch {
    return null;
  }
}

function writeCache(items: BackendTVShow[]) {
  try {
    localStorage.setItem(TMDB_TV_CACHE, JSON.stringify({ at: Date.now(), items }));
  } catch {
    /* ignore */
  }
}

async function fetchWithCache(path: string): Promise<Show[]> {
  try {
    const results = await fetchTMDBTV(path);
    return results.map(toScheduleShow);
  } catch (error) {
    // Fallback to stale localStorage cache on any error (network/timeout/HTTP)
    const cached = readCache();
    if (cached?.length) return cached.map(toScheduleShow);
    throw error;
  }
}

export async function fetchPopularTV(): Promise<Show[]> {
  const cached = readCache();
  if (cached?.length) return cached.map(toScheduleShow);
  const results = await fetchWithCache("/api/tv/popular");
  writeCache(results as BackendTVShow[]);
  return results;
}

export async function fetchTopRatedTV(): Promise<Show[]> {
  return fetchWithCache("/api/tv/top_rated");
}

export async function fetchOnTheAirTV(): Promise<Show[]> {
  return fetchWithCache("/api/tv/on_the_air");
}

export async function fetchAiringTodayTV(): Promise<Show[]> {
  return fetchWithCache("/api/tv/airing_today");
}