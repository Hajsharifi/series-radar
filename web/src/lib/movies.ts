import type { Movie, MovieTab } from "../types";
import MOVIE_SEED from "./movies-seed.json";

/**
 * The movie data comes from the Series Radar API (a small server that proxies
 * TMDB and Box Office Mojo). Inside the Android APK local assets are loaded
 * from https, so the API lives on the public host; in local previews the
 * server is on 127.0.0.1.
 */
const LOCAL_API = "http://127.0.0.1:8090";
const PUBLIC_API = "http://31.56.229.237:8090";

function pickApiBase(): string {
  if (typeof window === "undefined") return PUBLIC_API;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return LOCAL_API;
  return PUBLIC_API;
}

export const MOVIE_API = pickApiBase();

const CACHE_PREFIX = "sr:movies:v1:";
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

/** Whether a movie's theatrical date is in the future (Tehran). */
export function isUpcoming(movie: Movie): boolean {
  const date = movie.theatricalDate ?? movie.releaseDate;
  if (!date) return false;
  return date >= tehranTodayISO();
}

/** Whether a movie has a future online release (digital/physical). */
export function hasUpcomingOnline(movie: Movie): boolean {
  const date = movie.onlineDate ?? movie.digitalDate ?? movie.physicalDate;
  if (!date) return false;
  return date >= tehranTodayISO();
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
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(MOVIE_API + path, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`API HTTP ${response.status}`);
    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timer);
  }
}

function seedFor(tab: MovieTab): Movie[] {
  if (tab === "cinema") return SEED.nowPlaying ?? [];
  if (tab === "online") return SEED.online ?? [];
  return SEED.upcoming ?? [];
}

function pathFor(tab: MovieTab): string {
  if (tab === "cinema") return "/api/movies/now-playing";
  if (tab === "online") return "/api/movies/online";
  return "/api/movies/upcoming";
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
  for (const tab of ["cinema", "online", "upcoming"] as MovieTab[]) {
    const cached = cachedMovies(tab);
    const match = cached?.items.find((movie) => movie.id === id);
    if (match) return match;
  }
  return findSeedMovie(id);
}

export async function fetchMovieDetail(id: number): Promise<MovieDetailResult> {
  const cached = readCache("detail:" + id, DETAIL_TTL_MS);
  if (cached && cached.items[0]) return { movie: cached.items[0], source: "cache" };
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

export function candidateOnlineDates(movie: Movie): string[] {
  const dates = [movie.releaseKind === "physical" ? movie.physicalDate : movie.digitalDate, movie.digitalDate, movie.physicalDate];
  return dates.filter((value): value is string => Boolean(value));
}

/** Date to show on an online-release card, preferring the chosen online date. */
export function movieOnlineDate(movie: Movie): string | null {
  return movie.onlineDate ?? movie.digitalDate ?? movie.physicalDate ?? null;
}

export function moviePrimaryDate(movie: Movie, tab: MovieTab): string | null {
  if (tab === "online") return movieOnlineDate(movie);
  return movie.theatricalDate ?? movie.releaseDate ?? null;
}
