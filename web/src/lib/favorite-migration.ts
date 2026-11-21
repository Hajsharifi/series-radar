import { cachedFetchJson } from "./offline";
import { API_BASE } from "./api";
import { getFavorites, replaceFavorites, type StoredFavorite } from "./favorites";

const MARKER_KEY = "sr:favorites:migrated-to-tmdb:v1";
const TVMAZE_API = "https://api.tvmaze.com";

interface TvmazeShow {
  name?: string;
  premiered?: string | null;
}

interface TmdbSearchResult {
  id: number;
  name?: string;
  firstAirDate?: string;
}

function normalizeTitle(value?: string | null): string {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/[ئإأآ]/g, "ا")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "");
}

function titleSimilarity(a?: string | null, b?: string | null): number {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  // simple containment / prefix heuristic
  if (x.includes(y) || y.includes(x)) return 0.9;
  return 0;
}

export interface MigrationReport {
  migrated: number;
  dropped: string[];
}

export function isMigrationDone(): boolean {
  try {
    return localStorage.getItem(MARKER_KEY) === "1";
  } catch {
    return false;
  }
}

export async function migrateFavoritesToTmdb(): Promise<MigrationReport> {
  const report: MigrationReport = { migrated: 0, dropped: [] };
  if (isMigrationDone()) return report;

  let items: StoredFavorite[];
  try {
    items = getFavorites();
  } catch {
    return report;
  }

  const tvmazeItems = items.filter((i) => i.source === "tvmaze");
  if (tvmazeItems.length === 0) {
    try { localStorage.setItem(MARKER_KEY, "1"); } catch { /* ignore */ }
    return report;
  }

  const migrated: StoredFavorite[] = [];
  const keptTmdb = items.filter((i) => i.source !== "tvmaze");

  for (const fav of tvmazeItems) {
    let tmdbId: number | null = null;
    let tmdbTitle: string | undefined;
    try {
      const show = await cachedFetchJson<TvmazeShow>(`${TVMAZE_API}/shows/${fav.showId}`, 15000);
      const name = show?.name;
      const year = show?.premiered ? Number(show.premiered.slice(0, 4)) : undefined;
      if (name) {
        const url = `${API_BASE}/api/tv/search?q=${encodeURIComponent(name)}`;
        const data = await cachedFetchJson<{ results: TmdbSearchResult[] }>(url, 15000);
        const results = data?.results ?? [];
        // pick best match by title similarity + year
        let best: TmdbSearchResult | null = null;
        let bestScore = 0;
        for (const r of results) {
          const sim = titleSimilarity(r.name, name);
          const rYear = r.firstAirDate ? Number(r.firstAirDate.slice(0, 4)) : undefined;
          const yearOk = !year || !rYear || Math.abs(year - rYear) <= 1;
          if (sim >= 0.9 && yearOk && sim > bestScore) {
            best = r;
            bestScore = sim;
          }
        }
        if (best) {
          tmdbId = best.id;
          tmdbTitle = best.name;
        }
      }
    } catch {
      tmdbId = null;
    }

    if (tmdbId !== null) {
      // avoid duplicating an existing tmdb favorite for the same show
      if (!keptTmdb.some((k) => k.showId === tmdbId)) {
        keptTmdb.push({
          ...fav,
          showId: tmdbId,
          source: "tmdb",
          identity: tmdbTitle ? fav.identity : fav.identity,
        });
      }
      migrated.push(fav);
      report.migrated += 1;
    } else {
      report.dropped.push(`tvmaze:${fav.showId}`);
    }
  }

  // write merged list
  try {
    replaceFavorites([...keptTmdb]);
  } catch {
    /* ignore */
  }

  try { localStorage.setItem(MARKER_KEY, "1"); } catch { /* ignore */ }
  return report;
}
