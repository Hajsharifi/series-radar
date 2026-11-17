import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useFavorites } from "../hooks/useFavorites";
import { useMovieCatalog, useMovieFavorites } from "../hooks/useMovies";
import { useScheduleContext } from "../hooks/ScheduleContext";
import { useFavoriteIds, useNowTicker } from "../hooks/useSchedule";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { toPersianDigits } from "../lib/date";
import {
  fetchMovieDetail,
  isMovieFinished,
  moviePrimaryDate,
  movieStage,
} from "../lib/movies";
import {
  clearMovieRemovals,
  getMovieRemovals,
  recordMovieRemoval,
  subscribeMovieRemovals,
  type MovieRemoval,
} from "../lib/movie-removals";
import type { Movie } from "../types";
import { ShowRow } from "../components/ShowCard";
import { MovieRow } from "../components/MovieCard";
import { MovieHistoryPageLink } from "../components/MovieHistoryLink";

type Tab = "series" | "movies";

export function FavoritesPage() {
  const schedule = useScheduleContext();
  const favorites = useFavorites();
  const favoriteIds = useFavoriteIds();
  const movieFavorites = useMovieFavorites();
  const catalog = useMovieCatalog();
  useNowTicker(30_000);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("series");
  const [detailMap, setDetailMap] = useState<Record<number, Movie>>({});
  const [removals, setRemovals] = useState<MovieRemoval[]>(() => getMovieRemovals());
  // Last time we asked the server about a favorite that was absent from both
  // lists. Recheck after 30 minutes so a later digital release is still seen.
  const checked = useRef(new Map<number, number>());

  usePullToRefresh(() => schedule.refresh(), { threshold: 80 });

  useEffect(() => {
    const sync = () => setRemovals(getMovieRemovals());
    sync();
    return subscribeMovieRemovals(sync);
  }, []);

  const shows = useMemo(() => {
    const map = new Map(schedule.shows.map((show) => [show.id, show]));
    return favorites.items
      .map((item) => map.get(item.showId))
      .filter((show): show is NonNullable<typeof show> => Boolean(show))
      .filter((show) => show.title.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => {
        const aStamp = a.airstamp ? new Date(a.airstamp).getTime() : Number.MAX_SAFE_INTEGER;
        const bStamp = b.airstamp ? new Date(b.airstamp).getTime() : Number.MAX_SAFE_INTEGER;
        return aStamp - bStamp;
      });
  }, [schedule.shows, favorites.items, query]);

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

  const missingShows = favorites.items.length - shows.length;
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
          <p className="mt-1 text-xs text-ink-400">
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
        placeholder="جست‌وجو در ستاره‌ها"
        className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-white placeholder:text-ink-400 focus:border-amber-400/60 focus:outline-none"
        dir="auto"
      />

      {removals.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/8 px-3 py-2 text-[11px] text-emerald-200">
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
          </div>
          <div className="flex gap-2">
            <MovieHistoryPageLink />
            <button
              type="button"
              onClick={clearMovieRemovals}
              aria-label="بستن پیام"
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
          <div className="rounded-2xl border border-white/8 bg-ink-850/60 px-4 py-10 text-center">
            <p className="text-sm text-white">
              {missingShows > 0 ? "این سریال‌ها دیگر در برنامهٔ آینده نیستند" : "نتیجهای پیدا نشد"}
            </p>
            <p className="mt-1 text-xs text-ink-400">
              {missingShows > 0
                ? "پخششان گذشته یا برنامهشان از منبع حذف شده است."
                : "عبارت دیگری را امتحان کنید."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {shows.map((show) => (
              <ShowRow
                key={show.id}
                show={show}
                favorite={favoriteIds.has(show.id)}
                onToggleFavorite={() => favorites.toggle(show.id)}
              />
            ))}
          </div>
        )
      ) : movieFavorites.items.length === 0 ? (
        <EmptyMovies />
      ) : movies.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-ink-850/60 px-4 py-10 text-center">
          <p className="text-sm text-white">
            {missingMovies > 0 ? "این فیلم‌ها در فهرست فعلی نیستند" : "نتیجهای پیدا نشد"}
          </p>
          <p className="mt-1 text-xs text-ink-400">
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
                <span className="text-[11px] text-ink-400">{toPersianDigits(upcomingMovies.length)} فیلم</span>
              </div>
              {upcomingMovies.map(renderMovieRow)}
            </section>
          )}
          {qualityMovies.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-baseline gap-2">
                <h2 className="text-sm font-bold text-white">در انتظار کیفیت خوب</h2>
                <span className="text-[11px] text-ink-400">{toPersianDigits(qualityMovies.length)} فیلم</span>
              </div>
              {qualityMovies.map(renderMovieRow)}
            </section>
          )}
        </div>
      )}

      {tab === "series" && missingShows > 0 && shows.length > 0 && (
        <p className="text-[11px] text-ink-400">
          {toPersianDigits(missingShows)} سریال ستاره‌شده در برنامهٔ آینده قرار ندارد و نمایش داده نمی‌شود.
        </p>
      )}
      {tab === "movies" && missingMovies > 0 && movies.length > 0 && (
        <p className="text-[11px] text-ink-400">
          {toPersianDigits(missingMovies)} فیلم ستاره‌شده هنوز در فهرست فعلی نیست.
        </p>
      )}
    </div>
  );
}

function EmptySeries() {
  return (
    <div className="rounded-2xl border border-white/8 bg-ink-850/60 px-4 py-12 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-xl text-ink-400">☆</div>
      <p className="mt-3 text-sm font-semibold text-white">هنوز سریالی را ستاره نکرده‌اید</p>
      <p className="mt-1 text-xs text-ink-400">
        در صفحهٔ رادار روی ستارهٔ هر سریال بزنید تا یادآوری برایش فعال شود.
      </p>
      <Link to="/" className="mt-4 inline-block rounded-lg bg-white/8 px-4 py-2 text-xs text-white">
        رفتن به رادار
      </Link>
    </div>
  );
}

function EmptyMovies() {
  return (
    <div className="rounded-2xl border border-white/8 bg-ink-850/60 px-4 py-12 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-xl text-ink-400">☆</div>
      <p className="mt-3 text-sm font-semibold text-white">هنوز فیلمی را ستاره نکرده‌اید</p>
      <p className="mt-1 text-xs text-ink-400">
        در بخش فیلم‌ها روی ستارهٔ هر فیلم بزنید تا مشخص شود منتظر اکرانش هستید یا کیفیت خوبش.
      </p>
      <Link to="/movies" className="mt-4 inline-block rounded-lg bg-white/8 px-4 py-2 text-xs text-white">
        رفتن به فیلم‌ها
      </Link>
    </div>
  );
}

export default FavoritesPage;
