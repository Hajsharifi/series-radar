import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Movie, MovieTab } from "../types";
import { useMovieCatalog, useMovieFavorites } from "../hooks/useMovies";
import { useDebounced } from "../hooks/useSchedule";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { movieStage, searchMovies, tehranTodayISO } from "../lib/movies";
import { toPersianDigits } from "../lib/date";
import { readUiState, writeUiState } from "../lib/ui-state";
import { RelativeUpdated } from "../components/DateChip";
import { MovieCard } from "../components/MovieCard";
import { MovieHistoryPageLink } from "../components/MovieHistoryLink";
import { EmptyState, SkeletonCards } from "../components/StateViews";
import { Film } from "lucide-react";

const TABS: Array<{ key: MovieTab; label: string; hint: string }> = [
  {
    key: "quality",
    label: "در انتظار کیفیت خوب",
    hint: "اکران شدهاند و هنوز نسخهٔ دیجیتال باکیفیتشان نیامده است",
  },
  { key: "upcoming", label: "بهزودی", hint: "فقط فیلمهایی که هنوز اکران سینمایی نشدهاند" },
];

type QualityFilter = "all" | "dated" | "undated";

const GENRES = ["Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery", "Romance", "Science Fiction", "TV Movie", "Thriller", "War", "Western"];

