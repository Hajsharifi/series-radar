import type { BoxOfficePayload } from "../types";
import { MOVIE_API } from "./movies";
import BOXOFFICE_SEED from "./boxoffice-seed.json";

const CACHE_KEY = "sr:boxoffice:v1";
const TTL_MS = 60 * 60 * 1000;

const SEED = BOXOFFICE_SEED as unknown as BoxOfficePayload;

export interface BoxOfficeResult {
  payload: BoxOfficePayload;
  source: "network" | "cache" | "seed";
}

export function seedBoxOffice(): BoxOfficeResult {
  return { payload: SEED, source: "seed" };
}

export function cachedBoxOffice(): BoxOfficeResult | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; payload: BoxOfficePayload };
    if (!parsed.payload) return null;
    const source = Date.now() - (parsed.at ?? 0) <= TTL_MS ? "cache" : "cache";
    return { payload: parsed.payload, source };
  } catch {
    return null;
  }
}

export async function fetchBoxOffice(force = false): Promise<BoxOfficeResult> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(MOVIE_API + "/api/boxoffice" + (force ? "?refresh=1" : ""), {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`API HTTP ${response.status}`);
    const payload = (await response.json()) as BoxOfficePayload;
    if (!payload || (!payload.weekend?.length && !payload.yearly?.length)) {
      throw new Error("دادهٔ گیشه خالی بود");
    }
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), payload }));
    } catch {
      /* ignore storage errors */
    }
    return { payload, source: "network" };
  } finally {
    window.clearTimeout(timer);
  }
}
