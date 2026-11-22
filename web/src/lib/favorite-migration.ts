import { cachedFetchJson } from "./offline";
import { API_BASE } from "./api";
import { getFavorites, replaceFavorites, type StoredFavorite } from "./favorites";

const MARKER_KEY = "sr:favorites:migrated-to-tmdb:v2";
const LEGACY_MARKER_KEY = "sr:favorites:migrated-to-tmdb:v1";
const LEGACY_STORAGE_KEY = "sr:favorites:v1";
const TVMAZE_API = "https://api.tvmaze.com";

interface TvmazeShow {
  name?: string;
  premiered?: string | null;
}

interface TmdbSearchResult {
  id: number;
  title?: string;
  originalTitle?: string;
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
  if (x.includes(y) || y.includes(x)) return 0.9;
  return 0;
}

/** Best similarity between a TMDB result and a set of candidate titles. */
function bestSimilarity(result: TmdbSearchResult, candidates: string[]): number {
  let best = 0;
  for (const c of candidates) {
    best = Math.max(best, titleSimilarity(result.title, c));
    best = Math.max(best, titleSimilarity(result.originalTitle, c));
  }
  return best;
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

function readLegacyTvmazeItems(): StoredFavorite[] {
  const out: StoredFavorite[] = [];
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return out;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return out;
    for (const item of parsed) {
      if (!item || typeof item.showId !== "number") continue;
      if (item.source === "tmdb") continue;
      out.push({
        showId: item.showId,
        source: "tvmaze",
        reminderEnabled: item.reminderEnabled !== false,
        reminderLeadHours: typeof item.reminderLeadHours === "number" ? item.reminderLeadHours : 24,
        addedAt: item.addedAt ?? new Date().toISOString(),
        identity: item.identity,
        identities: Array.isArray(item.identities) ? item.identities : undefined,
      });
    }
  } catch {
    /* ignore */
  }
  return out;
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

  // Recovery for users hit by the v1 bug: if the old marker was set, the
  // legacy storage may still hold the original tvmaze rows that were dropped.
  try {
    if (localStorage.getItem(LEGACY_MARKER_KEY) === "1") {
      const legacyItems = readLegacyTvmazeItems();
      for (const legacy of legacyItems) {
        if (!items.some((i) => i.source === "tvmaze" && i.showId === legacy.showId)) {
          items.push(legacy);
        }
      }
    }
  } catch {
    /* ignore */
  }

  const tvmazeItems = items.filter((i) => i.source === "tvmaze");
  if (tvmazeItems.length === 0) {
    try { localStorage.setItem(MARKER_KEY, "1"); } catch { /* ignore */ }
    return report;
  }

  const migrated: StoredFavorite[] = [];
  const keptTmdb = items.filter((i) => i.source !== "tvmaze");
  let hadNetworkError = false;

  for (const fav of tvmazeItems) {
    let tmdbId: number | null = null;
    let tmdbTitle: string | undefined;
    let networkError = false;
    // candidate titles: stored identities first, then TVMaze name
    const candidates = fav.identities?.length
      ? [...fav.identities]
      : (fav.identity ? [fav.identity] : []);
    try {
      const show = await cachedFetchJson<TvmazeShow>(`${TVMAZE_API}/shows/${fav.showId}`, 15000);
      const name = show?.name;
      const year = show?.premiered ? Number(show.premiered.slice(0, 4)) : undefined;
      if (name && !candidates.includes(name)) candidates.push(name);

      if (candidates.length > 0) {
        const url = `${API_BASE}/api/tv/search?q=${encodeURIComponent(name ?? candidates[0])}`;
        const data = await cachedFetchJson<{ results: TmdbSearchResult[] }>(url, 15000);
        const results = data?.results ?? [];
        let best: TmdbSearchResult | null = null;
        let bestScore = 0;
        for (const r of results) {
          const sim = bestSimilarity(r, candidates);
          const rYear = r.firstAirDate ? Number(r.firstAirDate.slice(0, 4)) : undefined;
          const yearOk = !year || !rYear || Math.abs(year - rYear) <= 1;
          if (sim >= 0.9 && yearOk && sim > bestScore) {
            best = r;
            bestScore = sim;
          }
        }
        if (best) {
          tmdbId = best.id;
          tmdbTitle = best.title ?? best.originalTitle;
        }
      }
    } catch {
      networkError = true;
      hadNetworkError = true;
    }

    if (networkError) {
      // Keep the original row untouched; retry next run.
      keptTmdb.push(fav);
      continue;
    }

    if (tmdbId !== null) {
      if (!keptTmdb.some((k) => k.showId === tmdbId)) {
        keptTmdb.push({
          ...fav,
          showId: tmdbId,
          source: "tmdb",
          identity: tmdbTitle ? fav.identity : fav.identity,
          identities: fav.identities ?? (tmdbTitle ? [tmdbTitle] : undefined),
        });
      }
      migrated.push(fav);
      report.migrated += 1;
    } else {
      report.dropped.push(`tvmaze:${fav.showId}`);
    }
  }

  try {
    replaceFavorites([...keptTmdb]);
  } catch {
    /* ignore */
  }

  // Only mark complete when no network errors occurred, so a partial failure
  // retries on the next launch instead of silently dropping data.
  if (!hadNetworkError) {
    try { localStorage.setItem(MARKER_KEY, "1"); } catch { /* ignore */ }
    // clear the legacy marker so recovery doesn't re-trigger
    try { localStorage.removeItem(LEGACY_MARKER_KEY); } catch { /* ignore */ }
  }
  return report;
}