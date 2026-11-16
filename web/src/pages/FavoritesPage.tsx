import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFavorites } from "../hooks/useFavorites";
import { useMovieFavorites, useMovieList } from "../hooks/useMovies";
import { useScheduleContext } from "../hooks/ScheduleContext";
import { useFavoriteIds, useNowTicker } from "../hooks/useSchedule";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { toPersianDigits } from "../lib/date";
import { moviePrimaryDate } from "../lib/movies";
import type { Movie } from "../types";
import { ShowRow } from "../components/ShowCard";
import { MovieRow } from "../components/MovieCard";

type Tab = "series" | "movies";

/** Best-effort tab for a favorited movie, used for date/countdown labels. */
function movieTab(movie: Movie): "cinema" | "upcoming" {
  const today = new Date().toISOString().slice(0, 10);
  if ((movie.theatricalDate ?? movie.releaseDate ?? "") <= today) return "cinema";
  return "upcoming";
}

export function FavoritesPage() {
  const schedule = useScheduleContext();
  const favorites = useFavorites();
  const favoriteIds = useFavoriteIds();
  const movieFavorites = useMovieFavorites();
  const cinema = useMovieList("cinema");
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
    for (const movie of [...cinema.items, ...upcoming.items]) map.set(movie.id, movie);
    return map;
  }, [cinema.items, upcoming.items]);

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
  const total = favorites.items.length + movieFavorites.items.length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-white">ستاره\u200cهای من</h1>
          <p className="mt-1 text-xs text-ink-400">
            {toPersianDigits(total)} مورد · {toPersianDigits(favorites.items.length)} سریال،{" "}
            {toPersianDigits(movieFavorites.items.length)} فیلم · ذخیره\u200cشده روی همین گوشی
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
          سریال\u200cها ({toPersianDigits(favorites.items.length)})
        </button>
        <button
          type="button"
          onClick={() => setTab("movies")}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${
            tab === "movies" ? "bg-sky-400 text-sky-950" : "border border-white/10 bg-white/5 text-ink-300"
          }`}
        >
          فیلم\u200cها ({toPersianDigits(movieFavorites.items.length)})
        </button>
      </div>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="جست\u200cوجو در ستاره\u200cها"
        className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-white placeholder:text-ink-400 focus:border-amber-400/60 focus:outline-none"
        dir="auto"
      />

      {tab === "series" ? (
        favorites.items.length === 0 ? (
          <EmptySeries />
        ) : shows.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-ink-850/60 px-4 py-10 text-center">
            <p className="text-sm text-white">
              {missingShows > 0 ? "این سریال\u200cها دیگر در برنامهٔ آینده نیستند" : "نتیجهای پیدا نشد"}
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
            {missingMovies > 0 ? "این فیلم\u200cها در فهرست فعلی نیستند" : "نتیجهای پیدا نشد"}
          </p>
          <p className="mt-1 text-xs text-ink-400">
            {missingMovies > 0
              ? "ممکن است از فهرست فیلم\u200cها خارج شده باشند؛ اتصال اینترنت را بررسی کنید."
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
      )}

      {tab === "series" && missingShows > 0 && shows.length > 0 && (
        <p className="text-[11px] text-ink-400">
          {toPersianDigits(missingShows)} سریال ستاره\u200cشده در برنامهٔ آینده قرار ندارد و نمایش داده نمی\u200cشود.
        </p>
      )}
      {tab === "movies" && missingMovies > 0 && movies.length > 0 && (
        <p className="text-[11px] text-ink-400">
          {toPersianDigits(missingMovies)} فیلم ستاره\u200cشده در فهرست فعلی نیست.
        </p>
      )}
    </div>
  );
}

function EmptySeries() {
  return (
    <div className="rounded-2xl border border-white/8 bg-ink-850/60 px-4 py-12 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-xl text-ink-400">☆</div>
      <p className="mt-3 text-sm font-semibold text-white">هنوز سریالی را ستاره نکرده\u200cاید</p>
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
      <p className="mt-3 text-sm font-semibold text-white">هنوز فیلمی را ستاره نکرده\u200cاید</p>
      <p className="mt-1 text-xs text-ink-400">
        در بخش فیلم\u200cها روی ستارهٔ هر فیلم بزنید تا وقتی نسخه دیجیتالش منتشر شد به شما یادآوری داده شود.
      </p>
      <Link to="/movies" className="mt-4 inline-block rounded-lg bg-white/8 px-4 py-2 text-xs text-white">
        رفتن به فیلم\u200cها
      </Link>
    </div>
  );
}

export default FavoritesPage;