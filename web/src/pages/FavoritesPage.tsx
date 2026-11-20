import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useFavorites } from "../hooks/useFavorites";
import { useMovieCatalog, useMovieFavorites } from "../hooks/useMovies";
import { useScheduleContext } from "../hooks/ScheduleContext";
import { useNowTicker } from "../hooks/useSchedule";
import { useFavoriteEpisodes } from "../hooks/useFavoriteEpisodes";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { toPersianDigits } from "../lib/date";
import { readUiState, writeUiState } from "../lib/ui-state";
import {
  fetchMovieDetail,
  isMovieFinished,
  moviePrimaryDate,
  movieStage,
} from "../lib/movies";
import {
  dismissMovieRemovals,
  getPendingMovieRemovals,
  recordMovieRemoval,
  subscribeMovieRemovals,
  type MovieRemoval,
} from "../lib/movie-removals";
import type { Movie, Show } from "../types";
import { favoriteKey, titleIdentity } from "../lib/favorites";
import { ShowRow } from "../components/ShowCard";
import { MovieRow } from "../components/MovieCard";
import { MovieHistoryPageLink } from "../components/MovieHistoryLink";
import { EmptyState } from "../components/StateViews";
import { Download, Star } from "lucide-react";

type Tab = "series" | "movies";

