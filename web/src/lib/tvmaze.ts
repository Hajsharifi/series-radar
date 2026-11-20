import type { Show, ShowCategory } from "../types";
import { toIsoDay, tehranParts } from "./date";
import SEED from "./seed.json";
import { fetchPopularTV, fetchTopRatedTV, fetchOnTheAirTV } from "./tmdb-tv";
import { cachedFetchJson, retryAsync } from "./offline";
import { eventKindFromEpisode } from "./show-event";

const API = "https://api.tvmaze.com";
const CACHE_KEY = "sr:schedule:v1";
const FULL_TTL_MS = 6 * 60 * 60 * 1000;
const MINUTE_KEY = "sr:minute:v2";

export interface ScheduleSnapshot {
  items: Show[];
  updatedAt: string | null;
  source: "cache" | "network" | "seed";
}

export type CategoryFilter = "all" | ShowCategory;

interface TvmazeShow {
  id: number;
  name: string;
  type?: string;
  language?: string;
  status?: string;
  premiered?: string | null;
  genres?: string[];
  summary?: string | null;
  officialSite?: string | null;
  rating?: { average: number | null };
  weight?: number;
  image?: { medium?: string; original?: string } | null;
  network?: { name?: string; country?: { code?: string } } | null;
  webChannel?: { name?: string; country?: { code?: string } } | null;
}

interface TvmazeEpisode {
  id: number;
  name?: string;
  season: number | null;
  number: number | null;
  airdate: string;
  airtime?: string | null;
  airstamp?: string | null;
  _embedded?: { show?: TvmazeShow };
  show?: TvmazeShow;
}

const SEED_ITEMS = SEED as unknown as Show[];

export function seedSnapshot(): ScheduleSnapshot {
  return { items: SEED_ITEMS.map((show) => ({ ...show })), updatedAt: null, source: "seed" };
}

function stripHtml(value?: string | null): string {
  if (!value) return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function isScripted(type?: string | null): boolean {
  return !!type && ["Scripted", "Animation", "Documentary", "Reality", "Game Show"].includes(type);
}

function keepShow(show: TvmazeShow): boolean {
  if (!show?.id || !show.name) return false;
  if (!show.image?.medium && !show.image?.original) return false;
  if (!isScripted(show.type)) return false;
  return true;
}

function makeCategory(season: number | null): ShowCategory {
  if (season === 1) return "new";
  if ((season ?? 0) >= 2) return "returning";
  return "announced";
}

function toShow(episode: TvmazeEpisode): Show {
  const show = episode._embedded?.show ?? episode.show ?? ({} as TvmazeShow);
  const network = show.network ?? show.webChannel ?? undefined;
  return {
    id: show.id,
    title: show.name,
    category: makeCategory(episode.season),
    eventKind: eventKindFromEpisode({ season: episode.season, number: episode.number }),
    overview: stripHtml(show.summary) || undefined,
    posterPath: show.image?.medium ?? show.image?.original ?? null,
    posterOriginal: show.image?.original ?? show.image?.medium ?? null,
    status: show.status ?? undefined,
    seasonNumber: episode.season ?? null,
    airDate: episode.airdate ?? null,
    airtime: episode.airtime ?? null,
    airstamp: episode.airstamp ?? null,
    network: network?.name ?? null,
    countryCode: network?.country?.code ?? null,
    genres: show.genres ?? [],
    language: show.language ?? null,
    rating: show.rating?.average ?? null,
    weight: show.weight ?? 0,
    isDateConfirmed: Boolean(episode.airstamp),
    officialSite: show.officialSite ?? null,
    updatedAt: new Date().toISOString(),
  };
}

function fromEpisodes(episodes: TvmazeEpisode[], includeMidSeason = false): Show[] {
  const seen = new Set<number>();
  const items: Show[] = [];
  for (const episode of episodes) {
    if (!episode?.airdate) continue;
    if (!includeMidSeason && episode.number !== 1) continue;
    const show = episode._embedded?.show ?? episode.show;
    if (!show || !keepShow(show)) continue;
    if (seen.has(show.id)) continue;
    seen.add(show.id);
    items.push(toShow(episode));
  }
  return items;
}

async function getJson<T>(url: string, timeoutMs = 20000): Promise<T> {
  return retryAsync(() => cachedFetchJson<T>(url, timeoutMs), 2, 800);
}

function sortByWeight(items: Show[]): Show[] {
  return [...items].sort((a, b) => {
    const weightDiff = (b.weight ?? 0) - (a.weight ?? 0);
    if (weightDiff !== 0) return weightDiff;
    return (a.airstamp ?? "9999").localeCompare(b.airstamp ?? "9999");
  });
}

function mergeById(current: Show[], incoming: Show[]): Show[] {
  const map = new Map<number, Show>();
  current.forEach((item) => map.set(item.id, item));
  // TVMaze and TMDB ids are unrelated and can collide. Never let a TMDB item
  // replace a real schedule entry (which would break reminders and routing).
  incoming.forEach((item) => {
    if (!map.has(item.id)) map.set(item.id, item);
  });
  return sortByWeight([...map.values()]);
}

/** Merge TMDB TV shows (popular, top-rated, on-the-air) into the schedule. */
export async function enrichWithTMDBTV(baseItems: Show[]): Promise<Show[]> {
  try {
    const [popular, topRated, onTheAir] = await Promise.allSettled([
      retryAsync(fetchPopularTV, 2, 800),
      retryAsync(fetchTopRatedTV, 2, 800),
      retryAsync(fetchOnTheAirTV, 2, 800),
    ]);
    const extra: Show[] = [];
    for (const result of [popular, topRated, onTheAir]) {
      if (result.status === "fulfilled") extra.push(...result.value);
    }
    return mergeById(baseItems, extra);
  } catch {
    return baseItems;
  }
}

function readCache(): { items: Show[]; updatedAt: string | null } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { items?: Show[]; updatedAt?: string | null };
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) return null;
    return { items: parsed.items, updatedAt: parsed.updatedAt ?? null };
  } catch {
    return null;
  }
}

