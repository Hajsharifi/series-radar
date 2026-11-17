import { useEffect, useRef } from "react";
import { useFavorites } from "../hooks/useFavorites";
import { useFavoriteEpisodes } from "../hooks/useFavoriteEpisodes";
import { useScheduleContext } from "../hooks/ScheduleContext";
import { useMovieCatalog, useMovieFavorites } from "../hooks/useMovies";
import { useMovieTrack } from "../hooks/useMovieTrack";
import {
  leadHoursLabel,
  releaseMorningMs,
  reminderTimeForDayWithLead,
  reminderTimeMsWithLead,
  tehranClock,
} from "../lib/date";
import { applyQuietHours } from "../lib/quiet-hours";
import { getSettings } from "../lib/settings";
import { favoriteKey, nativeShowId } from "../lib/favorites";
import { showEventKind } from "../lib/show-event";
import { EVENT_LABEL } from "../lib/labels";
import {
  fetchMovieDetail,
  isMovieFinished,
  movieStage,
  tehranTodayISO,
} from "../lib/movies";
import { recordMovieRemoval } from "../lib/movie-removals";
import {
  isNativeApp,
  syncNativeReminders,
  syncMovieWatchlist,
  type NativeReminder,
  updateWidgetData,
} from "../lib/native";

function adjustForQuietHours(triggerAt: number | null, eventAt: number | null): number | null {
  if (triggerAt === null) return null;
  const adjusted = applyQuietHours(triggerAt, eventAt);
  return adjusted < 0 ? null : adjusted;
}

/**
 * Keeps Android alarms in sync with starred shows, starred movies (both
 * theatrical release and digital quality) and tracked quality films.
 */
