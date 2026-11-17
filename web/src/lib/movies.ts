import type { Movie, MovieTab } from "../types";
import { cachedFetchJson } from "./offline";
import { API_BASE } from "./api";
import MOVIE_SEED from "./movies-seed.json";

/**
 * Movies come from the Series Radar API (a small server that proxies TMDB and
 * Box Office Mojo). The base URL lives in lib/api.ts; local previews use the
 * loopback server automatically.
 */
export const MOVIE_API = API_BASE;

const CACHE_PREFIX = "sr:movies:v2:";
const LIST_TTL_MS = 30 * 60 * 1000;
const DETAIL_TTL_MS = 12 * 60 * 60 * 1000;

/** Shared requests so several mounted hooks never hit the API at once. */
const inFlight = new Map<string, Promise<MovieListResult>>();

interface ListPayload {
  updatedAt?: string | null;
  source?: string;
  items: Movie[];
}

interface CachedList extends ListPayload {
  at: number;
}

interface SeedShape {
  nowPlaying: Movie[];
  online: Movie[];
  upcoming: Movie[];
}

const SEED = MOVIE_SEED as unknown as SeedShape;

export const GENRE_FA: Record<number, string> = {
  28: "اکشن",
  12: "ماجراجویی",
  16: "انیمیشن",
  35: "کمدی",
  80: "جنایی",
  99: "مستند",
  18: "درام",
  10751: "خانوادگی",
  14: "فانتزی",
  36: "تاریخی",
  27: "ترسناک",
  10402: "موسیقی",
  9648: "معمایی",
  10749: "عاشقانه",
  878: "علمی‌تخیلی",
  10770: "تله‌فیلم",
  53: "هیجان‌انگیز",
  10752: "جنگی",
  37: "وسترن",
};

/** Today in Tehran as ISO string. */
export function tehranTodayISO(): string {
  if (typeof window === "undefined") return new Date().toISOString().slice(0, 10);
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export type MovieStage = "upcoming" | "quality" | "available" | "expired" | "unknown";

function plainDay(value?: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function shiftDay(iso: string, days: number): string {
  const date = new Date(iso + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The single source of truth for a movie's lifecycle stage.
 * - upcoming: theatrical release is still in the future (Tehran).
 * - quality: released, but no good digital release yet. A film with no known
 *   theatrical date but a future digital date also belongs here.
 * - available: good (digital) quality is already out.
 * - expired: no digital date and more than 90 days since release - archived.
 */
export function movieStage(movie: Movie, today = tehranTodayISO()): MovieStage {
  const digital = plainDay(movie.digitalDate);
  const theatrical = plainDay(movie.theatricalDate) ?? plainDay(movie.releaseDate);
  if ((digital && digital <= today) || movie.availableNow === true) return "available";
  // Some films have a digital date announced before/without a cinema date.
  // They are still "waiting for quality", not unknown - keep them in the list.
  if (!theatrical) return digital ? "quality" : "unknown";
  if (theatrical > today) return "upcoming";
  if (!digital && theatrical <= shiftDay(today, -90)) return "expired";
  return "quality";
}

/** A finished movie must leave the waiting list and the favorites. */
export function isMovieFinished(movie: Movie, today?: string): boolean {
  const stage = movieStage(movie, today);
  return stage === "available" || stage === "expired";
}

export function movieStageLabel(stage: MovieStage): string {
  switch (stage) {
    case "upcoming": return "بهزودی";
    case "quality": return "منتظر کیفیت خوب";
    case "available": return "کیفیت منتشر شد";
    case "expired": return "پایان پیگیری";
    default: return "نامشخص";
  }
}

export function movieGenres(movie: Movie): string[] {
  if (movie.genres?.length) return movie.genres;
  return (movie.genreIds ?? []).map((id) => GENRE_FA[id]).filter(Boolean);
}

export function moviePosterUrl(movie: Movie, large = false): string | null {
  const value = movie.posterPath;
  if (!value) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `https://image.tmdb.org/t/p/${large ? "w780" : "w500"}${value}`;
}

export function movieBackdropUrl(movie: Movie): string | null {
  const value = movie.backdropPath;
  if (!value) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `https://image.tmdb.org/t/p/w780${value}`;
}

function readCache(key: string, ttl: number): ListPayload | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedList;
    if (!Array.isArray(parsed.items)) return null;
    if (Date.now() - (parsed.at ?? 0) > ttl) return { ...parsed, source: "cache" };
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key: string, payload: ListPayload) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ ...payload, at: Date.now() }));
  } catch {
    /* storage may be full; the UI keeps working from memory */
  }
}

