import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "sr:episode-tracking:v2";
const LEGACY_KEY = "sr:episode-tracking:v1";

/** TVMaze and TMDB show ids can collide, so watched episodes are namespaced. */
export type TrackSource = "tmdb" | "tvmaze";

export interface EpisodeTrackingState {
  [showKey: string]: number[]; // episode ids
}

function keyOf(source: TrackSource, showId: number): string {
  return `${source}:${showId}`;
}

function load(): EpisodeTrackingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as EpisodeTrackingState;
    }
    // One-time migration from the old, non-namespaced store.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as Record<string, number[]>;
      const migrated: EpisodeTrackingState = {};
      for (const [showId, episodes] of Object.entries(parsed || {})) {
        if (Array.isArray(episodes)) migrated[keyOf("tvmaze", Number(showId))] = episodes;
      }
      return migrated;
    }
  } catch {
    /* ignore malformed data */
  }
  return {};
}

export function useEpisodeTracking() {
  const [state, setState] = useState<EpisodeTrackingState>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage may be full */
    }
  }, [state]);

  const getWatched = useCallback(
    (source: TrackSource, showId: number): number[] => state[keyOf(source, showId)] || [],
    [state],
  );

  const isWatched = useCallback(
    (source: TrackSource, showId: number, episodeId: number): boolean =>
      (state[keyOf(source, showId)] || []).includes(episodeId),
    [state],
  );

  const toggleWatched = useCallback((source: TrackSource, showId: number, episodeId: number) => {
    const key = keyOf(source, showId);
    setState((prev) => {
      const watched = prev[key] || [];
      return {
        ...prev,
        [key]: watched.includes(episodeId) ? watched.filter((id) => id !== episodeId) : [...watched, episodeId],
      };
    });
  }, []);

  const setWatched = useCallback((source: TrackSource, showId: number, episodeIds: number[]) => {
    setState((prev) => ({ ...prev, [keyOf(source, showId)]: episodeIds }));
  }, []);

  const clearShow = useCallback((source: TrackSource, showId: number) => {
    setState((prev) => {
      const next = { ...prev };
      delete next[keyOf(source, showId)];
      return next;
    });
  }, []);

  return { state, getWatched, isWatched, toggleWatched, setWatched, clearShow };
}