export function FavoritesPage() {
  const schedule = useScheduleContext();
  const favorites = useFavorites();
  const favoriteEpisodes = useFavoriteEpisodes();
  const movieFavorites = useMovieFavorites();
  const catalog = useMovieCatalog();
  useNowTicker(30_000);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>(() => readUiState("favorites.tab", "series"));
  const [detailMap, setDetailMap] = useState<Record<number, Movie>>({});
  const [removals, setRemovals] = useState<MovieRemoval[]>(() => getPendingMovieRemovals());
  // Last time we asked the server about a favorite that was absent from both
  // lists. Recheck after 30 minutes so a later digital release is still seen.
  const checked = useRef(new Map<number, number>());

  usePullToRefresh(() => schedule.refresh(), { threshold: 80 });

  useEffect(() => writeUiState("favorites.tab", tab), [tab]);

  useEffect(() => {
    const sync = () => setRemovals(getPendingMovieRemovals());
    sync();
    return subscribeMovieRemovals(sync);
  }, []);

  const shows = useMemo(() => {
    const scheduled = new Map(
      schedule.shows.map((show) => [favoriteKey(show.id, show.source ?? "tvmaze"), show]),
    );
    const now = Date.now();
    const merged: Show[] = [];
    for (const item of favorites.items) {
      const key = favoriteKey(item.showId, item.source);
      const scheduledShow = scheduled.get(key);
      const nextShow = favoriteEpisodes.byKey.get(key);
      const candidates = [scheduledShow, nextShow].filter((show): show is Show => Boolean(show));
      if (candidates.length === 0) continue;
      // A mid-season episode may be closer than the next season premiere.
      const future = candidates.filter(
        (show) => show.airstamp && new Date(show.airstamp).getTime() >= now - 6 * 3_600_000,
      );
      const chosen = future.sort((a, b) =>
        (a.airstamp ?? "9999").localeCompare(b.airstamp ?? "9999"),
      )[0];
      if (chosen) merged.push(chosen);
    }
    // One card per real show even if the stored list still holds both sources.
    const unique = new Map<string, Show>();
    for (const show of merged) {
      const id = titleIdentity(show.title) || favoriteKey(show.id, show.source ?? "tvmaze");
      if (!unique.has(id)) unique.set(id, show);
    }
    return Array.from(unique.values())
      .filter((show) => show.title.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => {
        const aStamp = a.airstamp ? new Date(a.airstamp).getTime() : Number.MAX_SAFE_INTEGER;
        const bStamp = b.airstamp ? new Date(b.airstamp).getTime() : Number.MAX_SAFE_INTEGER;
        return aStamp - bStamp;
      });
  }, [schedule.shows, favorites.items, favoriteEpisodes.byKey, query]);

  const availableKeys = useMemo(() => {
    const now = Date.now() - 6 * 3_600_000;
    const keys = new Set(
      schedule.shows
        .filter((show) => show.airstamp && new Date(show.airstamp).getTime() >= now)
        .map((show) => favoriteKey(show.id, show.source ?? "tvmaze")),
    );
    favoriteEpisodes.items.forEach((show) => {
      if (show.airstamp && new Date(show.airstamp).getTime() >= now) {
        keys.add(show.favoriteKey);
      }
    });
    return keys;
  }, [schedule.shows, favoriteEpisodes.items]);

  const moviesById = catalog.byId;

  // A favorite whose movie data is loaded and already finished must go.
  useEffect(() => {
    for (const item of movieFavorites.items) {
      const movie = moviesById.get(item.movieId);
      if (movie && isMovieFinished(movie)) {
        movieFavorites.remove(item.movieId);
        recordMovieRemoval(movie.id, movie.title, movieStage(movie));
      }
    }
  }, [movieFavorites, moviesById]);

  // Favorites that dropped out of the lists (quality released, then archived)
  // need a fresh detail lookup before we can safely remove them.
  useEffect(() => {
    const now = Date.now();
    for (const id of moviesById.keys()) checked.current.delete(id);
    const missing = movieFavorites.items
      .map((item) => item.movieId)
      .filter(
        (id) =>
          !moviesById.has(id) && now - (checked.current.get(id) ?? 0) > 30 * 60 * 1000,
      );
    if (missing.length === 0) return;
    missing.forEach((id) => checked.current.set(id, now));
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
      setDetailMap((prev) => {
        const next = { ...prev };
        for (const movie of details) if (movie) next[movie.id] = movie;
        return next;
      });
      for (const movie of details) {
        if (!movie || !isMovieFinished(movie)) continue;
        if (movieFavorites.items.some((item) => item.movieId === movie.id)) {
          movieFavorites.remove(movie.id);
          recordMovieRemoval(movie.id, movie.title, movieStage(movie));
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [movieFavorites, moviesById]);

  const movies = useMemo(() => {
    const map = new Map(moviesById);
    for (const [key, movie] of Object.entries(detailMap)) map.set(Number(key), movie);
    return movieFavorites.items
      .map((item) => map.get(item.movieId))
      .filter((movie): movie is Movie => Boolean(movie))
      .filter((movie) => !isMovieFinished(movie))
      .filter((movie) => movie.title.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => {
        const aStage = movieStage(a);
        const bStage = movieStage(b);
        if (aStage !== bStage) return aStage === "upcoming" ? -1 : 1;
        const aDate = moviePrimaryDate(a, aStage === "upcoming" ? "upcoming" : "quality") ?? "9999";
        const bDate = moviePrimaryDate(b, bStage === "upcoming" ? "upcoming" : "quality") ?? "9999";
        return aDate.localeCompare(bDate);
      });
  }, [movieFavorites.items, moviesById, detailMap, query]);

  const upcomingMovies = movies.filter((movie) => movieStage(movie) === "upcoming");
  const qualityMovies = movies.filter((movie) => movieStage(movie) !== "upcoming");

  const missingShows = favorites.items.filter(
    (item) => !availableKeys.has(favoriteKey(item.showId, item.source)),
  ).length;
  const missingMovies = movieFavorites.items.length - movies.length;
  const total = favorites.items.length + movieFavorites.items.length;

  function renderMovieRow(movie: Movie) {
    const stage = movieStage(movie);
    return (
      <MovieRow
        key={movie.id}
        movie={movie}
        tab={stage === "upcoming" ? "upcoming" : "quality"}
        stage={stage}
        favorite={movieFavorites.ids.has(movie.id)}
        onToggleFavorite={() => movieFavorites.toggle(movie.id)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-white">ستاره‌های من</h1>
          <p className="mt-1 text-xs text-muted">
            {toPersianDigits(total)} مورد · {toPersianDigits(favorites.items.length)} سریال،{" "}
            {toPersianDigits(movieFavorites.items.length)} فیلم · ذخیره‌شده روی همین گوشی
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <MovieHistoryPageLink />
          <Link to="/movies" className="rounded-lg bg-sky-400 px-3.5 py-2 text-xs font-semibold text-sky-950">
            افزودن فیلم
          </Link>
          <Link to="/" className="rounded-lg bg-amber-400 px-3.5 py-2 text-xs font-semibold text-ink-950">
            افزودن سریال
          </Link>
        </div>
      </header>

      <Link
        to="/downloads"
        className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-emerald-400/18 bg-emerald-500/8 px-4 py-3 transition hover:border-emerald-400/35"
      >
        <span className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-control bg-emerald-400/15 text-emerald-300">
            <Download className="h-4 w-4" strokeWidth={1.9} />
          </span>
          <span>
            <span className="block text-body font-bold text-white">لینکهای دانلود</span>
            <span className="mt-0.5 block text-micro text-emerald-200/75">
              لینکهای جدید سریالها و فیلمهای ستارهشده، حتی بعد از آرشیو شدن
            </span>
          </span>
        </span>
        <span className="text-caption text-emerald-200">دیدن لینکها ←</span>
      </Link>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("series")}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${
            tab === "series" ? "bg-amber-400 text-ink-950" : "border border-white/10 bg-white/5 text-ink-300"
          }`}
        >
          سریال‌ها ({toPersianDigits(favorites.items.length)})
        </button>
        <button
          type="button"
          onClick={() => setTab("movies")}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${
            tab === "movies" ? "bg-sky-400 text-sky-950" : "border border-white/10 bg-white/5 text-ink-300"
          }`}
        >
          فیلم‌ها ({toPersianDigits(movieFavorites.items.length)})
        </button>
      </div>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="جست‌وجو در ستاره‌ها" aria-label="جست‌وجو در ستاره‌ها"
        className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-white placeholder:text-muted focus:border-amber-400/60 focus:outline-none"
        dir="auto"
      />

      {removals.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/8 px-3 py-2 text-caption text-emerald-200">
          <div className="space-y-0.5">
            {removals.some((item) => item.reason === "available") && (
              <p>
                {toPersianDigits(removals.filter((item) => item.reason === "available").length)} فیلم حذف شدند چون کیفیت خوبشان منتشر شده بود.
              </p>
            )}
            {removals.some((item) => item.reason === "expired") && (
              <p>
                {toPersianDigits(removals.filter((item) => item.reason === "expired").length)} فیلم حذف شدند چون بیش از ۹۰ روز از اکرانشان گذشت و تاریخ دیجیتالی اعلام نشد.
              </p>
            )}
            <p className="text-micro text-emerald-200/70">با بستن این پیام، تاریخچه پاک نمیشود.</p>
          </div>
          <div className="flex gap-2">
            <MovieHistoryPageLink />
            <button
              type="button"
              onClick={dismissMovieRemovals}
              aria-label="بستن پیام (تاریخچه حفظ میشود)"
              className="rounded-md px-1.5 text-emerald-200/80 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {tab === "series" ? (
        favorites.items.length === 0 ? (
          <EmptySeries />
        ) : shows.length === 0 ? (
          <div className="rounded-card border border-edge/10 bg-panel/70 px-4 py-10 text-center">
            <p className="text-sm text-white">
              {missingShows > 0 ? "قسمت بعدی این سریال‌ها هنوز اعلام نشده" : "نتیجهای پیدا نشد"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {missingShows > 0
                ? "منبع داده هنوز تاریخ قسمت بعدی را ندارد."
                : "عبارت دیگری را امتحان کنید."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {shows.map((show) => (
              <ShowRow
                key={favoriteKey(show.id, show.source ?? "tvmaze")}
                show={show}
                favorite
                onToggleFavorite={() => favorites.toggle(show.id, show.source ?? "tvmaze", show.title)}
              />
            ))}
          </div>
        )
      ) : movieFavorites.items.length === 0 ? (
        <EmptyMovies />
      ) : movies.length === 0 ? (
        <div className="rounded-card border border-edge/10 bg-panel/70 px-4 py-10 text-center">
          <p className="text-sm text-white">
            {missingMovies > 0 ? "این فیلم‌ها در فهرست فعلی نیستند" : "نتیجهای پیدا نشد"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {missingMovies > 0
              ? "وضعیتشان هنوز مشخص نشده یا اتصال اینترنت برقرار نیست."
              : "عبارت دیگری را امتحان کنید."}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {upcomingMovies.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-baseline gap-2">
                <h2 className="text-sm font-bold text-white">منتظر اکران سینمایی</h2>
                <span className="text-caption text-muted">{toPersianDigits(upcomingMovies.length)} فیلم</span>
              </div>
              {upcomingMovies.map(renderMovieRow)}
            </section>
          )}
          {qualityMovies.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-baseline gap-2">
                <h2 className="text-sm font-bold text-white">در انتظار کیفیت خوب</h2>
                <span className="text-caption text-muted">{toPersianDigits(qualityMovies.length)} فیلم</span>
              </div>
              {qualityMovies.map(renderMovieRow)}
            </section>
          )}
        </div>
      )}

      {tab === "series" && missingShows > 0 && shows.length > 0 && (
        <p className="text-caption text-muted">
          {toPersianDigits(missingShows)} سریال ستاره‌شده قسمت بعدی اعلام‌شده ندارد و فعلاً نمایش داده نمی‌شود.
        </p>
      )}
      {tab === "movies" && missingMovies > 0 && movies.length > 0 && (
        <p className="text-caption text-muted">
          {toPersianDigits(missingMovies)} فیلم ستاره‌شده هنوز در فهرست فعلی نیست.
        </p>
      )}
    </div>
  );
}

function EmptySeries() {
  return (
    <EmptyState
      icon={<Star className="h-5 w-5" strokeWidth={1.8} />}
      title="هنوز سریالی را ستاره نکرده‌اید"
      description="در صفحهٔ رادار روی ستارهٔ هر سریال بزنید تا یادآوری برایش فعال شود."
      action={
        <Link to="/" className="rounded-lg bg-white/8 px-4 py-2 text-xs text-white">
          رفتن به رادار
        </Link>
      }
    />
  );
}

function EmptyMovies() {
  return (
    <EmptyState
      icon={<Star className="h-5 w-5" strokeWidth={1.8} />}
      title="هنوز فیلمی را ستاره نکرده‌اید"
      description="در بخش فیلم‌ها روی ستارهٔ هر فیلم بزنید تا مشخص شود منتظر اکرانش هستید یا کیفیت خوبش."
      action={
        <Link to="/movies" className="rounded-lg bg-white/8 px-4 py-2 text-xs text-white">
          رفتن به فیلم‌ها
        </Link>
      }
    />
  );
}

export default FavoritesPage;
