import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Movie, MovieTab } from "../types";
import { useMovieFavorites, useMovieList } from "../hooks/useMovies";
import { useDebounced } from "../hooks/useSchedule";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { searchMovies } from "../lib/movies";
import { toPersianDigits } from "../lib/date";
import { RelativeUpdated } from "../components/DateChip";
import { MovieCard } from "../components/MovieCard";

const TABS: Array<{ key: MovieTab; label: string; hint: string }> = [
  { key: "cinema", label: "روی پرده", hint: "فیلم‌های اکران‌شده — فقط منتظر نسخه دیجیتال باکیفیتشان هستیم" },
  { key: "upcoming", label: "به‌زودی", hint: "اکران‌های سینمایی پیش‌رو" },
];

const GENRES = ["Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery", "Romance", "Science Fiction", "TV Movie", "Thriller", "War", "Western"];

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-ink-850/60">
      <div className="sr-skeleton aspect-[2/3] w-full" />
      <div className="space-y-2 p-3">
        <div className="sr-skeleton h-3.5 w-3/4 rounded" />
        <div className="sr-skeleton h-2.5 w-1/2 rounded" />
      </div>
    </div>
  );
}

export function MoviesPage() {
  const [tab, setTab] = useState<MovieTab>("cinema");
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const [remote, setRemote] = useState<Movie[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const list = useMovieList(tab);
  const favorites = useMovieFavorites();
  const debounced = useDebounced(query, 350);

  usePullToRefresh(() => list.refresh(), { threshold: 80 });

  useEffect(() => {
    const text = debounced.trim();
    if (text.length < 2) {
      setRemote([]);
      setSearching(false);
      setSearchError(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    setSearchError(false);
    const timer = window.setTimeout(() => {
      searchMovies(text)
        .then((items) => {
          if (!cancelled) setRemote(items);
        })
        .catch(() => {
          if (!cancelled) {
            setRemote([]);
            setSearchError(true);
          }
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [debounced]);

  const searchingActive = debounced.trim().length >= 2;

  const shown = useMemo(() => {
    const text = debounced.trim().toLowerCase();
    let base = list.items;
    if (genre) {
      base = base.filter((movie) => (movie.genres ?? []).includes(genre));
    }
    if (!text) return base;
    const local = base.filter(
      (movie) =>
        movie.title.toLowerCase().includes(text) ||
        (movie.originalTitle ?? "").toLowerCase().includes(text),
    );
    const ids = new Set(local.map((movie) => movie.id));
    return [...local, ...remote.filter((movie) => !ids.has(movie.id))];
  }, [list.items, remote, debounced, genre]);

  const activeTab = TABS.find((item) => item.key === tab)!;

  function toggleFavorite(movie: Movie) {
    favorites.toggle(movie.id);
  }

  function renderGrid(items: Movie[]) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((movie) => (
          <MovieCard
            key={movie.id}
            movie={movie}
            tab={searchingActive ? "upcoming" : tab}
            favorite={favorites.ids.has(movie.id)}
            onToggleFavorite={toggleFavorite}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-br from-ink-850 via-ink-900 to-ink-950 p-5">
        <div className="pointer-events-none absolute -top-16 left-8 h-40 w-40 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 right-0 h-44 w-44 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="relative space-y-4">
          <div>
            <p className="text-[11px] font-medium tracking-wide text-sky-300/90">سینما و انتشار خانگی</p>
            <h1 className="mt-1 text-2xl font-extrabold leading-snug text-white">
              فیلم‌ها، از <span className="text-amber-300">پردهٔ سینما</span> تا خانه
            </h1>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-300">
              اکران‌های سینمایی، فیلم‌های در انتظار نسخه دیجیتال، و اکران‌های پیش‌رو.
            </p>
          </div>

          <div className="relative">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="جست‌وجوی نام فیلم (انگلیسی)"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-white placeholder:text-ink-400 focus:border-sky-400/60 focus:outline-none"
              dir="auto"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="پاک کردن جست‌وجو"
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-xs text-ink-400"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`sr-no-tap rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  tab === item.key ? "bg-sky-400 text-sky-950" : "border border-white/10 bg-white/5 text-ink-300"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setGenre(null)}
              className={`sr-no-tap rounded-lg px-2.5 py-1 text-[11px] ${
                genre === null ? "bg-white/15 text-white" : "bg-white/4 text-ink-400"
              }`}
            >
              همه ژانرها
            </button>
            {GENRES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setGenre((prev) => (prev === item ? null : item))}
                className={`sr-no-tap rounded-lg px-2.5 py-1 text-[11px] ${
                  genre === item ? "bg-white/15 text-white" : "bg-white/4 text-ink-400"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-ink-400">{activeTab.hint}</p>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-white">
            {searchingActive
              ? searching
                ? "در حال جست‌وجو…"
                : `${toPersianDigits(shown.length)} نتیجه`
              : list.loading && list.items.length <= 6
                ? "در حال دریافت فیلم‌ها"
                : `${toPersianDigits(shown.length)} فیلم`}
          </h2>
          <p className="mt-0.5 text-[11px] text-ink-400">
            {list.source === "seed"
              ? "نمایش نسخهٔ همراه اپ؛ برای دادهٔ تازه به اینترنت وصل شوید"
              : <RelativeUpdated iso={list.updatedAt} />}
          </p>
        </div>
        <button
          type="button"
          onClick={list.refresh}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-ink-200 active:bg-white/10"
        >
          {list.refreshing ? "…" : "به‌روزرسانی"}
        </button>
      </div>

      {list.error && !searchingActive && (
        <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          ارتباط با سرور فیلم برقرار نشد — دادهٔ ذخیره‌شده نمایش داده می‌شود.
        </div>
      )}
      {searchError && searchingActive && (
        <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          جست‌وجوی آنلاین ممکن نشد؛ نتایج ذخیره‌شده نمایش داده می‌شوند.
        </div>
      )}

      {searchingActive ? (
        shown.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-ink-850/60 px-4 py-10 text-center">
            <p className="text-sm font-semibold text-white">فیلمی با این نام پیدا نشد</p>
            <p className="mt-1 text-xs text-ink-400">نام انگلیسی فیلم را کامل‌تر بنویسید.</p>
          </div>
        ) : (
          renderGrid(shown)
        )
      ) : list.loading && list.items.length <= 6 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-ink-850/60 px-4 py-10 text-center">
          <p className="text-sm font-semibold text-white">فعلاً فیلمی در این بخش نیست</p>
          <p className="mt-1 text-xs text-ink-400">کمی بعد دوباره به‌روزرسانی کنید.</p>
        </div>
      ) : tab === "online" ? (
        <div className="space-y-6">
          <section>
            <div className="mb-2.5 flex items-baseline gap-2">
              <h3 className="text-sm font-bold text-white">در انتظار نسخه دیجیتال</h3>
              <span className="text-[11px] text-ink-400">{toPersianDigits(shown.length)} فیلم</span>
            </div>
            {renderGrid(shown)}
          </section>
        </div>
      ) : tab === "upcoming" ? (
        <div className="space-y-6">
          <section>
            <div className="mb-2.5 flex items-baseline gap-2">
              <h3 className="text-sm font-bold text-white">اکران‌های پیش‌رو</h3>
              <span className="text-[11px] text-ink-400">{toPersianDigits(shown.length)} فیلم</span>
            </div>
            {renderGrid(shown)}
          </section>
        </div>
      ) : (
        renderGrid(shown)
      )}

      <section className="rounded-2xl border border-white/8 bg-ink-850/50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">دربارهٔ این بخش</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-400">
              فهرست فیلم‌ها و تاریخ‌های اکران/انتشار از TMDB می‌آید و تاریخ‌ها به شمسی و میلادی نمایش داده
              می‌شوند. هر فیلم اکران‌شده‌ای را ستاره‌دار می‌کنید، یعنی منتظر نسخه دیجیتال باکیفیت آن هستید — وقتی منتشر شد به شما اطلاع داده می‌شود.
            </p>
          </div>
          <Link to="/boxoffice" className="shrink-0 rounded-lg bg-white/6 px-3 py-1.5 text-xs text-ink-200">
            گیشه
          </Link>
        </div>
      </section>
    </div>
  );
}export default MoviesPage;
