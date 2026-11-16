import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFavorites } from "../hooks/useFavorites";
import { useMovieFavorites, useMovieList } from "../hooks/useMovies";
import { useMovieTrack } from "../hooks/useMovieTrack";
import { useScheduleContext } from "../hooks/ScheduleContext";
import { useFavoriteIds, useNowTicker } from "../hooks/useSchedule";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { toPersianDigits } from "../lib/date";
import { moviePrimaryDate } from "../lib/movies";
import type { Movie } from "../types";
import { ShowRow } from "../components/ShowCard";
import { MovieRow } from "../components/MovieCard";

type Tab = "series" | "movies" | "tracked";

/** Best-effort tab for a favorited movie, used for date/countdown labels. */
function movieTab(movie: Movie): "cinema" | "online" | "upcoming" {
  if (movie.onlineDate) return "online";
  const today = new Date().toISOString().slice(0, 10);
  if ((movie.theatricalDate ?? movie.releaseDate ?? "") <= today) return "cinema";
  return "upcoming";
}

export function FavoritesPage() {
  const schedule = useScheduleContext();
  const favorites = useFavorites();
  const favoriteIds = useFavoriteIds();
  const movieFavorites = useMovieFavorites();
  const movieTrack = useMovieTrack();
  const cinema = useMovieList("cinema");
  const online = useMovieList("online");
  const upcoming = useMovieList("upcoming");
  useNowTicker(30_000);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("series");

  usePullToRefresh(() => schedule.refresh(), { threshold: 80 });

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

  const moviesById = useMemo(() => {
    const map = new Map<number, Movie>();
    for (const movie of [...online.items, ...cinema.items, ...upcoming.items]) map.set(movie.id, movie);
    return map;
  }, [online.items, cinema.items, upcoming.items]);

  const movies = useMemo(
    () =>
      movieFavorites.items
        .map((item) => moviesById.get(item.movieId))
        .filter((movie): movie is Movie => Boolean(movie))
        .filter((movie) => movie.title.toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) => {
          const aDate = moviePrimaryDate(a, movieTab(a)) ?? "9999";
          const bDate = moviePrimaryDate(b, movieTab(b)) ?? "9999";
          return aDate.localeCompare(bDate);
        }),
    [movieFavorites.items, moviesById, query],
  );

  const missingShows = favorites.items.length - shows.length;
  const missingMovies = movieFavorites.items.length - movies.length;
  const total = favorites.items.length + movieFavorites.items.length + movieTrack.items.length;

  const trackedMovies = useMemo(
    () =>
      movieTrack.items
        .map((item) => moviesById.get(item.movieId))
        .filter((movie): movie is Movie => Boolean(movie))
        .filter((movie) => movie.title.toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) => {
          const aDate = moviePrimaryDate(a, movieTab(a)) ?? "9999";
          const bDate = moviePrimaryDate(b, movieTab(b)) ?? "9999";
          return aDate.localeCompare(bDate);
        }),
    [movieTrack.items, moviesById, query],
  );

  const missingTracked = movieTrack.items.length - trackedMovies.length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-white">ستاره‌های من</h1>
          <p className="mt-1 text-xs text-ink-400">
            {toPersianDigits(total)} مورد · {toPersianDigits(favorites.items.length)} سریال،{" "}
            {toPersianDigits(movieFavorites.items.length)} فیلم، {toPersianDigits(movieTrack.items.length)} در انتظار · ذخیره‌شده روی همین گوشی
          </p>
        </div>
        <div className="flex gap-2">
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
        <button
          type="button"
          onClick={() => setTab("tracked")}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${
            tab === "tracked" ? "bg-emerald-400 text-emerald-950" : "border border-white/10 bg-white/5 text-ink-300"
          }`}
        >
          در انتظار ({toPersianDigits(movieTrack.items.length)})
        </button>
      </div>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="جست‌وجو در ستاره‌ها"
        className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-white placeholder:text-ink-400 focus:border-amber-400/60 focus:outline-none"
        dir="auto"
      />

      {tab === "series" ? (
        favorites.items.length === 0 ? (
          <EmptySeries />
        ) : shows.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-ink-850/60 px-4 py-10 text-center">
            <p className="text-sm text-white">
              {missingShows > 0 ? "این سریال‌ها دیگر در برنامهٔ آینده نیستند" : "نتیجه‌ای پیدا نشد"}
            </p>
            <p className="mt-1 text-xs text-ink-400">
              {missingShows > 0
                ? "پخششان گذشته یا برنامه‌شان از منبع حذف شده است."
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
      ) : tab === "movies" ? (
        movieFavorites.items.length === 0 ? (
          <EmptyMovies />
        ) : movies.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-ink-850/60 px-4 py-10 text-center">
            <p className="text-sm text-white">
              {missingMovies > 0 ? "این فیلم‌ها در فهرست فعلی نیستند" : "نتیجه‌ای پیدا نشد"}
            </p>
            <p className="mt-1 text-xs text-ink-400">
              {missingMovies > 0
                ? "ممکن است از فهرست فیلم‌ها خارج شده باشند؛ اتصال اینترنت را بررسی کنید."
                : "عبارت دیگری را امتحان کنید."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {movies.map((movie) => (
              <MovieRow
                key={movie.id}
                movie={movie}
                tab={movieTab(movie)}
                favorite={movieFavorites.ids.has(movie.id)}
                onToggleFavorite={() => movieFavorites.toggle(movie.id)}
              />
            ))}
          </div>
        )
      ) : (
        movieTrack.items.length === 0 ? (
          <EmptyTracked />
        ) : trackedMovies.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-ink-850/60 px-4 py-10 text-center">
            <p className="text-sm text-white">
              {missingTracked > 0 ? "این فیلم‌ها در فهرست فعلی نیستند" : "نتیجه‌ای پیدا نشد"}
            </p>
            <p className="mt-1 text-xs text-ink-400">
              {missingTracked > 0
                ? "ممکن است از فهرست فیلم‌ها خارج شده باشند؛ اتصال اینترنت را بررسی کنید."
                : "عبارت دیگری را امتحان کنید."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {trackedMovies.map((movie) => (
              <MovieRow
                key={movie.id}
                movie={movie}
                tab={movieTab(movie)}
                favorite={movieFavorites.ids.has(movie.id)}
                onToggleFavorite={() => movieFavorites.toggle(movie.id)}
              />
            ))}
          </div>
        )
      )}

      {tab === "series" && missingShows > 0 && shows.length > 0 && (
        <p className="text-[11px] text-ink-400">
          {toPersianDigits(missingShows)} سریال ستاره‌شده در برنامهٔ آینده قرار ندارد و نمایش داده نمی‌شود.
        </p>
      )}
      {tab === "movies" && missingMovies > 0 && movies.length > 0 && (
        <p className="text-[11px] text-ink-400">
          {toPersianDigits(missingMovies)} فیلم ستاره‌شده در فهرست فعلی نیست.
        </p>
      )}
      {tab === "tracked" && missingTracked > 0 && trackedMovies.length > 0 && (
        <p className="text-[11px] text-ink-400">
          {toPersianDigits(missingTracked)} فیلم در انتظار در فهرست فعلی نیست.
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
        در بخش فیلم‌ها روی ستارهٔ هر فیلم بزنید تا برای انتشار خانگی یادآوری بگیرید.
      </p>
      <Link to="/movies" className="mt-4 inline-block rounded-lg bg-white/8 px-4 py-2 text-xs text-white">
        رفتن به فیلم‌ها
      </Link>
    </div>
  );
}

function EmptyTracked() {
  return (
    <div className="rounded-2xl border border-white/8 bg-ink-850/60 px-4 py-12 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-xl text-ink-400">⏳</div>
      <p className="mt-3 text-sm font-semibold text-white">هنوز فیلمی در انتظار کیفیت نیست</p>
      <p className="mt-1 text-xs text-ink-400">
        وقتی فیلمی را که اکران شده ستاره‌دار می‌کنید، به‌طور خودکار همینجا قرار می‌گیرد تا زمان انتشار نسخهٔ دیجیتالش به شما یادآوری شود.
      </p>
      <Link to="/movies" className="mt-4 inline-block rounded-lg bg-white/8 px-4 py-2 text-xs text-white">
        رفتن به فیلم‌ها
      </Link>
    </div>
  );
}
export default FavoritesPage;
