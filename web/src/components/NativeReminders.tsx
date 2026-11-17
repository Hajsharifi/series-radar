import { useEffect, useMemo, useRef } from "react";
import { useFavorites } from "../hooks/useFavorites";
import { useScheduleContext } from "../hooks/ScheduleContext";
import { useMovieFavorites, useMovieList } from "../hooks/useMovies";
import { useMovieTrack } from "../hooks/useMovieTrack";
import {
  leadHoursLabel,
  reminderTimeMsWithLead,
  reminderTimeForDayWithLead,
  tehranClock,
} from "../lib/date";
import { getSettings } from "../lib/settings";
import { fetchMovieDetail, isMovieFinished } from "../lib/movies";
import { isNativeApp, syncNativeReminders, type NativeReminder, updateWidgetData } from "../lib/native";
import type { Movie } from "../types";

/**
 * Keeps Android alarms in sync with starred shows, starred movies, and tracked cinema movies.
 * Only items with reminders enabled and a future release are scheduled.
 */
export function NativeReminders() {
  const { shows } = useScheduleContext();
  const favorites = useFavorites();
  const movieFavorites = useMovieFavorites();
  const movieTrack = useMovieTrack();
  const quality = useMovieList("quality");
  const upcoming = useMovieList("upcoming");

  const moviesById = useMemo(() => {
    const map = new Map<number, Movie>();
    for (const movie of [...quality.items, ...upcoming.items]) map.set(movie.id, movie);
    return map;
  }, [quality.items, upcoming.items]);

  const pruned = useRef(new Set<number>());
  const detailChecked = useRef(new Map<number, number>());

  // Global lifecycle cleanup: a movie whose good quality is out must leave
  // both favorites and quality tracking on every device, not just the favorites page.
  useEffect(() => {
    for (const item of movieFavorites.items) {
      const movie = moviesById.get(item.movieId);
      if (movie && isMovieFinished(movie) && !pruned.current.has(item.movieId)) {
        pruned.current.add(item.movieId);
        movieFavorites.remove(item.movieId);
      }
    }
    for (const item of movieTrack.items) {
      const movie = moviesById.get(item.movieId);
      if (movie && isMovieFinished(movie) && !pruned.current.has(item.movieId)) {
        pruned.current.add(item.movieId);
        movieTrack.remove(item.movieId);
      }
    }
  }, [movieFavorites, movieTrack, moviesById]);

  // Movies that dropped out of both lists need a fresh detail lookup before
  // we can decide that their quality has been released.
  useEffect(() => {
    const ids = new Set([
      ...movieFavorites.items.map((item) => item.movieId),
      ...movieTrack.items.map((item) => item.movieId),
    ]);
    const now = Date.now();
    for (const id of moviesById.keys()) detailChecked.current.delete(id);
    const missing = [...ids].filter(
      (id) => !moviesById.has(id) && now - (detailChecked.current.get(id) ?? 0) > 30 * 60 * 1000,
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
        if (movieFavorites.items.some((item) => item.movieId === movie.id)) movieFavorites.remove(movie.id);
        if (movieTrack.items.some((item) => item.movieId === movie.id)) movieTrack.remove(movie.id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [movieFavorites, movieTrack, moviesById]);

  // Check tracked movies for digital/physical dates periodically
  useEffect(() => {
    if (!isNativeApp()) return;
    const timer = window.setInterval(async () => {
      for (const tracked of movieTrack.items) {
        if (tracked.reminderEnabled === false) continue;
        try {
          const detail = await fetchMovieDetail(tracked.movieId);
          const movie = detail.movie;
          const day = movie.digitalDate ?? null;
          if (!day) continue;
          const triggerAt = reminderTimeForDayWithLead(day, getSettings().defaultLeadHours);
          if (triggerAt === null || triggerAt <= Date.now()) continue;
          // Sync will pick it up on next render
        } catch {
          /* ignore */
        }
      }
    }, 6 * 60 * 60 * 1000); // every 6 hours
    return () => window.clearInterval(timer);
  }, [movieTrack.items]);

  useEffect(() => {
    if (!isNativeApp()) return;
    const byId = new Map(shows.map((show) => [show.id, show]));
    const now = Date.now();

    const items: NativeReminder[] = [];

    const defaultLead = getSettings().defaultLeadHours;
    for (const favorite of favorites.items) {
      if (favorite.reminderEnabled === false) continue;
      const show = byId.get(favorite.showId);
      if (!show?.airstamp) continue;
      const lead = favorite.reminderLeadHours || defaultLead;
      const triggerAt = reminderTimeMsWithLead(show.airstamp, lead);
      if (triggerAt === null || triggerAt <= now) continue;
      items.push({
        id: show.id,
        kind: "show",
        route: `/show/${show.id}`,
        title: `پخش «${show.title}»`,
        body: `${leadHoursLabel(lead)}، ساعت ${tehranClock(new Date(triggerAt).toISOString())} به وقت تهران.`,
        triggerAt,
      });
    }

    // Digital releases only - one reminder per movie, no duplicate for favorites + tracked.
    const remindedMovieIds = new Set<number>();
    for (const favorite of movieFavorites.items) {
      if (favorite.reminderEnabled === false) continue;
      const movie = moviesById.get(favorite.movieId);
      if (!movie) continue;
      const day = movie.onlineDate ?? movie.digitalDate ?? null;
      const triggerAt = reminderTimeForDayWithLead(day, defaultLead);
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

    // Tracked cinema movies (waiting for quality) - skip if already reminded as favorite.
    for (const tracked of movieTrack.items) {
      if (tracked.reminderEnabled === false || remindedMovieIds.has(tracked.movieId)) continue;
      const movie = moviesById.get(tracked.movieId);
      if (!movie) continue;
      const day = movie.onlineDate ?? movie.digitalDate ?? null;
      const triggerAt = reminderTimeForDayWithLead(day, defaultLead);
      if (triggerAt === null || triggerAt <= now) continue;
      items.push({
        id: tracked.movieId + 3_000_000, // separate range
        kind: "movie_track",
        route: `/movie/${tracked.movieId}`,
        title: `نسخهٔ دیجیتال «${movie.title}»`,
        body: `${leadHoursLabel(defaultLead)}، ساعت ${tehranClock(new Date(triggerAt).toISOString())} به وقت تهران.`,
        triggerAt,
      });
    }

    syncNativeReminders(items);

    // Prepare widget data: next 3 upcoming items (series + movies)
    const widgetItems: Array<{
      id: number;
      title: string;
      subtitle: string;
      type: "series" | "movie";
      posterUrl?: string;
    }> = [];

    // Add upcoming series (by airstamp)
    const upcomingShows = shows
      .filter((s) => s.airstamp && new Date(s.airstamp).getTime() > now)
      .sort((a, b) => (a.airstamp ?? "").localeCompare(b.airstamp ?? ""))
      .slice(0, 3);

    for (const show of upcomingShows) {
      const dayLabel = show.airstamp ? new Date(show.airstamp).toLocaleDateString("fa-IR", {
        weekday: "short", day: "numeric", month: "short"
      }) : "—";
      widgetItems.push({
        id: show.id,
        title: show.title,
        subtitle: `${dayLabel} • ${show.network ?? "—"}`,
        type: "series",
        posterUrl: show.posterPath ?? undefined,
      });
    }

    // Add upcoming movies (by theatrical/digital date)
    const allMovies = [...quality.items, ...upcoming.items];
    const upcomingMovies = allMovies
      .filter((m) => {
        const date = m.theatricalDate ?? m.releaseDate ?? m.digitalDate ?? m.physicalDate;
        return date && date >= new Date().toISOString().slice(0, 10);
      })
      .sort((a, b) => {
        const ad = a.theatricalDate ?? a.releaseDate ?? a.digitalDate ?? a.physicalDate ?? "9999";
        const bd = b.theatricalDate ?? b.releaseDate ?? b.digitalDate ?? b.physicalDate ?? "9999";
        return ad.localeCompare(bd);
      })
      .slice(0, 3);

    for (const movie of upcomingMovies) {
      const date = movie.theatricalDate ?? movie.releaseDate ?? movie.digitalDate ?? movie.physicalDate;
      const dayLabel = date ? new Date(date + "T12:00:00Z").toLocaleDateString("fa-IR", {
        weekday: "short", day: "numeric", month: "short"
      }) : "—";
      widgetItems.push({
        id: movie.id,
        title: movie.title,
        subtitle: `${dayLabel} • سینما/خانه`,
        type: "movie",
        posterUrl: movie.posterPath ?? undefined,
      });
    }

    // Sort combined by date and take top 3
    widgetItems.sort((a, b) => a.subtitle.localeCompare(b.subtitle));
    updateWidgetData(widgetItems.slice(0, 3));
  }, [shows, favorites.items, movieFavorites.items, movieTrack.items, moviesById]);

  return null;
}