function writeCache(items: Show[], updatedAt: string | null) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ items, updatedAt }));
  } catch {
    /* storage full or blocked — the app still works in memory */
  }
}

function readMinute(): { day: string; at: number } | null {
  try {
    const raw = localStorage.getItem(MINUTE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { day: string; at: number };
  } catch {
    return null;
  }
}

function writeMinute(day: string, at: number) {
  try {
    localStorage.setItem(MINUTE_KEY, JSON.stringify({ day, at }));
  } catch {
    /* ignore */
  }
}

function tehranTodayKey(): string {
  const parts = tehranParts(new Date().toISOString());
  return parts ? toIsoDay({ y: parts.y, m: parts.m, d: parts.d }) : new Date().toISOString().slice(0, 10);
}

function tehranDayOffset(offset: number): string {
  const parts = tehranParts(new Date(Date.now() + offset * 86_400_000).toISOString());
  if (!parts) return new Date().toISOString().slice(0, 10);
  return toIsoDay({ y: parts.y, m: parts.m, d: parts.d });
}

/** Cheap every-minute check: refreshes today's and tomorrow's line-up only. */
export async function refreshNearby(): Promise<ScheduleSnapshot | null> {
  const today = tehranTodayKey();
  const cached = readMinute();
  const now = Date.now();
  if (cached && cached.day === today && now - cached.at < 60_000) return null;

  // US broadcast + UK + global web channels: the strong shows people follow
  // live across Netflix/Apple TV+/Prime/Disney+ as well as cable.
  const days = [tehranDayOffset(0), tehranDayOffset(1)];
  const requests = days.flatMap((day) => [
    getJson<TvmazeEpisode[]>(`${API}/schedule?country=US&date=${day}`),
    getJson<TvmazeEpisode[]>(`${API}/schedule?country=GB&date=${day}`),
    getJson<TvmazeEpisode[]>(`${API}/schedule/web?date=${day}`),
  ]);
  const settled = await Promise.allSettled(requests);
  const episodes: TvmazeEpisode[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled" && Array.isArray(result.value)) episodes.push(...result.value);
  }
  // Include mid-season episodes for today/tomorrow to capture ongoing series
  const incoming = fromEpisodes(episodes, true);
  if (incoming.length === 0) return null;

  const base = readCache();
  const merged = mergeById(base?.items ?? SEED_ITEMS, incoming);
  const updatedAt = new Date().toISOString();
  writeCache(merged, base?.updatedAt ?? null);
  writeMinute(today, now);
  return { items: merged, updatedAt, source: "network" };
}

/** Full refresh: the complete upcoming schedule (~2.7 MB gzip, every 6 hours). */
export async function refreshFull(): Promise<ScheduleSnapshot> {
  const episodes = await getJson<TvmazeEpisode[]>(`${API}/schedule/full`, 45000);
  // Include mid-season episodes for better coverage of ongoing series
  let items = fromEpisodes(episodes, true);
  if (items.length === 0) throw new Error("پاسخ منبع داده خالی بود");
  // Supplement with TMDB TV shows for streaming-only and international series
  items = await enrichWithTMDBTV(items);
  const updatedAt = new Date().toISOString();
  writeCache(items, updatedAt);
  writeMinute(tehranTodayKey(), Date.now());
  return { items, updatedAt, source: "network" };
}

/** Cached snapshot for instant first paint (never blocks the UI). */
export function cachedSnapshot(): ScheduleSnapshot | null {
  const cached = readCache();
  if (!cached) return null;
  const age = cached.updatedAt ? Date.now() - new Date(cached.updatedAt).getTime() : Infinity;
  const fresh = Number.isFinite(age) && age < FULL_TTL_MS;
  return {
    items: cached.items,
    updatedAt: cached.updatedAt,
    source: fresh ? "network" : "cache",
  };
}

export function shouldRefreshFull(snapshot: ScheduleSnapshot | null): boolean {
  if (!snapshot || snapshot.source === "seed") return true;
  if (snapshot.source !== "network" || !snapshot.updatedAt) return true;
  return Date.now() - new Date(snapshot.updatedAt).getTime() > FULL_TTL_MS;
}