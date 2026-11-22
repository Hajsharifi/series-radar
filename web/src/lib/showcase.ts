import { API_BASE } from "./api";
import { cachedFetchJson } from "./offline";

export interface ShowcaseItem {
  posterUrl: string;
  title: string;
  url: string;
  kind?: "movie" | "series" | "unknown";
  alt?: string;
}

export async function fetchShowcase(force = false): Promise<ShowcaseItem[]> {
  const url = `${API_BASE}/api/showcase${force ? "?refresh=1" : ""}`;
  const data = await cachedFetchJson<{ items: ShowcaseItem[] }>(url, 20000);
  return data.items ?? [];
}

export function cachedShowcase(): ShowcaseItem[] | null {
  try {
    const raw = localStorage.getItem("sr:net:v1:" + API_BASE + "/api/showcase");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data?: { items?: ShowcaseItem[] } };
    return parsed?.data?.items ?? null;
  } catch {
    return null;
  }
}