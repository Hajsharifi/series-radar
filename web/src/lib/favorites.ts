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
  /** Every normalized title seen for this show (localized and original). */
  identities?: string[];
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

/** Normalize one title or a list of titles (localized + original) to identities. */
export function normalizeTitles(
  value?: string | Array<string | null | undefined> | null,
): string[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return Array.from(new Set(list.map((title) => titleIdentity(title)).filter(Boolean)));
}

/** Union of the identities already stored for a favorite and live titles. */
export function favoriteIdentities(
  item: Pick<StoredFavorite, "identity" | "identities">,
  ...titles: Array<string | string[] | null | undefined>
): string[] {
  const ids = new Set<string>();
  if (item.identity) ids.add(titleIdentity(item.identity));
  for (const id of item.identities ?? []) {
    const normalized = titleIdentity(id);
    if (normalized) ids.add(normalized);
  }
  for (const title of titles) {
    for (const id of normalizeTitles(title)) ids.add(id);
  }
  return Array.from(ids);
}

export interface IdentityEntry<T> {
  item: T;
  identities: string[];
}

/**
 * Group entries that share any normalized identity. Two rows of one show can
 * carry a localized title in one place and the original title in another, so
 * grouping on the union is what keeps them on a single card.
 */
export function groupByIdentity<T extends { identities: string[] }>(entries: T[]): T[][] {
  const groups: Array<{ ids: Set<string>; entries: T[] }> = [];
  for (const entry of entries) {
    const ids = new Set(entry.identities.filter(Boolean));
    const matches = groups.filter((group) => Array.from(ids).some((id) => group.ids.has(id)));
    let target: (typeof groups)[number];
    if (matches.length === 0) {
      target = { ids: new Set(), entries: [] };
      groups.push(target);
    } else {
      target = matches[0];
      for (const extra of matches.slice(1)) {
        for (const id of extra.ids) target.ids.add(id);
        target.entries.push(...extra.entries);
        groups.splice(groups.indexOf(extra), 1);
      }
    }
    for (const id of ids) target.ids.add(id);
    target.entries.push(entry);
  }
  return groups.map((group) => group.entries);
}

function unionIdentities(...lists: Array<Array<string | undefined> | undefined>): string[] {
  const ids = new Set<string>();
  for (const list of lists) {
    for (const id of list ?? []) if (id) ids.add(id);
  }
  return Array.from(ids);
}

function mergeDuplicateRows(first: StoredFavorite, second: StoredFavorite): StoredFavorite {
  const earliest = second.addedAt < first.addedAt ? second : first;
  return {
    ...earliest,
    identity: first.identity || second.identity,
    identities: unionIdentities(first.identities, second.identities, [first.identity, second.identity]),
  };
}

/** Collapse rows that point at the exact same stored show (source + id). */
function collapseDuplicateRows(items: StoredFavorite[]): StoredFavorite[] {
  const seen = new Map<string, number>();
  const unique: StoredFavorite[] = [];
  for (const item of items) {
    const key = favoriteKey(item.showId, item.source);
    const index = seen.get(key);
    if (index === undefined) {
      seen.set(key, unique.length);
      unique.push(item);
    } else {
      unique[index] = mergeDuplicateRows(unique[index], item);
    }
  }
  return unique;
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
    identity: titleIdentity(item.identity) || undefined,
    identities: Array.isArray(item.identities)
      ? unionIdentities(item.identities)
      : undefined,
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
  if (hasCurrent) {
    const items = readRaw(STORAGE_KEY);
    const unique = collapseDuplicateRows(items);
    // Repair the stored list without dispatching during a render snapshot.
    if (unique.length !== items.length) persist(unique);
    return unique;
  }
  // Migrate the pre-source list once. An existing empty v2 list is respected.
  const legacy = collapseDuplicateRows(readRaw(LEGACY_KEY));
  if (legacy.length > 0) {
    write(legacy);
    return legacy;
  }
  return [];
}

/** Write storage without notifying subscribers (safe inside getSnapshot). */
function persist(items: StoredFavorite[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
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
    collapseDuplicateRows(
      items
        .filter((item) => item && typeof item.showId === "number")
        .map((item) => normalize(item)),
    ),
  );
}

export function isFavorite(showId: number, source: FavoriteSource = "tvmaze"): boolean {
  return read().some((item) => item.showId === showId && item.source === source);
}

export function addFavorite(
  showId: number,
  source: FavoriteSource = "tvmaze",
  title?: string | Array<string | null | undefined> | null,
): void {
  let items = read();
  if (items.some((item) => item.showId === showId && item.source === source)) return;
  const identities = normalizeTitles(title);
  // One card per real show: if the same show is already starred from the other
  // source under a different title (localized vs original), migrate that entry
  // to this identity instead of adding a duplicate card.
  const duplicate = identities.length
    ? items.find((item) => {
        const stored = favoriteIdentities(item);
        return identities.some((identity) => stored.includes(identity));
      })
    : undefined;
  if (duplicate) {
    items = items.filter(
      (item) =>
        item === duplicate || !(item.showId === showId && item.source === source),
    );
    duplicate.showId = showId;
    duplicate.source = source;
    duplicate.identity = identities[0] || duplicate.identity;
    duplicate.identities = unionIdentities(duplicate.identities, identities, [duplicate.identity]);
    write(items);
    return;
  }
  items.push({
    showId,
    source,
    reminderEnabled: true,
    reminderLeadHours: getSettings().defaultLeadHours,
    addedAt: new Date().toISOString(),
    identity: identities[0] || undefined,
    identities: identities.length ? identities : undefined,
  });
  write(items);
}

/**
 * Repair legacy lists that already contain the same show from two sources.
 * Rows are merged when they share any identity (stored or resolved title).
 * Settings come from the earliest row so reminders stay stable; the canonical
 * row comes from TMDB when both sources are present.
 */
export function dedupeFavorites(
  resolveTitles: (item: StoredFavorite) => string | string[] | null | undefined,
): void {
  const items = read();
  const entries = items.map((item) => ({
    item,
    identities: favoriteIdentities(item, resolveTitles(item)),
  }));
  const groups = groupByIdentity(entries);
  const kept = groups.map((group) => {
    const ids = unionIdentities(...group.map((entry) => entry.identities));
    const sorted = group
      .map((entry) => entry.item)
      .sort((a, b) => a.addedAt.localeCompare(b.addedAt));
    const earliest = sorted[0];
    const canonical = sorted.find((item) => item.source === "tmdb") ?? earliest;
    return {
      ...canonical,
      reminderEnabled: earliest.reminderEnabled,
      reminderLeadHours: earliest.reminderLeadHours,
      addedAt: earliest.addedAt,
      identity: canonical.identity || earliest.identity || ids[0],
      identities: ids.length ? ids : undefined,
    };
  });
  if (JSON.stringify(kept) !== JSON.stringify(items)) write(kept);
}

export function removeFavorite(showId: number, source: FavoriteSource = "tvmaze"): void {
  write(read().filter((item) => !(item.showId === showId && item.source === source)));
}

export function toggleFavorite(
  showId: number,
  source: FavoriteSource,
  enabled: boolean,
  title?: string | Array<string | null | undefined> | null,
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
