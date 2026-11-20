import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Show } from "../types";
import {
  cachedSnapshot,
  refreshFull,
  refreshNearby,
  seedSnapshot,
  shouldRefreshFull,
  type CategoryFilter,
  type ScheduleSnapshot,
} from "../lib/tvmaze";
import { favoriteIds, favoriteKeys, subscribeFavorites } from "../lib/favorites";

const MINUTE_MS = 60_000;
const FULL_HOUR_MS = 6 * 60 * 60 * 1000;

export interface ScheduleState {
  shows: Show[];
  source: ScheduleSnapshot["source"];
  updatedAt: string | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => void;
}

export function useSchedule(): ScheduleState {
  const [snapshot, setSnapshot] = useState<ScheduleSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const pendingManual = useRef(false);
  const lastFull = useRef(0);

  const apply = useCallback((next: ScheduleSnapshot) => {
    setSnapshot(next);
    setError(null);
  }, []);

  const loadFull = useCallback(
    async (manual: boolean) => {
      if (inFlight.current) {
        if (manual) pendingManual.current = true;
        return;
      }
      inFlight.current = true;
      if (manual) setRefreshing(true);
      try {
        const next = await refreshFull();
        lastFull.current = Date.now();
        apply(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "دریافت داده ناموفق بود");
      } finally {
        inFlight.current = false;
        setRefreshing(false);
        setLoading(false);
        if (pendingManual.current) {
          pendingManual.current = false;
          void loadFull(true);
        }
      }
    },
    [apply],
  );

  const loadNearby = useCallback(async () => {
    try {
      const next = await refreshNearby();
      if (next) apply(next);
    } catch {
      /* a failed one-minute check must never break the screen */
    }
  }, [apply]);

  useEffect(() => {
    const cached = cachedSnapshot();
    if (cached) {
      apply(cached);
      setLoading(false);
      if (cached.updatedAt) {
        const cachedTime = new Date(cached.updatedAt).getTime();
        if (!Number.isNaN(cachedTime)) lastFull.current = cachedTime;
      }
    } else {
      apply(seedSnapshot());
    }

    if (shouldRefreshFull(cached)) {
      void loadFull(false);
    } else {
      setLoading(false);
      void loadNearby();
    }

    const ticker = window.setInterval(() => {
      const stamp = Date.now();
      if (stamp - lastFull.current > FULL_HOUR_MS) void loadNearby();
    }, MINUTE_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void loadNearby();
    };
    const onOnline = () => void loadFull(false);

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      window.clearInterval(ticker);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [apply, loadFull, loadNearby]);

  const refresh = useCallback(() => {
    void loadFull(true);
  }, [loadFull]);

  return {
    shows: snapshot?.items ?? [],
    source: snapshot?.source ?? "seed",
    updatedAt: snapshot?.updatedAt ?? null,
    loading,
    refreshing,
    error,
    refresh,
  };
}

export interface ShowFilters {
  search: string;
  category: CategoryFilter;
  onlyPopular: boolean;
}

export function filterShows(shows: Show[], filters: ShowFilters, now = Date.now()): Show[] {
  const query = filters.search.trim().toLowerCase();
  return shows
    .filter((show) => {
      if (!show.airstamp) return false;
      if (new Date(show.airstamp).getTime() < now - 6 * 3600_000) return false;
      if (filters.category !== "all" && show.category !== filters.category) return false;
      if (filters.onlyPopular && (show.weight ?? 0) < 90) return false;
      if (!query) return true;
      return (
        show.title.toLowerCase().includes(query) ||
        (show.network ?? "").toLowerCase().includes(query) ||
        (show.genres ?? []).some((genre) => genre.toLowerCase().includes(query))
      );
    })
    .sort((a, b) => {
      const aStamp = new Date(a.airstamp!).getTime();
      const bStamp = new Date(b.airstamp!).getTime();
      if (aStamp !== bStamp) return aStamp - bStamp;
      return (b.weight ?? 0) - (a.weight ?? 0);
    });
}

export function groupShows(shows: Show[], now = Date.now()): Array<{ key: string; title: string; shows: Show[] }> {
  const week = 7 * 86_400_000;
  const month = 30 * 86_400_000;
  const buckets: Record<string, Show[]> = { week: [], month: [], later: [] };
  shows.forEach((show) => {
    if (!show.airstamp) return;
    const diff = new Date(show.airstamp).getTime() - now;
    if (diff <= week) buckets.week.push(show);
    else if (diff <= month) buckets.month.push(show);
    else buckets.later.push(show);
  });
  return [
    { key: "week", title: "این هفته", shows: buckets.week },
    { key: "month", title: "این ماه", shows: buckets.month },
    { key: "later", title: "بعداً", shows: buckets.later },
  ].filter((group) => group.shows.length > 0);
}

export function useNowTicker(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function useFavoriteIds(): Set<number> {
  const [ids, setIds] = useState<Set<number>>(() => favoriteIds());
  useEffect(() => {
    const sync = () => setIds(favoriteIds());
    sync();
    return subscribeFavorites(sync);
  }, []);
  return ids;
}

/** Source-aware favorite keys ("tvmaze:82", "tmdb:94997"). */
export function useFavoriteKeys(): Set<string> {
  const [keys, setKeys] = useState<Set<string>>(() => favoriteKeys());
  useEffect(() => {
    const sync = () => setKeys(favoriteKeys());
    sync();
    return subscribeFavorites(sync);
  }, []);
  return keys;
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useMemoizedShowMap(shows: Show[]): Map<number, Show> {
  return useMemo(() => new Map(shows.map((show) => [show.id, show])), [shows]);
}