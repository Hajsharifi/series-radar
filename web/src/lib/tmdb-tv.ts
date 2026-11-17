import type { Show } from "../types";
import { MOVIE_API } from "./movies";
import { eventKindFromEpisode } from "./show-event";

const TMDB_TV_CACHE = "sr:tmdbtv:v2";
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

export async function fetchPopularTV(): Promise<Show[]> {
  const cached = readCache();
  if (cached?.length) return cached.map(toScheduleShow);
  const results = await fetchTMDBTV("/api/tv/popular");
  writeCache(results);
  return results.map(toScheduleShow);
}

export async function fetchTopRatedTV(): Promise<Show[]> {
  const results = await fetchTMDBTV("/api/tv/top_rated");
  return results.map(toScheduleShow);
}

export async function fetchOnTheAirTV(): Promise<Show[]> {
  const results = await fetchTMDBTV("/api/tv/on_the_air");
  return results.map(toScheduleShow);
}

export async function fetchAiringTodayTV(): Promise<Show[]> {
  const results = await fetchTMDBTV("/api/tv/airing_today");
  return results.map(toScheduleShow);
}
