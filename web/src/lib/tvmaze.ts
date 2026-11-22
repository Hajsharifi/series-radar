/**
 * TV schedule for Radar / Calendar / reminders.
 *
 * All entries now come from TMDB through our own API (see tmdb-tv.ts).
 * The module name is kept for historical reasons; there are no TVMaze
 * requests in the client any more.
 */
import type { Show } from "../types";
import { fetchTVSchedule } from "./tmdb-tv";

const CACHE_KEY = "sr:schedule:v3";
const FULL_TTL_MS = 6 * 60 * 60 * 1000;
const MINUTE_KEY = "sr:minute:v2";

export interface ScheduleSnapshot {
  items: Show[];
  updatedAt: string | null;
  source: "cache" | "network" | "seed";
}

export type CategoryFilter = "all" | ShowCategoryAlias;
type ShowCategoryAlias = Show["category"];

/** No bundled seed: seed ids belonged to the old source and would be wrong. */
export function seedSnapshot(): ScheduleSnapshot {
  return { items: [], updatedAt: null, source: "seed" };
}

let writeCacheTimer: number | null = null;
let pendingCacheWrite: { items: Show[]; updatedAt: string | null } | null = null;

function flushCacheWrite() {
  if (pendingCacheWrite) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(pendingCacheWrite));
    } catch {
      /* storage full or blocked — the app still works in memory */
    }
    pendingCacheWrite = null;
  }
  writeCacheTimer = null;
}

function writeCache(items: Show[], updatedAt: string | null) {
  pendingCacheWrite = { items, updatedAt };
  if (writeCacheTimer === null && typeof window !== "undefined") {
    if ("requestIdleCallback" in window) {
      writeCacheTimer = window.requestIdleCallback(flushCacheWrite, { timeout: 2000 }) as unknown as number;
    } else {
      writeCacheTimer = globalThis.setTimeout(flushCacheWrite, 0) as unknown as number;
    }
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", flushCacheWrite);
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
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Cheap per-minute tick. The TMDB schedule is refreshed every 6 hours by
 * `refreshFull`, so there is no need to hit the network every minute. */
export async function refreshNearby(): Promise<ScheduleSnapshot | null> {
  const today = tehranTodayKey();
  const cached = readMinute();
  const now = Date.now();
  if (cached && cached.day === today && now - cached.at < 60_000) return null;
  writeMinute(today, now);
  return null;
}

/** Full refresh: rebuild the whole TV schedule from TMDB. */
export async function refreshFull(): Promise<ScheduleSnapshot> {
  const items = await fetchTVSchedule();
  if (items.length === 0) throw new Error("پاسخ منبع داده خالی بود");
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
  if (!snapshot.items || snapshot.items.length === 0) return true;
  // Force a refresh if any entry still carries unverified (TMDB-only) dates,
  // so stale pre-fix snapshots are discarded even while still "fresh".
  if (snapshot.items.some((s) => !s.dateSource || s.dateSource !== "tvmaze" || s.nextEpisode?.dateSource !== "tvmaze")) {
    return true;
  }
  if (snapshot.source !== "network" || !snapshot.updatedAt) return true;
  return Date.now() - new Date(snapshot.updatedAt).getTime() > FULL_TTL_MS;
}
