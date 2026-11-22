import { apiUrl } from "./api";
import { cachedFetchJson } from "./offline";

/** Stable keys are the only thing the client sends to the download API. */
export function movieDownloadKey(movieId: number): string {
  return `movie:${movieId}`;
}

function isCinemaRipQuality(q?: string | null): boolean {
  const s = (q || "").toLowerCase();
  return s.includes("hdts") || s.includes("camrip") || s.includes("telesync") || s.trim() === "cam" || s.trim() === "ts";
}

export function seriesDownloadKey(
  id: number,
  source: "tmdb" | "tvmaze" = "tmdb",
): string {
  return `series:${source}:${id}`;
}

export interface ParsedDownloadKey {
  kind: "movie" | "series";
  source: "tmdb" | "tvmaze";
  id: number;
}

export function parseDownloadKey(key: string): ParsedDownloadKey | null {
  const parts = key.split(":");
  if (parts[0] === "movie" && parts.length === 2 && /^\d+$/.test(parts[1])) {
    return { kind: "movie", source: "tmdb", id: Number(parts[1]) };
  }
  if (
    parts[0] === "series" &&
    parts.length === 3 &&
    (parts[1] === "tmdb" || parts[1] === "tvmaze") &&
    /^\d+$/.test(parts[2])
  ) {
    return { kind: "series", source: parts[1], id: Number(parts[2]) };
  }
  return null;
}

export interface DownloadLink {
  /** Stable id based on the URL path; safe for notification de-duplication. */
  id: string;
  url: string;
  label: string;
  filename: string;
}

export interface DownloadItem {
  id: string;
  quality: string;
  encoder?: string;
  note?: string;
  size?: string;
  links: DownloadLink[];
}

export interface DownloadGroup {
  id: string;
  label: string;
  kind: "dubbled" | "hardsub" | "softsub" | "";
  items?: DownloadItem[];
  episodes?: DownloadEpisode[];
  quality?: string[];
}

export interface DownloadEpisode {
  season: number;
  number: number;
  label: string;
  quality: string;
  encoder?: string;
  size?: string;
  links: DownloadLink[];
}

export interface DownloadSeason {
  number: number;
  label: string;
  groups: DownloadGroup[];
}

export interface DownloadSource {
  kind: "movie" | "series";
  title: string;
  url: string;
}

export interface DownloadPayload {
  key: string;
  status: "found" | "none" | "error";
  checkedAt: string;
  error?: string;
  reason?: string;
  source?: DownloadSource;
  groups?: DownloadGroup[];
  seasons?: DownloadSeason[];
}

export interface DownloadsResponse {
  items: DownloadPayload[];
}

/** Fetches one batch; source errors are returned per key, not thrown. */
export async function fetchDownloads(
  keys: string[],
  refresh = false,
): Promise<Record<string, DownloadPayload>> {
  const unique = Array.from(new Set(keys.filter(Boolean))).slice(0, 40);
  if (unique.length === 0) return {};
  const url = apiUrl(
    `/api/downloads/match?keys=${encodeURIComponent(unique.join(","))}${refresh ? "&refresh=1" : ""}`,
  );
  const data = await cachedFetchJson<DownloadsResponse>(url, 25000);
  const result: Record<string, DownloadPayload> = {};
  for (const item of data.items ?? []) {
    if (!item?.key) continue;
    // Defense-in-depth: drop cinema-screen (HDTS) links even if the server
    // payload predates the filter.
    for (const group of item.groups ?? []) {
      if (group.items) group.items = group.items.filter((it) => !isCinemaRipQuality(it.quality));
    }
    for (const season of item.seasons ?? []) {
      for (const group of season.groups ?? []) {
        if (group.items) group.items = group.items.filter((it) => !isCinemaRipQuality(it.quality));
        if (group.episodes) {
          for (const ep of group.episodes) {
            if (ep.quality && isCinemaRipQuality(ep.quality)) ep.links = [];
          }
        }
      }
    }
    result[item.key] = item;
  }
  return result;
}

/** All direct links in a payload, regardless of movie/series shape.
 * Returns unique links based on stable fingerprint ID. */
export function payloadLinks(payload: DownloadPayload | undefined): DownloadLink[] {
  if (!payload) return [];
  const linkMap = new Map<string, DownloadLink>();
  for (const group of payload.groups ?? []) {
    for (const item of group.items ?? []) {
      for (const link of item.links) linkMap.set(link.id, link);
    }
  }
  for (const season of payload.seasons ?? []) {
    for (const group of season.groups ?? []) {
      for (const episode of group.episodes ?? []) {
        for (const link of episode.links) linkMap.set(link.id, link);
      }
    }
  }
  return Array.from(linkMap.values());
}

export function payloadLinkCount(payload: DownloadPayload | undefined): number {
  return payloadLinks(payload).length;
}

// ---------------------------------------------------------------------------
// "New link" markers. Native notifications are de-duplicated independently.
// ---------------------------------------------------------------------------

const SEEN_KEY = "sr:downloads:seen:v1";
const MAX_SEEN_KEYS = 200;

interface SeenEntry {
  ids: string[];
  at: number;
}

type SeenMap = Record<string, SeenEntry>;

function readSeen(): SeenMap {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const parsed = raw ? (JSON.parse(raw) as SeenMap) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSeen(value: SeenMap): void {
  try {
    const entries = Object.entries(value);
    if (entries.length > MAX_SEEN_KEYS) {
      entries.sort((a, b) => b[1].at - a[1].at);
      value = Object.fromEntries(entries.slice(0, MAX_SEEN_KEYS));
    }
    localStorage.setItem(SEEN_KEY, JSON.stringify(value));
  } catch {
    /* storage may be full */
  }
}

export function unseenLinkIds(key: string, payload: DownloadPayload | undefined): string[] {
  if (!payload || payload.status !== "found") return [];
  const seen = new Set(readSeen()[key]?.ids ?? []);
  return payloadLinks(payload)
    .map((link) => link.id)
    .filter((id) => !seen.has(id));
}

/** Marks every currently known link as seen for this item. */
export function markDownloadsSeen(key: string, payload: DownloadPayload | undefined): void {
  if (!payload || payload.status !== "found") return;
  const seen = readSeen();
  seen[key] = { ids: payloadLinks(payload).map((link) => link.id), at: Date.now() };
  writeSeen(seen);
}

export function clearDownloadsSeen(): void {
  try {
    localStorage.removeItem(SEEN_KEY);
  } catch {
    /* ignore */
  }
}

export function detailRouteFor(key: string): string | null {
  const parsed = parseDownloadKey(key);
  if (!parsed) return null;
  if (parsed.kind === "movie") return `/movie/${parsed.id}`;
  return `/tv/${parsed.id}`;
}
