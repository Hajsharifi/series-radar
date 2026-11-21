import { useEffect, useMemo, useState } from "react";
import { useFavorites } from "../hooks/useFavorites";
import { useFavoriteEpisodes } from "../hooks/useFavoriteEpisodes";
import { useScheduleContext } from "../hooks/ScheduleContext";
import { useMovieCatalog, useMovieFavorites } from "../hooks/useMovies";
import { dedupeFavorites, favoriteKey, favoriteIdentities, groupByIdentity, titleIdentity } from "../lib/favorites";
import { movieDownloadKey, seriesDownloadKey } from "../lib/downloads";
import { getMovieRemovals, subscribeMovieRemovals } from "../lib/movie-removals";
import { getSettings } from "../lib/settings";
import { syncDownloadWatchlist } from "../lib/native";

/**
 * Keeps the hourly native checker in sync with the starred titles. Finished
 * movies are kept until the source publishes a download link (or the 90-day
 * removal history expires), which closes the gap left by favorite pruning.
 */
export function DownloadsWatchlist() {
  const favorites = useFavorites();
  const movieFavorites = useMovieFavorites();
  const schedule = useScheduleContext();
  const episodes = useFavoriteEpisodes();
  const catalog = useMovieCatalog();
  const [removals, setRemovals] = useState(() => getMovieRemovals());
  const [settingsVersion, setSettingsVersion] = useState(0);

  useEffect(() => {
    const sync = () => setRemovals(getMovieRemovals());
    sync();
    return subscribeMovieRemovals(sync);
  }, []);

  // Repair lists that already contain the same show from both TVMaze and TMDB.
  // Resolves titles from the live data we already have here, without extra calls.
  useEffect(() => {
    if (schedule.shows.length === 0 && episodes.byKey.size === 0 && catalog.byId.size === 0) return;
    dedupeFavorites((item) => {
      const key = favoriteKey(item.showId, item.source);
      const show = schedule.shows.find((s) => favoriteKey(s.id, s.source ?? "tmdb") === key)
        ?? episodes.byKey.get(key);
      if (show) {
        // A localized detail title and the original list title are two names
        // for the same show; resolving both lets storage merge the two rows.
        return [show.title, show.originalTitle ?? ""];
      }
      return null;
    });
  }, [favorites.items, schedule.shows, episodes.byKey, catalog.byId]);

  useEffect(() => {
    const sync = () => setSettingsVersion((value) => value + 1);
    document.addEventListener("sr-settings-changed", sync);
    return () => document.removeEventListener("sr-settings-changed", sync);
  }, []);

  const quiet = useMemo(() => {
    const settings = getSettings();
    return {
      enabled: settings.quietHoursEnabled,
      start: settings.quietStart,
      end: settings.quietEnd,
    };
  }, [settingsVersion]);

  const items = useMemo(() => {
    type WatchEntry = {
      key: string;
      title: string;
      kind: "movie" | "series";
      source?: "tmdb" | "tvmaze";
      archived?: boolean;
    };
    const byKey = new Map<string, WatchEntry>();

    const seriesRows = favorites.items.map((favorite) => {
      const source = favorite.source === "tmdb" ? "tmdb" : "tmdb";
      const key = seriesDownloadKey(favorite.showId, source);
      const keyString = favoriteKey(favorite.showId, favorite.source);
      const show = schedule.shows.find((item) => favoriteKey(item.id, item.source ?? "tmdb") === keyString)
        ?? episodes.byKey.get(keyString);
      const entry: WatchEntry = {
        key,
        title: show?.title ?? `سریال ${favorite.showId}`,
        kind: "series",
        source,
      };
      return {
        favorite,
        entry,
        identities: favoriteIdentities(favorite, show?.title, show?.originalTitle),
      };
    });
    for (const group of groupByIdentity(seriesRows)) {
      const canonical = group.find((row) => row.favorite.source === "tmdb") ?? group[0];
      byKey.set(canonical.entry.key, canonical.entry);
    }

    const seenMovies = new Set<string>();
    for (const favorite of movieFavorites.items) {
      const movie = catalog.byId.get(favorite.movieId);
      const identity = movie ? titleIdentity(movie.title) : "";
      const cardKey = identity || `id:${favorite.movieId}`;
      if (seenMovies.has(cardKey)) continue;
      seenMovies.add(cardKey);
      const key = movieDownloadKey(favorite.movieId);
      byKey.set(key, {
        key,
        title: movie?.title ?? `فیلم ${favorite.movieId}`,
        kind: "movie",
      });
    }

    for (const removal of removals) {
      if (removal.reason !== "available") continue;
      const identity = titleIdentity(removal.title);
      const cardKey = identity || `id:${removal.movieId}`;
      if (seenMovies.has(cardKey)) continue;
      seenMovies.add(cardKey);
      const key = movieDownloadKey(removal.movieId);
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          title: removal.title,
          kind: "movie",
          archived: true,
        });
      }
    }

    return Array.from(byKey.values()).slice(0, 40);
  }, [favorites.items, movieFavorites.items, schedule.shows, episodes.byKey, catalog.byId, removals]);

  useEffect(() => {
    syncDownloadWatchlist(items, quiet);
  }, [items, quiet]);

  return null;
}