export function MoviesPage() {
  // Tabs and filters survive navigation, so pressing back after opening a film
  // returns to the exact same list instead of resetting to the default tab.
  const [tab, setTab] = useState<MovieTab>(() => readUiState("movies.tab", "quality"));
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>(() => readUiState("movies.qualityFilter", "all"));
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState<string | null>(() => readUiState("movies.genre", null));
  const [remote, setRemote] = useState<Movie[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const catalog = useMovieCatalog();
  const favorites = useMovieFavorites();
  const debounced = useDebounced(query, 350);

  useEffect(() => writeUiState("movies.tab", tab), [tab]);
  useEffect(() => writeUiState("movies.qualityFilter", qualityFilter), [qualityFilter]);
  useEffect(() => writeUiState("movies.genre", genre), [genre]);

  usePullToRefresh(() => catalog.refresh(), { threshold: 80 });

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
  const today = tehranTodayISO();

  // Both tabs are loaded by the catalog. Items are re-bucketed by their real
  // stage, so a film that was released today moves tabs without waiting.
  const shown = useMemo(() => {
    const text = debounced.trim().toLowerCase();
    const inTab = (movie: Movie) => movieStage(movie) === tab;
    const matches = (movie: Movie) =>
      (!genre || (movie.genres ?? []).includes(genre)) &&
      (!text ||
        movie.title.toLowerCase().includes(text) ||
        (movie.originalTitle ?? "").toLowerCase().includes(text));

    const local = (tab === "quality" ? catalog.qualityItems : catalog.upcomingItems)
      .filter(inTab)
      .filter(matches);
    if (!searchingActive) return local;
    const ids = new Set(local.map((movie) => movie.id));
    return [
      ...local,
      ...remote.filter((movie) => !ids.has(movie.id) && inTab(movie) && matches(movie)),
    ];
  }, [catalog.qualityItems, catalog.upcomingItems, tab, debounced, genre, searchingActive, remote]);

  const otherStageCount = useMemo(() => {
    if (!searchingActive) return 0;
    return remote.filter((movie) => movieStage(movie) !== tab).length;
  }, [remote, searchingActive, tab]);

  const dated = useMemo(
    () => shown.filter((movie) => Boolean(movie.digitalDate && movie.digitalDate > today)),
    [shown, today],
  );
  const undated = useMemo(
    () => shown.filter((movie) => !(movie.digitalDate && movie.digitalDate > today)),
    [shown, today],
  );

  const activeTab = TABS.find((item) => item.key === tab)!;
  const listState = tab === "quality" ? catalog.quality : catalog.upcoming;

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
            tab={tab}
            favorite={favorites.ids.has(movie.id)}
            onToggleFavorite={toggleFavorite}
          />
        ))}
      </div>
    );
  }

  function section(title: string, items: Movie[], note?: string) {
    if (items.length === 0) return null;
    return (
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <span className="text-caption text-muted">{toPersianDigits(items.length)} فیلم</span>
          {note && <span className="text-caption text-muted">· {note}</span>}
        </div>
        {renderGrid(items)}
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl border border-edge/10 bg-gradient-to-br from-ink-850 via-ink-900 to-ink-950 p-5">
        <div className="pointer-events-none absolute -top-16 left-8 h-40 w-40 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 right-0 h-44 w-44 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="relative space-y-4">
          <div>
            <p className="text-caption font-medium tracking-wide text-sky-300/90">سینما و انتشار خانگی</p>
            <h1 className="mt-1 text-2xl font-extrabold leading-snug text-white">
              فیلمها، از <span className="text-amber-300">پردهٔ سینما</span> تا خانه
            </h1>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-300">
              دو مرحلهٔ انتظار: فیلمهای اکرانشده در انتظار کیفیت خوب، و فیلمهایی که هنوز به پرده نرفتهاند.
            </p>
          </div>

          <div className="relative">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="جستوجوی نام فیلم (انگلیسی)"
              aria-label="جستوجوی نام فیلم"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-white placeholder:text-muted focus:border-sky-400/60 focus:outline-none"
              dir="auto"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="پاک کردن جستوجو"
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-xs text-muted"
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
                aria-pressed={tab === item.key}
                onClick={() => setTab(item.key)}
                className={`sr-no-tap rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  tab === item.key ? "bg-sky-400 text-sky-950" : "border border-white/10 bg-white/5 text-ink-300"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === "quality" && !searchingActive && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="فیلتر تاریخ دیجیتال">
              {([
                ["all", "همه"],
                ["dated", "تاریخ مشخص"],
                ["undated", "تاریخ نامشخص"],
              ] as Array<[QualityFilter, string]>).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={qualityFilter === key}
                  onClick={() => setQualityFilter(key)}
                  className={`sr-no-tap rounded-lg px-2.5 py-1 text-caption font-medium ${
                    qualityFilter === key
                      ? "bg-amber-400 text-ink-950"
                      : "border border-white/10 bg-white/4 text-ink-300"
                  }`}
                >
                  {label} (
                  {toPersianDigits(key === "all" ? shown.length : key === "dated" ? dated.length : undated.length)})
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={genre === null}
              onClick={() => setGenre(null)}
              className={`sr-no-tap rounded-lg px-2.5 py-1 text-caption ${
                genre === null ? "bg-white/15 text-white" : "bg-white/4 text-ink-300"
              }`}
            >
              همه ژانرها
            </button>
            {GENRES.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={genre === item}
                onClick={() => setGenre((prev) => (prev === item ? null : item))}
                className={`sr-no-tap rounded-lg px-2.5 py-1 text-caption ${
                  genre === item ? "bg-white/15 text-white" : "bg-white/4 text-ink-300"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
          <p className="text-caption text-ink-300">{activeTab.hint}</p>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-white">
            {searchingActive
              ? searching
                ? "در حال جستوجو…"
                : `${toPersianDigits(shown.length)} نتیجه`
              : catalog.loading && catalog.all.length <= 6
                ? "در حال دریافت فیلمها"
                : `${toPersianDigits(shown.length)} فیلم`}
          </h2>
          <p className="mt-0.5 text-caption text-muted">
            {listState.source === "seed"
              ? "نمایش نسخهٔ همراه اپ؛ برای دادهٔ تازه به اینترنت وصل شوید"
              : <RelativeUpdated iso={listState.updatedAt} />}
          </p>
        </div>
        <button
          type="button"
          onClick={catalog.refresh}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-ink-200 active:bg-white/10"
        >
          {catalog.refreshing ? "…" : "بهروزرسانی"}
        </button>
      </div>

      {catalog.error && !searchingActive && (
        <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          ارتباط با سرور فیلم برقرار نشد — دادهٔ ذخیرهشده نمایش داده میشود.
        </div>
      )}
      {searchError && searchingActive && (
        <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          جستوجوی آنلاین ممکن نشد؛ نتایج ذخیرهشده نمایش داده میشوند.
        </div>
      )}

      {otherStageCount > 0 && (
        <button
          type="button"
          onClick={() => setTab(tab === "quality" ? "upcoming" : "quality")}
          className="w-full rounded-xl border border-sky-400/25 bg-sky-500/10 px-3 py-2 text-right text-caption text-sky-200"
        >
          {toPersianDigits(otherStageCount)} نتیجهٔ دیگر در تب «{tab === "quality" ? "بهزودی" : "در انتظار کیفیت خوب"}» است — رفتن به آن تب ←
        </button>
      )}

      {searchingActive ? (
        shown.length === 0 ? (
          <EmptyState
            icon={<Film className="h-5 w-5" strokeWidth={1.8} />}
            title="فیلمی با این نام پیدا نشد"
            description="نام انگلیسی فیلم را کامل‌تر بنویسید."
            compact
          />
        ) : (
          <div className="space-y-6">
            {section("نتایج جستوجو", shown)}
          </div>
        )
      ) : catalog.loading && catalog.all.length <= 6 ? (
        <SkeletonCards count={8} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<Film className="h-5 w-5" strokeWidth={1.8} />}
          title="فعلاً فیلمی در این بخش نیست"
          description="کمی بعد دوباره به‌روزرسانی کنید."
          compact
        />
      ) : tab === "quality" ? (
        <div className="space-y-6">
          {qualityFilter !== "undated" &&
            section("تاریخ دیجیتال مشخص", dated, "شمارش معکوس تا انتشار")}
          {qualityFilter !== "dated" &&
            section("در انتظار اعلام تاریخ", undated, "تاریخ دیجیتال هنوز اعلام نشده است")}
        </div>
      ) : (
        <div className="space-y-6">{section("اکرانهای پیشرو", shown)}</div>
      )}

      <section className="rounded-card border border-edge/10 bg-panel/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">دربارهٔ این بخش</h3>
            <p className="mt-1 max-w-2xl text-caption leading-relaxed text-ink-300">
              فهرست فیلمها و تاریخهای اکران/انتشار از TMDB میآید و تاریخها به شمسی و میلادی نمایش داده
              میشوند. هر فیلم اکرانشدهای را ستارهدار میکنید، یعنی منتظر نسخهٔ دیجیتال باکیفیت آن هستید — وقتی
              منتشر شد به شما اطلاع داده میشود و از فهرست ستارهها هم حذف میشود.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <MovieHistoryPageLink />
            <Link to="/boxoffice" className="rounded-lg bg-white/6 px-3 py-1.5 text-xs text-ink-200">
              گیشه
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
export default MoviesPage;
