import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Movie, MovieTab } from "../types";
import {
  cachedMovies,
  fetchMovies,
  movieStage,
  seedMovies,
  tehranTodayISO,
  type MovieListResult,
} from "../lib/movies";
import {
  addMovieFavorite,
  getMovieFavorites,
  isMovieFavorite,
  removeMovieFavorite,
  setMovieReminderEnabled,
  subscribeMovieFavorites,
  toggleMovieFavorite,
} from "../lib/movie-favorites";
import { requestNotificationPermission } from "../lib/native";

const REFRESH_MS = 20 * 60 * 1000;

/** Second line of defence against stale cache: a released film must never
 * linger in the upcoming tab, and a finished film must never show in quality. */
function filterByStage(items: Movie[], tab: MovieTab): Movie[] {
  const today = tehranTodayISO();
  return items.filter((movie) =>
    tab === "upcoming"
      ? movieStage(movie, today) === "upcoming"
      : movieStage(movie, today) === "quality",
  );
}

export interface MovieListState {
  items: Movie[];
  source: MovieListResult["source"];
  updatedAt: string | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => void;
}

/** Loads one movies tab: cached snapshot first, then the API. */
export function useMovieList(tab: MovieTab): MovieListState {
  const [state, setState] = useState<MovieListResult>(() => {
    const base = cachedMovies(tab) ?? seedMovies(tab);
    return { ...base, items: filterByStage(base.items, tab) };
  });
  const [loading, setLoading] = useState(state.source !== "network");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const tabRef = useRef(tab);
  const lastLoad = useRef(0);

  const load = useCallback(
    async (force: boolean) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (force) setRefreshing(true);
      try {
        const result = await fetchMovies(tabRef.current, force);
        setState({ ...result, items: filterByStage(result.items, tabRef.current) });
        setError(null);
      } catch (err) {
        const fallback = cachedMovies(tabRef.current) ?? seedMovies(tabRef.current);
        setState((prev) =>
          prev.items.length > 0 ? prev : { ...fallback, items: filterByStage(fallback.items, tabRef.current) },
        );
        setError(err instanceof Error ? err.message : "خطا در دریافت فیلم‌ها");
      } finally {
        lastLoad.current = Date.now();
        inFlight.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    tabRef.current = tab;
    const cached = cachedMovies(tab);
    const base = cached ?? seedMovies(tab);
    setState({ ...base, items: filterByStage(base.items, tab) });
    setLoading(cached === null);
    setError(null);
    void load(false);
  }, [tab, load]);

  useEffect(() => {
    const timer = window.setInterval(() => void load(false), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  // A WebView may be suspended for hours. Refresh once when it becomes visible
  // again so a movie that crossed a stage boundary is re-bucketed immediately.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastLoad.current < 5 * 60 * 1000) return;
      void load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const refresh = useCallback(() => {
    void load(true);
  }, [load]);

  return {
    items: state.items,
    source: state.source,
    updatedAt: state.updatedAt,
    loading,
    refreshing,
    error,
    refresh,
  };
}

export function useMovieFavorites() {
  const [items, setItems] = useState(() => getMovieFavorites());

  useEffect(() => {
    const sync = () => setItems(getMovieFavorites());
    sync();
    return subscribeMovieFavorites(sync);
  }, []);

  const ids = new Set(items.map((item) => item.movieId));

  const toggle = useCallback((movieId: number) => {
    const enabled = !isMovieFavorite(movieId);
    toggleMovieFavorite(movieId, enabled);
    if (enabled) requestNotificationPermission();
    setItems(getMovieFavorites());
    return enabled;
  }, []);

  const add = useCallback((movieId: number) => {
    addMovieFavorite(movieId);
    requestNotificationPermission();
    setItems(getMovieFavorites());
  }, []);

  const remove = useCallback((movieId: number) => {
    removeMovieFavorite(movieId);
    setItems(getMovieFavorites());
  }, []);

  const setReminder = useCallback((movieId: number, enabled: boolean) => {
    setMovieReminderEnabled(movieId, enabled);
    setItems(getMovieFavorites());
  }, []);

  return {
    items,
    ids,
    toggle,
    add,
    remove,
    setReminder,
    isFavorite: (id: number) => ids.has(id),
  };
}

export interface MovieCatalog {
  quality: MovieListState;
  upcoming: MovieListState;
  byId: Map<number, Movie>;
  all: Movie[];
  /** Re-bucketed from both cached lists, so a film crossing a stage boundary
   * appears in its new tab immediately - no 20-30 minute gap. */
  qualityItems: Movie[];
  upcomingItems: Movie[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => void;
}

/** One place that owns both movie lists. Every screen uses this so the two
 * tabs always agree on a movie's current stage. */
export function useMovieCatalog(): MovieCatalog {
  const quality = useMovieList("quality");
  const upcoming = useMovieList("upcoming");

  const byId = useMemo(() => {
    const map = new Map<number, Movie>();
    for (const movie of [...quality.items, ...upcoming.items]) map.set(movie.id, movie);
    return map;
  }, [quality.items, upcoming.items]);

  const all = useMemo(() => [...byId.values()], [byId]);
  const qualityItems = useMemo(() => all.filter((movie) => movieStage(movie) === "quality"), [all]);
  const upcomingItems = useMemo(() => all.filter((movie) => movieStage(movie) === "upcoming"), [all]);

  const refresh = useCallback(() => {
    quality.refresh();
    upcoming.refresh();
  }, [quality.refresh, upcoming.refresh]);

  return {
    quality,
    upcoming,
    byId,
    all,
    qualityItems,
    upcomingItems,
    loading: quality.loading && upcoming.loading,
    refreshing: quality.refreshing || upcoming.refreshing,
    error: quality.error ?? upcoming.error,
    refresh,
  };
}