async function getJson<T>(path: string, timeoutMs = 25000): Promise<T> {
  return cachedFetchJson<T>(MOVIE_API + path, timeoutMs);
}

function seedFor(tab: MovieTab): Movie[] {
  if (tab === "quality") {
    const seen = new Set<number>();
    return [...(SEED.nowPlaying ?? []), ...(SEED.online ?? [])].filter((movie) => {
      if (seen.has(movie.id)) return false;
      seen.add(movie.id);
      return movieStage(movie) === "quality";
    });
  }
  return SEED.upcoming ?? [];
}

function pathFor(tab: MovieTab): string {
  return tab === "quality" ? "/api/movies/quality" : "/api/movies/upcoming";
}

export interface MovieListResult {
  items: Movie[];
  updatedAt: string | null;
  source: "network" | "cache" | "seed";
}

/** Instant offline snapshot so the app shows content before the API answers. */
export function seedMovies(tab: MovieTab): MovieListResult {
  return { items: seedFor(tab), updatedAt: null, source: "seed" };
}

export function cachedMovies(tab: MovieTab): MovieListResult | null {
  const cached = readCache(tab, LIST_TTL_MS);
  if (!cached || cached.items.length === 0) return null;
  return { items: cached.items, updatedAt: cached.updatedAt ?? null, source: "cache" };
}

export async function fetchMovies(tab: MovieTab, force = false): Promise<MovieListResult> {
  if (!force) {
    const cached = readCache(tab, LIST_TTL_MS);
    if (cached && cached.items.length > 0 && (cached as CachedList).source !== "cache") {
      return { items: cached.items, updatedAt: cached.updatedAt ?? null, source: "network" };
    }
  }
  const key = tab + (force ? ":force" : "");
  const existing = inFlight.get(key);
  if (existing) return existing;
  const request = (async () => {
    const data = await getJson<ListPayload>(pathFor(tab) + (force ? "?refresh=1" : ""));
    const items = Array.isArray(data.items) ? data.items : [];
    if (items.length === 0) throw new Error("پاسخ سرور فیلم خالی بود");
    const updatedAt = data.updatedAt ?? new Date().toISOString();
    writeCache(tab, { items, updatedAt, source: data.source });
    return { items, updatedAt, source: "network" as const };
  })().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, request);
  return request;
}

export interface MovieDetailResult {
  movie: Movie;
  source: "network" | "cache" | "seed";
}

export function findSeedMovie(id: number): Movie | null {
  const all = [...(SEED.nowPlaying ?? []), ...(SEED.online ?? []), ...(SEED.upcoming ?? [])];
  return all.find((movie) => movie.id === id) ?? null;
}

/** Looks for a title already present in any cached tab so details paint instantly. */
export function findCachedMovie(id: number): Movie | null {
  for (const tab of ["quality", "upcoming"] as MovieTab[]) {
    const cached = cachedMovies(tab);
    const match = cached?.items.find((movie) => movie.id === id);
    if (match) return match;
  }
  // Old caches from versions before the quality tab was introduced.
  for (const legacy of ["cinema", "online"] as const) {
    const cached = readCache(legacy, LIST_TTL_MS);
    const match = cached?.items.find((movie) => movie.id === id);
    if (match) return match;
  }
  return findSeedMovie(id);
}

export async function fetchMovieDetail(id: number, force = false): Promise<MovieDetailResult> {
  if (!force) {
    const cached = readCache("detail:" + id, DETAIL_TTL_MS);
    if (cached && cached.items[0]) return { movie: cached.items[0], source: "cache" };
  }
  try {
    const detail = await getJson<Movie>("/api/movie/" + id);
    if (!detail?.id) throw new Error("فیلم پیدا نشد");
    writeCache("detail:" + id, { items: [detail], updatedAt: new Date().toISOString() });
    return { movie: detail, source: "network" };
  } catch (error) {
    const seed = findSeedMovie(id);
    if (seed) return { movie: seed, source: "seed" };
    throw error;
  }
}

export async function searchMovies(query: string): Promise<Movie[]> {
  const text = query.trim();
  if (text.length < 2) return [];
  const data = await getJson<{ items: Movie[] }>("/api/movies/search?q=" + encodeURIComponent(text), 15000);
  return Array.isArray(data.items) ? data.items : [];
}

export function moviePrimaryDate(movie: Movie, tab: MovieTab): string | null {
  const today = tehranTodayISO();
  if (tab === "quality" && movie.digitalDate && movie.digitalDate > today) return movie.digitalDate;
  return movie.theatricalDate ?? movie.releaseDate ?? null;
}
