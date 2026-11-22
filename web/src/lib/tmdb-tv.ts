import type { Show } from "../types";
import { MOVIE_API } from "./movies";
import { eventKindFromEpisode } from "./show-event";
import { cachedFetchJson } from "./offline";

const TMDB_TV_CACHE = "sr:tmdbtv:v4";
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

/** Map an API item into the radar schedule. A brand-new series uses its first
 * air date; a returning series uses its next episode date. TMDB has no exact
 * broadcast time, so the value is date-only (12:00Z) and the UI never shows a
 * fabricated clock for `source: "tmdb"`. */
function toScheduleShow(item: BackendTVShow): Show {
  const firstAir = item.firstAirDate ? item.firstAirDate.slice(0, 10) : null;
  const next = item.nextEpisode ?? null;
  // A returning show with no known next episode must not reuse its series
  // premiere date as "next air date" (it would resurrect years-old entries).
  const isPremiere = !next && (item.numberOfSeasons ?? 0) <= 1;
  const airDate = next?.airdate || (isPremiere ? firstAir : null);
  const kind = eventKindFromEpisode(next, item.numberOfSeasons);
  return {
    ...item,
    source: "tmdb",
    category: kind === "series-premiere" ? "new" : kind === "season-premiere" ? "returning" : "announced",
    eventKind: kind,
    seasonNumber: next?.season ?? null,
    nextEpisode: next,
    airDate,
    airtime: null,
    airstamp: airDate ? `${airDate}T12:00:00Z` : null,
    network: item.network ?? item.networkNames?.[0] ?? null,
    rating: typeof item.rating === "number" ? Math.round(item.rating * 10) / 10 : null,
    votes: item.votes ?? null,
    weight: Math.floor((item.popularity ?? 0) * 10),
    isDateConfirmed: Boolean(airDate),
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

/** Announced shows with a future episode or first-air date, from TMDB discover. */
export async function fetchUpcomingTV(): Promise<Show[]> {
  return fetchWithCache("/api/tv/upcoming");
}

/** The single TV schedule used by Radar, Calendar and reminders.
 * All entries come from TMDB through our own API; no TVMaze requests are made. */
export async function fetchTVSchedule(): Promise<Show[]> {
  const settled = await Promise.allSettled([
    fetchOnTheAirTV(),
    fetchAiringTodayTV(),
    fetchPopularTV(),
    fetchTopRatedTV(),
    fetchUpcomingTV(),
  ]);
  const byKey = new Map<string, Show>();
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const show of result.value) {
      if (!show?.id || !show.airstamp) continue;
      const key = `${show.source ?? "tmdb"}:${show.id}`;
      const existing = byKey.get(key);
      if (!existing) { byKey.set(key, show); continue; }
      const a = new Date(show.airstamp!).getTime();
      const b = new Date(existing.airstamp!).getTime();
      const showHasEp = Boolean(show.nextEpisode?.season && show.nextEpisode?.number);
      const existingHasEp = Boolean(existing.nextEpisode?.season && existing.nextEpisode?.number);
      if (showHasEp && !existingHasEp) { byKey.set(key, show); continue; }
      if (!showHasEp && existingHasEp) continue;
      if (a < b) byKey.set(key, show);
    }
  }
  return Array.from(byKey.values()).sort((a, b) =>
    (a.airstamp ?? "").localeCompare(b.airstamp ?? "") || (b.weight ?? 0) - (a.weight ?? 0),
  );
}
