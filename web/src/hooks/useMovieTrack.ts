import { useCallback, useEffect, useState } from "react";
import {
  addTrackedMovie,
  getTrackedMovies,
  isTracked,
  removeTrackedMovie,
  setTrackedReminderEnabled,
  subscribeTrackedMovies,
  toggleTrackedMovie,
} from "../lib/movie-track";
import { requestNotificationPermission } from "../lib/native";

export function useMovieTrack() {
  const [items, setItems] = useState(() => getTrackedMovies());

  useEffect(() => {
    const sync = () => setItems(getTrackedMovies());
    sync();
    return subscribeTrackedMovies(sync);
  }, []);

  const ids = new Set(items.map((item) => item.movieId));

  const toggle = useCallback((movieId: number) => {
    const enabled = !isTracked(movieId);
    toggleTrackedMovie(movieId, enabled);
    if (enabled) requestNotificationPermission();
    setItems(getTrackedMovies());
    return enabled;
  }, []);

  const add = useCallback((movieId: number) => {
    addTrackedMovie(movieId);
    requestNotificationPermission();
    setItems(getTrackedMovies());
  }, []);

  const remove = useCallback((movieId: number) => {
    removeTrackedMovie(movieId);
    setItems(getTrackedMovies());
  }, []);

  const setReminder = useCallback((movieId: number, enabled: boolean) => {
    setTrackedReminderEnabled(movieId, enabled);
    setItems(getTrackedMovies());
  }, []);

  return {
    items,
    ids,
    toggle,
    add,
    remove,
    setReminder,
    isTracked: (id: number) => ids.has(id),
  };
}