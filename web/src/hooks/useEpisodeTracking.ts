import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "sr:episode-tracking:v1";

export interface EpisodeTrackingState {
  [showId: number]: number[];  // episode ids
}

export function useEpisodeTracking() {
  const [state, setState] = useState<EpisodeTrackingState>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  const getWatched = useCallback((showId: number): number[] => {
    return state[showId] || [];
  }, [state]);

  const isWatched = useCallback((showId: number, episodeId: number): boolean => {
    return state[showId]?.includes(episodeId) || false;
  }, [state]);

  const toggleWatched = useCallback((showId: number, episodeId: number) => {
    setState(prev => {
      const watched = prev[showId] || [];
      const isWatchedEp = watched.includes(episodeId);
      const nextWatched = isWatchedEp
        ? watched.filter(id => id !== episodeId)
        : [...watched, episodeId];
      return { ...prev, [showId]: nextWatched };
    });
  }, []);

  const setWatched = useCallback((showId: number, episodeIds: number[]) => {
    setState(prev => ({ ...prev, [showId]: episodeIds }));
  }, []);

  const clearShow = useCallback((showId: number) => {
    setState(prev => {
      const next = { ...prev };
      delete next[showId];
      return next;
    });
  }, []);

  return { getWatched, isWatched, toggleWatched, setWatched, clearShow };
}