export function NativeReminders() {
  const { shows } = useScheduleContext();
  const favorites = useFavorites();
  const favoriteEpisodes = useFavoriteEpisodes();
  const movieFavorites = useMovieFavorites();
  const movieTrack = useMovieTrack();
  const catalog = useMovieCatalog();
  const byId = catalog.byId;

  const pruned = useRef(new Set<number>());
  const detailChecked = useRef(new Map<number, number>());

  // Global lifecycle cleanup. A released film leaves favorites AND tracking on
  // every screen, and the reason is kept for the "recently released" history.
  useEffect(() => {
    for (const item of movieFavorites.items) {
      const movie = byId.get(item.movieId);
      if (movie && isMovieFinished(movie) && !pruned.current.has(item.movieId)) {
        pruned.current.add(item.movieId);
        recordMovieRemoval(movie.id, movie.title, movieStage(movie));
        movieFavorites.remove(item.movieId);
      }
    }
    for (const item of movieTrack.items) {
      const movie = byId.get(item.movieId);
      if (movie && isMovieFinished(movie) && !pruned.current.has(item.movieId)) {
        pruned.current.add(item.movieId);
        movieTrack.remove(item.movieId);
      }
    }
  }, [movieFavorites, movieTrack, byId]);

  // Favorites that vanished from both lists need a fresh detail lookup before
  // we can conclude their good quality has been released. Offline: never prune.
  useEffect(() => {
    const ids = new Set([
      ...movieFavorites.items.map((item) => item.movieId),
      ...movieTrack.items.map((item) => item.movieId),
    ]);
    const now = Date.now();
    for (const id of byId.keys()) detailChecked.current.delete(id);
    const missing = [...ids].filter(
      (id) => !byId.has(id) && now - (detailChecked.current.get(id) ?? 0) > 30 * 60 * 1000,
    );
    if (missing.length === 0) return;
    missing.forEach((id) => detailChecked.current.set(id, now));
    let cancelled = false;
    Promise.all(
      missing.map(async (id) => {
        try {
          return (await fetchMovieDetail(id, true)).movie;
        } catch {
          return null;
        }
      }),
    ).then((details) => {
      if (cancelled) return;
      for (const movie of details) {
        if (!movie || !isMovieFinished(movie)) continue;
        if (movieFavorites.items.some((item) => item.movieId === movie.id)) {
          recordMovieRemoval(movie.id, movie.title, movieStage(movie));
          movieFavorites.remove(movie.id);
        }
        if (movieTrack.items.some((item) => item.movieId === movie.id)) {
          movieTrack.remove(movie.id);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [movieFavorites, movieTrack, byId]);

  // Hands the watchlist to the native background checker. It fills the gap for
  // films with no digital date yet, which have no exact alarm to schedule.
  useEffect(() => {
    const items = movieFavorites.items
      .filter((item) => item.reminderEnabled !== false)
      .map((item) => {
        const movie = byId.get(item.movieId);
        return {
          id: item.movieId,
          title: movie?.title ?? `فیلم ${item.movieId}`,
          digitalDate: movie?.digitalDate ?? "",
          stage: movie ? movieStage(movie) : "unknown",
        };
      });
    syncMovieWatchlist(items);
  }, [movieFavorites.items, byId]);

  useEffect(() => {
    if (!isNativeApp()) return;
    const byShowKey = new Map(
      shows.map((show) => [favoriteKey(show.id, show.source ?? "tvmaze"), show]),
    );
    const now = Date.now();
    const defaultLead = getSettings().defaultLeadHours;
    const items: NativeReminder[] = [];

    // Closest future broadcast for each starred show: a season premiere or the
    // next episode of a season already on air.
    for (const favorite of favorites.items) {
      if (favorite.reminderEnabled === false) continue;
      const key = favoriteKey(favorite.showId, favorite.source);
      const candidates = [byShowKey.get(key), favoriteEpisodes.byKey.get(key)].filter(
        (show): show is NonNullable<typeof show> => Boolean(show?.airstamp),
      );
      const future = candidates
        .filter((show) => new Date(show.airstamp!).getTime() > now)
        .sort((a, b) => (a.airstamp ?? "").localeCompare(b.airstamp ?? ""));
      const show = future[0];
      if (!show?.airstamp) continue;
      const lead = favorite.reminderLeadHours || defaultLead;
      const triggerAt = adjustForQuietHours(
        reminderTimeMsWithLead(show.airstamp, lead),
        new Date(show.airstamp).getTime(),
      );
      if (triggerAt === null || triggerAt <= now) continue;
      const next = show.nextEpisode;
      const episode = next?.season && next?.number
        ? `فصل ${next.season} · قسمت ${next.number}`
        : null;
      items.push({
        id: nativeShowId(show.id, show.source ?? "tvmaze"),
        kind: "show",
        route: show.source === "tmdb" ? `/tv/${show.id}` : `/show/${show.id}`,
        title: `${EVENT_LABEL[showEventKind(show)]} «${show.title}»`,
        body: [episode, `${leadHoursLabel(lead)}، ساعت ${tehranClock(new Date(triggerAt).toISOString())} به وقت تهران.`]
          .filter(Boolean)
          .join(" · "),
        triggerAt,
      });
    }

    // Theatrical release of an upcoming favorite: 09:00 on release day.
    for (const favorite of movieFavorites.items) {
      if (favorite.reminderEnabled === false) continue;
      const movie = byId.get(favorite.movieId);
      if (!movie || movieStage(movie) !== "upcoming") continue;
      const day = movie.theatricalDate ?? movie.releaseDate;
      const triggerAt = adjustForQuietHours(
        reminderTimeForDayWithLead(day, 0),
        releaseMorningMs(day),
      );
      if (triggerAt === null || triggerAt <= now) continue;
      items.push({
        id: movie.id,
        kind: "movie_theatrical",
        route: `/movie/${movie.id}`,
        title: `اکران سینمایی «${movie.title}»`,
        body: "امروز روی پرده میرود؛ از حالا منتظر کیفیت خوبش هستیم.",
        triggerAt,
      });
    }

    // Digital quality release - one reminder per movie, favorites first.
    const remindedMovieIds = new Set<number>();
    for (const favorite of movieFavorites.items) {
      if (favorite.reminderEnabled === false) continue;
      const movie = byId.get(favorite.movieId);
      if (!movie) continue;
      const triggerAt = adjustForQuietHours(
        reminderTimeForDayWithLead(movie.digitalDate ?? null, defaultLead),
        reminderTimeForDayWithLead(movie.digitalDate ?? null, 0),
      );
      if (triggerAt === null || triggerAt <= now) continue;
      remindedMovieIds.add(movie.id);
      items.push({
        id: movie.id,
        kind: "movie",
        route: `/movie/${movie.id}`,
        title: `نسخهٔ دیجیتال «${movie.title}»`,
        body: `${leadHoursLabel(defaultLead)}، ساعت ${tehranClock(new Date(triggerAt).toISOString())} به وقت تهران.`,
        triggerAt,
      });
    }

    for (const tracked of movieTrack.items) {
      if (tracked.reminderEnabled === false || remindedMovieIds.has(tracked.movieId)) continue;
      const movie = byId.get(tracked.movieId);
      if (!movie) continue;
      const triggerAt = adjustForQuietHours(
        reminderTimeForDayWithLead(movie.digitalDate ?? null, defaultLead),
        reminderTimeForDayWithLead(movie.digitalDate ?? null, 0),
      );
      if (triggerAt === null || triggerAt <= now) continue;
      items.push({
        // Plain id: ReminderScheduler assigns the separate request-code range
        // from `kind`. (Older builds added the offset here as well.)
        id: tracked.movieId,
        kind: "movie_track",
        route: `/movie/${tracked.movieId}`,
        title: `نسخهٔ دیجیتال «${movie.title}»`,
        body: `${leadHoursLabel(defaultLead)}، ساعت ${tehranClock(new Date(triggerAt).toISOString())} به وقت تهران.`,
        triggerAt,
      });
    }

    syncNativeReminders(items);

    // Widget: the three closest future items, sorted by actual time/day.
    type WidgetItem = {
      id: number;
      title: string;
      subtitle: string;
      type: "series" | "movie";
      posterUrl?: string;
      at: number;
    };
    const widgetItems: WidgetItem[] = [];
    const widgetKeys = new Set<string>();

    for (const show of shows) {
      if (!show.airstamp) continue;
      const at = new Date(show.airstamp).getTime();
      if (!Number.isFinite(at) || at <= now) continue;
      const dayLabel = new Date(at).toLocaleDateString("fa-IR", {
        weekday: "short", day: "numeric", month: "short",
      });
      widgetKeys.add(favoriteKey(show.id, show.source ?? "tvmaze"));
      widgetItems.push({
        id: show.id,
        title: show.title,
        subtitle: `${dayLabel} • ${show.network ?? "—"}`,
        type: "series",
        posterUrl: show.posterPath ?? undefined,
        at,
      });
    }

    for (const show of favoriteEpisodes.items) {
      const key = favoriteKey(show.id, show.source ?? "tvmaze");
      if (widgetKeys.has(key) || !show.airstamp) continue;
      const at = new Date(show.airstamp).getTime();
      if (!Number.isFinite(at) || at <= now) continue;
      const dayLabel = new Date(at).toLocaleDateString("fa-IR", {
        weekday: "short", day: "numeric", month: "short",
      });
      widgetKeys.add(key);
      widgetItems.push({
        id: nativeShowId(show.id, show.source ?? "tvmaze"),
        title: show.title,
        subtitle: `${dayLabel} • ${EVENT_LABEL[showEventKind(show)]}`,
        type: "series",
        posterUrl: show.posterPath ?? undefined,
        at,
      });
    }

    const today = tehranTodayISO();
    for (const movie of catalog.all) {
      const stage = movieStage(movie);
      let day: string | null = null;
      let label = "";
      if (stage === "upcoming") {
        day = movie.theatricalDate ?? movie.releaseDate ?? null;
        label = "اکران سینمایی";
      } else if (stage === "quality" && movie.digitalDate && movie.digitalDate > today) {
        day = movie.digitalDate;
        label = "انتشار دیجیتال";
      }
      if (!day || day <= today) continue;
      const at = Date.parse(`${day}T00:00:00Z`);
      if (!Number.isFinite(at)) continue;
      const dayLabel = new Date(at).toLocaleDateString("fa-IR", {
        weekday: "short", day: "numeric", month: "short",
      });
      widgetItems.push({
        id: movie.id,
        title: movie.title,
        subtitle: `${dayLabel} • ${label}`,
        type: "movie",
        posterUrl: movie.posterPath ?? undefined,
        at,
      });
    }

    widgetItems.sort((a, b) => a.at - b.at);
    updateWidgetData(widgetItems.slice(0, 3).map(({ at, ...item }) => item));
  }, [
    shows,
    favorites.items,
    favoriteEpisodes.items,
    favoriteEpisodes.byKey,
    movieFavorites.items,
    movieTrack.items,
    byId,
    catalog.all,
  ]);

  return null;
}
