import { useEffect, useMemo } from "react";
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
import { fetchMovieDetail } from "../lib/movies";
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
  const online = useMovieList("online");
  const upcoming = useMovieList("upcoming");

  const moviesById = useMemo(() => {
    const map = new Map<number, Movie>();
    for (const movie of [...online.items, ...upcoming.items]) map.set(movie.id, movie);
    return map;
  }, [online.items, upcoming.items]);

  // Check tracked movies for digital/physical dates periodically
  useEffect(() => {
    if (!isNativeApp()) return;
    const timer = window.setInterval(async () => {
      for (const tracked of movieTrack.items) {
        if (tracked.reminderEnabled === false) continue;
        try {
          const detail = await fetchMovieDetail(tracked.movieId);
          const movie = detail.movie;
          const day = movie.onlineDate ?? movie.digitalDate ?? movie.physicalDate ?? null;
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
    const allMovies = [...online.items, ...upcoming.items];
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
