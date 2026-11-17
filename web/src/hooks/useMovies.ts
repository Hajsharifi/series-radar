import { useCallback, useEffect, useRef, useState } from "react";
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
