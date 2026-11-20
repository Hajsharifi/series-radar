import { getSettings } from "./settings";

const STORAGE_KEY = "sr:favorites:v2";
const LEGACY_KEY = "sr:favorites:v1";

export type FavoriteSource = "tvmaze" | "tmdb";

export interface StoredFavorite {
  showId: number;
  /** Older entries have no source and are TVMaze. */
  source: FavoriteSource;
  reminderEnabled: boolean;
  reminderLeadHours: number;
  addedAt: string;
  /** Normalized title used to keep one card per real show across TVmaze/TMDB ids. */
  identity?: string;
}

export function favoriteKey(showId: number, source: FavoriteSource = "tvmaze"): string {
  return `${source}:${showId}`;
}

/** Normalize a title so the same show from TVMaze and TMDB maps to one identity. */
export function titleIdentity(title?: string | null): string {
  if (!title) return "";
  return title
    .trim()
    .toLowerCase()
    .replace(/[ئإأآ]/g, "ا")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "")
    .slice(0, 120);
}

export function favoriteSource(source?: string | null): FavoriteSource {
  return source === "tmdb" ? "tmdb" : "tvmaze";
}

function normalize(item: Partial<StoredFavorite> & { showId: number }): StoredFavorite {
  return {
    showId: item.showId,
    source: favoriteSource(item.source),
    reminderEnabled: item.reminderEnabled !== false,
    reminderLeadHours: typeof item.reminderLeadHours === "number"
      ? item.reminderLeadHours
      : getSettings().defaultLeadHours,
    addedAt: item.addedAt ?? new Date().toISOString(),
    identity: item.identity || undefined,
  };
}

function readRaw(key: string): StoredFavorite[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Partial<StoredFavorite>>;
    return Array.isArray(parsed)
      ? parsed
          .filter((item) => item && typeof item.showId === "number")
          .map((item) => normalize(item as Partial<StoredFavorite> & { showId: number }))
      : [];
  } catch {
    return [];
  }
}

function read(): StoredFavorite[] {
  let hasCurrent = false;
  try {
    hasCurrent = localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    hasCurrent = false;
  }
  if (hasCurrent) return readRaw(STORAGE_KEY);
  // Migrate the pre-source list once. An existing empty v2 list is respected.
  const legacy = readRaw(LEGACY_KEY);
  if (legacy.length > 0) {
    write(legacy);
    return legacy;
  }
  return [];
}

function write(items: StoredFavorite[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("sr-favorites-changed"));
}

export function getFavorites(): StoredFavorite[] {
  return read();
}

/** Replace the whole list (used by backup restore, including legacy files). */
export function replaceFavorites(
  items: Array<Partial<StoredFavorite> & { showId: number }>,
): void {
  write(
    items
      .filter((item) => item && typeof item.showId === "number")
      .map((item) => normalize(item)),
  );
}

export function isFavorite(showId: number, source: FavoriteSource = "tvmaze"): boolean {
  return read().some((item) => item.showId === showId && item.source === source);
}

export function addFavorite(
  showId: number,
  source: FavoriteSource = "tvmaze",
  title?: string | null,
): void {
  const items = read();
  if (items.some((item) => item.showId === showId && item.source === source)) return;
  const identity = titleIdentity(title);
  // One card per real show: if the same title is already starred from the other
  // source, migrate that entry to this one instead of adding a duplicate card.
  if (identity) {
    const duplicate = items.find((item) => (item.identity || "") === identity);
    if (duplicate) {
      duplicate.showId = showId;
      duplicate.source = source;
      duplicate.identity = identity;
      write(items);
      return;
    }
  }
  items.push({
    showId,
    source,
    reminderEnabled: true,
    reminderLeadHours: getSettings().defaultLeadHours,
    addedAt: new Date().toISOString(),
    identity: identity || undefined,
  });
  write(items);
}

/** Repair legacy lists that already contain the same show from two sources.
 * Keeps the entry with the earlier addedAt so reminder settings stay stable. */
export function dedupeFavorites(resolveTitle: (item: StoredFavorite) => string | null): void {
  const items = read();
  const seen = new Map<string, StoredFavorite>();
  const kept: StoredFavorite[] = [];
  for (const item of items) {
    const identity = item.identity || titleIdentity(resolveTitle(item));
    if (identity) item.identity = identity;
    if (identity && seen.has(identity)) continue;
    if (identity) seen.set(identity, item);
    kept.push(item);
  }
  if (kept.length !== items.length) write(kept);
}

export function removeFavorite(showId: number, source: FavoriteSource = "tvmaze"): void {
  write(read().filter((item) => !(item.showId === showId && item.source === source)));
}

export function toggleFavorite(
  showId: number,
  source: FavoriteSource,
  enabled: boolean,
  title?: string | null,
): void {
  if (enabled) addFavorite(showId, source, title);
  else removeFavorite(showId, source);
}

export function setReminderEnabled(showId: number, source: FavoriteSource, enabled: boolean): void {
  write(read().map((item) =>
    item.showId === showId && item.source === source ? { ...item, reminderEnabled: enabled } : item,
  ));
}

export function setReminderLead(showId: number, source: FavoriteSource, hours: number): void {
  write(read().map((item) =>
    item.showId === showId && item.source === source ? { ...item, reminderLeadHours: hours } : item,
  ));
}

/** TVMaze-only ids, kept for older call sites. */
export function favoriteIds(): Set<number> {
  return new Set(read().filter((item) => item.source === "tvmaze").map((item) => item.showId));
}

/** Source-aware keys, e.g. "tmdb:94997". */
export function favoriteKeys(): Set<string> {
  return new Set(read().map((item) => favoriteKey(item.showId, item.source)));
}

/** Stable numeric id for Android alarm slots (show range stays below movies). */
export function nativeShowId(showId: number, source: FavoriteSource = "tvmaze"): number {
  return source === "tmdb" ? showId + 1_000_000 : showId;
}

export function subscribeFavorites(listener: () => void): () => void {
  window.addEventListener("sr-favorites-changed", listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener("sr-favorites-changed", listener);
    window.removeEventListener("storage", listener);
  };
}
