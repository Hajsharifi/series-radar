import { useEffect, useRef } from "react";
import { useFavorites } from "../hooks/useFavorites";
import { useFavoriteEpisodes } from "../hooks/useFavoriteEpisodes";
import { addFavorite, favoriteKey, removeFavorite, titleIdentity } from "../lib/favorites";
import { cachedFetchJson } from "../lib/offline";
import { API_BASE } from "../lib/api";

const MIGRATED_KEY = "sr:favorites:tmdb-migration:v1";

interface TvSearchResponse {
  results?: Array<{
    id: number;
    title?: string | null;
    originalTitle?: string | null;
  }>;
}

/**
 * One-time migration: maps series starred from the old TVMaze-backed Radar to
 * their TMDB ids so every favorite has a single identity. A TVmaze favorite is
 * only removed after a confident title match is found; anything ambiguous is
 * left untouched rather than lost.
 */
export function FavoriteSourceMigration() {
  const favorites = useFavorites();
  const episodes = useFavoriteEpisodes();
  const running = useRef(false);

  useEffect(() => {
    if (running.current || episodes.loading) return;
    let migrated = false;
    try {
      migrated = localStorage.getItem(MIGRATED_KEY) === "1";
    } catch {
      /* storage unavailable */
    }
    const legacy = favorites.items.filter((item) => item.source === "tvmaze");
    if (migrated || legacy.length === 0) {
      if (!migrated) {
        try {
          localStorage.setItem(MIGRATED_KEY, "1");
        } catch {
          /* ignore */
        }
      }
      return;
    }

    running.current = true;
    void (async () => {
      let pending = false;
      for (const item of legacy) {
        const show = episodes.byKey.get(favoriteKey(item.showId, "tvmaze"));
        const name = show?.originalTitle || show?.title;
        if (!name) {
          pending = true; // title not loaded (e.g. offline) — retry next launch
          continue;
        }
        const wanted = titleIdentity(name);
        if (!wanted) continue;
        try {
          const data = await cachedFetchJson<TvSearchResponse>(
            `${API_BASE}/api/tv/search?q=${encodeURIComponent(name)}`,
            15000,
          );
          const results = data?.results ?? [];
          const match =
            results.find(
              (entry) =>
                titleIdentity(entry.originalTitle) === wanted ||
                titleIdentity(entry.title) === wanted,
            ) ?? (results.length === 1 ? results[0] : undefined);
          if (!match?.id) {
            pending = true; // no confident match — keep the original favorite
            continue;
          }
          addFavorite(match.id, "tmdb", name);
          removeFavorite(item.showId, "tvmaze");
        } catch {
          pending = true; /* keep the original favorite when the lookup fails */
        }
      }
      if (!pending) {
        try {
          localStorage.setItem(MIGRATED_KEY, "1");
        } catch {
          /* ignore */
        }
      }
      running.current = false;
    })();
  }, [favorites.items, episodes.byKey, episodes.loading]);

  return null;
}

export default FavoriteSourceMigration;
