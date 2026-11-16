import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { useLiveSearch, useAdvancedSearch, type SearchFilters, type SearchResult, ALL_GENRES, SORT_OPTIONS, RATING_OPTIONS, getGenreName } from "../hooks/useSearch";
import { Poster } from "../components/Poster";
import { toPersianDigits, jalaliDate } from "../lib/date";
import { List } from "react-window";

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [type, setType] = useState<"movie" | "tv" | "all">((searchParams.get("type") as any) || "all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<SearchFilters>({
    query: "",
    type: "all",
    genre: searchParams.get("genre") || "",
    year: searchParams.get("year") || "",
    rating: searchParams.get("rating") || "",
    status: searchParams.get("status") || "",
    network: searchParams.get("network") || "",
    sortBy: (searchParams.get("sortBy") as any) || "popularity",
    sortOrder: (searchParams.get("sortOrder") as any) || "desc",
  });

  // Live search
  const liveSearch = useLiveSearch(query, type);

  // Advanced search (when no live query or query too short)
  const advancedSearch = useAdvancedSearch(selectedFilters);

  // Determine which results to show
  const isLiveSearch = query.length >= 2;
  const results = isLiveSearch ? liveSearch.results : (advancedSearch.data?.items || advancedSearch.data?.results || []);
  const isLoading = isLiveSearch ? liveSearch.isLoading : advancedSearch.isLoading;

  // Sync URL with filters
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (type !== "all") params.set("type", type);
    Object.entries(selectedFilters).forEach(([key, value]) => {
      if (value && key !== "query" && key !== "type") params.set(key, value);
    });
    setSearchParams(params, { replace: true });
  }, [query, type, selectedFilters, setSearchParams]);

  const handleFilterChange = useCallback(<T extends keyof SearchFilters>(key: T, value: SearchFilters[T]) => {
    setSelectedFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = () => {
    setSelectedFilters({
      query: "",
      type: "all",
      genre: "",
      year: "",
      rating: "",
      status: "",
      network: "",
      sortBy: "popularity",
      sortOrder: "desc",
    });
    setQuery("");
  };

  const hasActiveFilters = Object.entries(selectedFilters).some(([k, v]) => v && k !== "query" && k !== "type");

  const filterBtnClass = "rounded-xl border px-4 py-3 flex items-center gap-2 transition-colors " +
    (hasActiveFilters
      ? "border-amber-400/50 bg-amber-400/10 text-amber-300"
      : "border-white/10 bg-white/5 text-ink-200 hover:border-white/20");

  return (
    <div className="space-y-5">
      {/* Search Header */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="جستجوی سریال و فیلم... (حداقل ۲ کاراکتر)"
            className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 pl-12 text-white placeholder-ink-400 focus:border-amber-400/50 focus:outline-none"
            autoFocus
          />
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className={filterBtnClass}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 18a1 1 0 001-1v-2.586a1 1 0 01.293-.707l6.414-6.414a1 1 0 00.293-.707V5l4-4v6.586a1 1 0 00.293.707l6.414 6.414a1 1 0 01-.293.707V17a1 1 0 01-1 1h-2" />
          </svg>
          <span className="text-sm font-medium">فیلترها</span>
          {hasActiveFilters && <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-ink-950">!</span>}
        </button>
      </div>

      {/* Type Tabs */}
      <div className="flex gap-1 rounded-xl bg-black/25 p-1">
        {(["all", "movie", "tv"] as const).map(t => {
          const isActive = type === t;
          const baseClass = "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ";
          const className = baseClass + (isActive ? "bg-amber-400 text-ink-950" : "text-ink-300 hover:text-white");
          return (
            <button key={t} onClick={() => setType(t)} className={className}>
              {t === "all" ? "همه" : t === "movie" ? "فیلم" : "سریال"}
            </button>
          );
        })}
      </div>

      {/* Advanced Filters Panel */}
      {filtersOpen && (
        <div className="rounded-2xl border border-white/8 bg-black/25 p-4 space-y-4 animate-slide-down">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">فیلترهای پیشرفته</h3>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-amber-400 hover:text-amber-300"
              >
                پاک کردن همه
              </button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Genre */}
            <div>
              <label className="block text-[11px] font-medium text-ink-400 mb-1.5">ژانر</label>
              <select
                value={selectedFilters.genre}
                onChange={e => handleFilterChange("genre", e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-amber-400/50 focus:outline-none"
              >
                <option value="">همه</option>
                {ALL_GENRES.map(g => (
                  <option key={g.id} value={String(g.id)}>{g.name}</option>
                ))}
              </select>
            </div>

            {/* Year */}
            <div>
              <label className="block text-[11px] font-medium text-ink-400 mb-1.5">سال</label>
              <select
                value={selectedFilters.year}
                onChange={e => handleFilterChange("year", e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-amber-400/50 focus:outline-none"
              >
                <option value="">همه</option>
                {Array.from({ length: 20 }, (_, i) => 2026 - i).map(y => (
                  <option key={y} value={String(y)}>{toPersianDigits(String(y))}</option>
                ))}
              </select>
            </div>

            {/* Rating */}
            <div>
              <label className="block text-[11px] font-medium text-ink-400 mb-1.5">حداقل امتیاز</label>
              <select
                value={selectedFilters.rating}
                onChange={e => handleFilterChange("rating", e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-amber-400/50 focus:outline-none"
              >
                {RATING_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div>
              <label className="block text-[11px] font-medium text-ink-400 mb-1.5">مرتب‌سازی</label>
              <select
                value={selectedFilters.sortBy + "." + selectedFilters.sortOrder}
                onChange={e => {
                  const [sortBy, sortOrder] = e.target.value.split(".") as [SearchFilters["sortBy"], SearchFilters["sortOrder"]];
                  handleFilterChange("sortBy", sortBy);
                  handleFilterChange("sortOrder", sortOrder);
                }}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-amber-400/50 focus:outline-none"
              >
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value + ".desc"} value={opt.value + ".desc"}>{" " + opt.label + " ↓"}</option>
                ))}
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value + ".asc"} value={opt.value + ".asc"}>{" " + opt.label + " ↑"}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-400">
            {results.length === 0 && !isLoading
              ? "نتیجه‌ای یافت نشد"
              : isLiveSearch
              ? results.length + " نتیجه برای «" + query + "»"
              : results.length + " نتیجه"}
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="relative h-8 w-8">
              <svg className="h-full w-full text-amber-400" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z">
                  <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
                </path>
              </svg>
            </div>
          </div>
        ) : results.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-ink-850/60 px-4 py-14 text-center">
            <p className="text-sm font-semibold text-white">نتیجه‌ای یافت نشد</p>
            <p className="mt-1 text-xs text-ink-400">کلمات کلیدی دیگری امتحان کنید یا فیلترها را تغییر دهید.</p>
          </div>
        ) : (
          <div className="h-[600px] overflow-auto">
            <List<{ data: SearchResult[] }>
              style={{ height: 600 }}
              rowCount={results.length}
              rowHeight={180}
              rowProps={{ data: results }}
              overscanCount={5}
              rowComponent={({ index, style, data }) => (
                <div style={style} className="px-1">
                  <SearchResultCard item={data[index]} />
                </div>
              )}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SearchResultCard({ item }: { item: SearchResult }) {
  const isTV = !!item.firstAirDate;
  const date = item.firstAirDate || item.releaseDate;
  const genres = item.genres?.slice(0, 3).join("، ") || item.genreIds?.slice(0, 3).map(getGenreName).join("، ");
  const typeBadgeClass = "rounded-full px-2 py-0.5 text-[10px] font-bold " + (isTV ? "bg-sky-400/90 text-sky-950" : "bg-purple-400/90 text-purple-950");

  return (
    <Link to={isTV ? "/series/" + item.id : "/movie/" + item.id} className="block">
      <article className="group relative overflow-hidden rounded-2xl border border-white/8 bg-ink-850/70 transition-all hover:border-amber-400/30">
        <div className="relative h-full">
          <Poster
            show={{
              id: item.id,
              title: item.title,
              posterPath: item.posterPath,
              posterOriginal: item.backdropPath,
              category: "returning" as const,
            }}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            rounded="rounded-none"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-850 via-ink-850/30 to-transparent" />
        </div>

        <div className="absolute inset-x-2 bottom-2 p-3">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={typeBadgeClass}>
              {isTV ? "سریال" : "فیلم"}
            </span>
            {item.rating && item.rating > 0 && (
              <span className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                ★ {toPersianDigits(item.rating.toFixed(1))}
              </span>
            )}
          </div>
          <h3 className="text-base font-bold text-white line-clamp-1" dir="auto">{item.title}</h3>
          {date && (
            <p className="text-[11px] text-ink-400 mt-0.5">
              {jalaliDate(new Date(date + "T12:00:00")).split(" ")[0]}
            </p>
          )}
          {genres && (
            <p className="text-[10px] text-ink-500 mt-1 line-clamp-1">{genres}</p>
          )}
        </div>
      </article>
    </Link>
  );
}