import { useState, useEffect, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  useLiveSearch,
  useAdvancedSearch,
  type SearchFilters,
  type SearchResult,
  ALL_GENRES,
  RATING_OPTIONS,
  SORT_OPTIONS,
  getGenreName,
} from "../hooks/useSearch";
import { Poster } from "../components/Poster";
import { EmptyState, SkeletonCards } from "../components/StateViews";
import { SearchX } from "lucide-react";
import { toPersianDigits, jalaliDate } from "../lib/date";
import { useSearchHistory } from "../lib/searchHistory";
import { useMovieCatalog } from "../hooks/useMovies";
import { movieStage, movieStageLabel, tehranTodayISO } from "../lib/movies";
import type { Movie } from "../types";

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [type, setTypeState] = useState<"movie" | "tv" | "all">(
    (searchParams.get("type") as "movie" | "tv" | "all") || "all",
  );
  const [filters, setFilters] = useState<SearchFilters>(() => ({
    query: searchParams.get("q") || "",
    type: (searchParams.get("type") as "movie" | "tv" | "all") || "all",
    genre: searchParams.get("genre") || "",
    year: searchParams.get("year") || "",
    rating: searchParams.get("rating") || "",
    status: "",
    network: "",
    sortBy: "popularity",
    sortOrder: "desc",
  }));
  const [showFilters, setShowFilters] = useState(false);
  const [history, remember, clearHistory] = useSearchHistory();

  // Keep type and filters in sync so chips affect BOTH live search and discover.
  const setType = (t: "movie" | "tv" | "all") => {
    setTypeState(t);
    setFilters((prev) => ({ ...prev, type: t }));
  };

  const catalog = useMovieCatalog();
  const live = useLiveSearch(query, type);
  const suggestion = live.suggestion;
  const advanced = useAdvancedSearch(filters);

  const isLive = query.trim().length >= 2;
  const results: SearchResult[] = isLive
    ? live.results
    : advanced.data?.items || [];
  const loading = isLive ? live.isFetching : advanced.isFetching;
  const error = isLive ? live.isError : advanced.isError;

  const hasActiveFilters = Boolean(filters.genre || filters.year || filters.rating);

  // URL sync for shareable links + back button support.
  useEffect(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (type !== "all") params.set("type", type);
    if (filters.genre) params.set("genre", filters.genre);
    if (filters.year) params.set("year", filters.year);
    if (filters.rating) params.set("rating", filters.rating);
    setSearchParams(params, { replace: true });
  }, [query, type, filters.genre, filters.year, filters.rating, setSearchParams]);

  // When user types a query, filters become irrelevant (live search takes over);
  // when user clears the query, discover results come back with the active filters.
  const update = useCallback(<K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearAll = () => {
    setQuery("");
    setTypeState("all");
    setFilters({
      query: "", type: "all", genre: "", year: "", rating: "",
      status: "", network: "", sortBy: "popularity", sortOrder: "desc",
    });
  };

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <div>
          <p className="text-caption font-medium tracking-wide text-amber-300/90">جستجو و کشف</p>
          <h1 className="mt-1 text-2xl font-extrabold leading-snug text-white">
            هر چه دنبالش هستید، <span className="text-amber-300">اینجا</span>
          </h1>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            فیلم و سریال را جستجو کنید یا با فیلترها کشف کنید.
          </p>
        </div>

        {/* Search box */}
        <div className="relative">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={() => remember(query)}
            onKeyDown={(e) => {
              if (e.key === "Enter") remember(query);
            }}
            placeholder="نام فیلم یا سریال… (حداقل ۲ حرف)" aria-label="نام فیلم یا سریال… (حداقل ۲ حرف)"
            className="w-full rounded-card border border-white/10 bg-black/30 py-3 pr-11 pl-10 text-sm text-white placeholder:text-muted focus:border-amber-400/60 focus:outline-none"
            autoFocus
          />
          <svg className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="پاک کردن جستجو"
              className="absolute left-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-sm text-muted hover:bg-white/10"
            >
              ✕
            </button>
          )}
        </div>

        {suggestion && (
          <button
            type="button"
            onClick={() => {
              setQuery(suggestion.text);
              remember(suggestion.text);
            }}
            className="w-full rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-right text-xs text-amber-200"
          >
            منظورت «<span className="font-bold">{suggestion.text}</span>» بود؟ بزن تا جستجو شود
          </button>
        )}

        {!isLive && history.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-caption text-muted">جستجوهای اخیر:</span>
            {history.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setQuery(item)}
                className="sr-no-tap rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-caption text-ink-200 active:bg-white/10"
              >
                {item}
              </button>
            ))}
            <button type="button" onClick={clearHistory} className="text-caption text-muted underline">
              پاک کردن
            </button>
          </div>
        )}

        {/* Type chips + filter toggle */}
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "movie", "tv"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`sr-no-tap rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                type === t ? "bg-amber-400 text-ink-950" : "border border-white/10 bg-white/5 text-ink-300"
              }`}
            >
              {t === "all" ? "همه" : t === "movie" ? "فیلم" : "سریال"}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`sr-no-tap mr-auto rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              showFilters || hasActiveFilters
                ? "bg-sky-400/20 text-sky-200 ring-1 ring-sky-400/40"
                : "border border-white/10 bg-white/5 text-ink-300"
            }`}
          >
            ⚙ فیلترها {hasActiveFilters ? "•" : ""}
          </button>
        </div>

        {/* Filter panel: ژانر / سال / امتیاز / مرتبسازی */}
        {showFilters && (
          <div className="space-y-3 rounded-card border border-edge/10 bg-black/20 p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 shrink-0 text-caption text-muted">ژانر</span>
              <div className="sr-hide-scrollbar flex flex-1 gap-1.5 overflow-x-auto">
                <button type="button" onClick={() => update("genre", "")} className={`shrink-0 rounded-lg px-2.5 py-1 text-caption ${!filters.genre ? "bg-white/15 text-white" : "bg-white/5 text-muted"}`}>همه</button>
                {ALL_GENRES.map((g) => (
                  <button key={g.id} type="button" onClick={() => update("genre", String(g.id))} className={`shrink-0 rounded-lg px-2.5 py-1 text-caption ${filters.genre === String(g.id) ? "bg-white/15 text-white" : "bg-white/5 text-muted"}`}>
                    {g.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 shrink-0 text-caption text-muted">سال</span>
              <div className="sr-hide-scrollbar flex flex-1 gap-1.5 overflow-x-auto">
                <button type="button" onClick={() => update("year", "")} className={`shrink-0 rounded-lg px-2.5 py-1 text-caption ${!filters.year ? "bg-white/15 text-white" : "bg-white/5 text-muted"}`}>همه</button>
                {Array.from({ length: 15 }, (_, i) => 2026 - i).map((y) => (
                  <button key={y} type="button" onClick={() => update("year", String(y))} className={`shrink-0 rounded-lg px-2.5 py-1 text-caption tabular-nums ${filters.year === String(y) ? "bg-white/15 text-white" : "bg-white/5 text-muted"}`}>
                    {toPersianDigits(String(y))}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 shrink-0 text-caption text-muted">امتیاز</span>
              <div className="flex flex-1 gap-1.5">
                {RATING_OPTIONS.map((opt) => (
                  <button key={opt.value} type="button" onClick={() => update("rating", opt.value)} className={`rounded-lg px-2.5 py-1 text-caption ${filters.rating === opt.value ? "bg-white/15 text-white" : "bg-white/5 text-muted"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 shrink-0 text-caption text-muted">مرتبسازی</span>
              <div className="flex flex-1 flex-wrap gap-1.5">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { update("sortBy", opt.value); update("sortOrder", "desc"); }}
                    className={`rounded-lg px-2.5 py-1 text-caption ${filters.sortBy === opt.value ? "bg-white/15 text-white" : "bg-white/5 text-muted"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {(hasActiveFilters || query) && (
              <button type="button" onClick={clearAll} className="text-caption text-amber-400">پاک کردن همه</button>
            )}
          </div>
        )}
      </header>

      {/* Results */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-white">
            {isLive
              ? loading ? "در حال جستجو…" : `${toPersianDigits(results.length)} نتیجه`
              : loading ? "در حال بارگذاری…" : `${toPersianDigits(results.length)} عنوان`}
          </h2>
          {!isLive && !loading && (
            <span className="text-caption text-muted">
              {hasActiveFilters ? "نتایج فیلترشده" : "پربازدیدترینها"}
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            ارتباط با سرور برقرار نشد — دوباره تلاش کنید.
          </div>
        )}

        {loading ? (
          <SkeletonCards count={6} />
        ) : results.length === 0 ? (
          <EmptyState
            icon={<SearchX className="h-5 w-5" strokeWidth={1.8} />}
            title="نتیجه‌ای پیدا نشد"
            description={isLive ? "عبارت دیگری امتحان کنید یا فیلترها را تغییر دهید." : "فیلترها را پاک کنید."}
            compact
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {results.map((item, i) => (
              <SearchResultCard key={`${item.mediaType}-${item.id}-${i}`} item={item} byId={catalog.byId} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SearchResultCard({ item, byId }: { item: SearchResult; byId: Map<number, Movie> }) {
  // Explicit mediaType from API; fall back to field presence only as last resort.
  const isTV = item.mediaType
    ? item.mediaType === "tv"
    : Boolean(item.firstAirDate && !item.releaseDate);
  const date = item.firstAirDate || item.releaseDate;
  const genreNames = item.genres?.length
    ? item.genres.slice(0, 2).join(" · ")
    : (item.genreIds ?? []).slice(0, 2).map(getGenreName).join(" · ");

  // Use verified stage data when the film is in a movie list. For other search
  // results only claim what the release date can prove - never a false "waiting".
  const known = !isTV ? byId.get(item.id) : undefined;
  const stage = known ? movieStage(known) : null;
  const upcomingByDate = !isTV && Boolean(item.releaseDate && item.releaseDate > tehranTodayISO());
  const movieLabel = isTV
    ? null
    : stage
      ? movieStageLabel(stage)
      : upcomingByDate
        ? "بهزودی"
        : "اکرانشده";
  const movieTone = stage === "quality"
    ? "bg-amber-400/90 text-amber-950"
    : stage === "upcoming" || upcomingByDate
      ? "bg-sky-400/90 text-sky-950"
      : stage === "available"
        ? "bg-emerald-400/90 text-emerald-950"
        : "bg-violet-400/90 text-violet-950";
  const badgeClass =
    "rounded-full px-2 py-0.5 text-micro font-bold " +
    (isTV ? "bg-sky-400/90 text-sky-950" : movieTone);

  return (
    <Link to={isTV ? `/tv/${item.id}` : `/movie/${item.id}`} className="sr-no-tap block">
      <article className="sr-card-hover group relative flex h-full flex-col overflow-hidden rounded-card border border-edge/10 bg-panel/85">
        <div className="relative">
          <Poster
            show={{
              id: item.id,
              title: item.title || "",
              posterPath: item.posterPath,
              posterOriginal: item.backdropPath,
              category: "returning" as const,
            }}
            className="aspect-[2/3] w-full"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-ink-950 via-ink-950/50 to-transparent" />
          <span className={`absolute right-2 top-2 ${badgeClass}`}>{isTV ? "سریال" : "فیلم"}</span>
          {movieLabel && (
            <span className={`absolute right-2 top-8 ${movieTone}`}>{movieLabel}</span>
          )}
          {typeof item.rating === "number" && item.rating > 0 && (
            <span className="absolute left-2 top-2 rounded-lg bg-black/65 px-1.5 py-0.5 text-micro font-bold text-amber-300 backdrop-blur">
              ★ {toPersianDigits(item.rating.toFixed(1))}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-2.5">
          <h3 className="line-clamp-2 min-h-[2.4em] text-sm font-bold leading-snug text-white" dir="auto">
            {item.title || "بدون عنوان"}
          </h3>
          {item.originalTitle && item.originalTitle !== item.title && (
            <p className="truncate text-micro text-muted" dir="auto">{item.originalTitle}</p>
          )}
          {item.overview && (
            <p className="line-clamp-2 text-micro leading-relaxed text-muted" dir="auto">
              {item.overview}
            </p>
          )}
          <div className="mt-auto flex items-center justify-between gap-1 pt-1 text-micro text-muted">
            <span className="truncate">{genreNames || "—"}</span>
            {date && <span className="shrink-0 tabular-nums">{jalaliDate(new Date(date + "T12:00:00"))}</span>}
          </div>
        </div>
      </article>
    </Link>
  );
}