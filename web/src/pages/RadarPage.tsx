import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFavorites } from "../hooks/useFavorites";
import { useScheduleContext } from "../hooks/ScheduleContext";
import {
  filterShows,
  groupShows,
  useDebounced,
  useFavoriteKeys,
  useNowTicker,
  type ShowFilters,
} from "../hooks/useSchedule";
import { useFavoriteEpisodes } from "../hooks/useFavoriteEpisodes";
import { useFeaturedDismissed } from "../hooks/useFeaturedDismissed";
import { useLiveTVSections } from "../hooks/useLiveTV";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { CATEGORY_LABEL, genreLabel } from "../lib/labels";
import { rankFeaturedSuggestions } from "../lib/featured";
import { favoriteKey } from "../lib/favorites";
import { readUiState, writeUiState } from "../lib/ui-state";
import {
  toPersianDigits,
  jalaliDate,
  jalaliFromStamp,
  dateAfterDays,
  toIsoDay,
} from "../lib/date";
import type { Show } from "../types";
import { ShowCard, ShowRow } from "../components/ShowCard";
import { CompactShowRow } from "../components/CompactShowRow";
import { EmptyState, SkeletonCards } from "../components/StateViews";
import { LayoutGrid, List, Radar, RefreshCw, Rows3, Search, SlidersHorizontal, X } from "lucide-react";
import { Button, Chip, Input, SectionHeader } from "../components/ui";
import { Poster } from "../components/Poster";

const FILTERS: Array<{ key: ShowFilters["category"]; label: string }> = [
  { key: "all", label: "همه" },
  { key: "new", label: CATEGORY_LABEL.new },
  { key: "returning", label: CATEGORY_LABEL.returning },
];

const GENRES = ["Drama", "Comedy", "Crime", "Thriller", "Sci-Fi", "Fantasy", "Animation", "Documentary"];

type RadarSort = "date" | "rating" | "popularity" | "alphabetical";
const SORT_OPTIONS: Array<{ key: RadarSort; label: string }> = [
  { key: "date", label: "تاریخ پخش" },
  { key: "rating", label: "امتیاز" },
  { key: "popularity", label: "محبوبیت" },
  { key: "alphabetical", label: "الفبا" },
];

const UNSCRIPTED_GENRES = new Set([
  "Reality", "Talk Show", "Talk", "Game Show", "رئالیتی", "تاک‌شو", "مسابقه",
]);

function isUnscripted(show: Show): boolean {
  return (show.genres ?? []).some((genre) => UNSCRIPTED_GENRES.has(genre));
}

const LANGUAGE_FILTERS = [
  { key: "all", label: "همهٔ زبان‌ها" },
  { key: "en", label: "انگلیسی" },
  { key: "ko", label: "کره‌ای" },
  { key: "ja", label: "ژاپنی" },
  { key: "es", label: "اسپانیایی" },
  { key: "tr", label: "ترکی" },
  { key: "hi", label: "هندی" },
  { key: "ar", label: "عربی" },
];

const COUNTRY_FILTERS = [
  { key: "all", label: "همهٔ کشورها" },
  { key: "US", label: "آمریکا" },
  { key: "GB", label: "بریتانیا" },
  { key: "KR", label: "کره جنوبی" },
  { key: "JP", label: "ژاپن" },
  { key: "ES", label: "اسپانیا" },
  { key: "TR", label: "ترکیه" },
  { key: "IN", label: "هند" },
  { key: "CA", label: "کانادا" },
  { key: "AU", label: "استرالیا" },
  { key: "FR", label: "فرانسه" },
  { key: "DE", label: "آلمان" },
];

function languageKey(value?: string | null): string {
  if (!value) return "";
  const key = value.trim().toLowerCase();
  const map: Record<string, string> = {
    en: "en", english: "en",
    ko: "ko", korean: "ko",
    ja: "ja", japanese: "ja",
    es: "es", spanish: "es",
    tr: "tr", turkish: "tr",
    hi: "hi", hindi: "hi",
    ar: "ar", arabic: "ar",
  };
  return map[key] ?? key;
}

export function RadarPage() {
  const schedule = useScheduleContext();
  const now = useNowTicker(60_000);
  const favorites = useFavorites();
  const favoriteKeys = useFavoriteKeys();

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ShowFilters>(() => ({
    search: "",
    category: readUiState("radar.category", "all"),
    onlyPopular: readUiState("radar.onlyPopular", true),
  }));
  const [genre, setGenre] = useState<string | null>(() => readUiState("radar.genre", null));
  const [view, setView] = useState<"grid" | "list" | "compact">(() => readUiState("radar.view", "grid"));
  const [hideUnscripted, setHideUnscripted] = useState<boolean>(() => readUiState("radar.hideUnscripted", true));
  const [sortBy, setSortBy] = useState<RadarSort>(() => readUiState("radar.sortBy", "date"));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [language, setLanguage] = useState<string>(() => readUiState("radar.language", "en"));
  const [country, setCountry] = useState<string>(() => readUiState("radar.country", "US"));
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => writeUiState("radar.category", filters.category), [filters.category]);
  useEffect(() => writeUiState("radar.onlyPopular", filters.onlyPopular), [filters.onlyPopular]);
  useEffect(() => writeUiState("radar.genre", genre), [genre]);
  useEffect(() => writeUiState("radar.view", view), [view]);
  useEffect(() => writeUiState("radar.hideUnscripted", hideUnscripted), [hideUnscripted]);
  useEffect(() => writeUiState("radar.sortBy", sortBy), [sortBy]);
  useEffect(() => writeUiState("radar.language", language), [language]);
  useEffect(() => writeUiState("radar.country", country), [country]);

  usePullToRefresh(() => schedule.refresh(), { threshold: 80 });

  const debouncedSearch = useDebounced(search, 250);
  const effectiveFilters = useMemo(() => ({ ...filters, search: debouncedSearch }), [filters, debouncedSearch]);

  const filtered = useMemo(() => {
    // A text search should always reach the whole catalogue, even when the
    // "popular only" toggle is on.
    const scoped = { ...effectiveFilters, onlyPopular: effectiveFilters.onlyPopular && !effectiveFilters.search };
    let base = filterShows(schedule.shows, scoped, now);
    if (genre) base = base.filter((show) => (show.genres ?? []).includes(genre));
    if (hideUnscripted) base = base.filter((show) => !isUnscripted(show));
    if (language !== "all") base = base.filter((show) => languageKey(show.language) === language);
    if (country !== "all") base = base.filter((show) => (show.countryCode ?? "").toUpperCase() === country);
    // Apply the chosen sort after filtering (filterShows already sorts by date).
    if (sortBy === "rating") {
      base = [...base].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.votes ?? 0) - (a.votes ?? 0));
    } else if (sortBy === "popularity") {
      base = [...base].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
    } else if (sortBy === "alphabetical") {
      base = [...base].sort((a, b) => a.title.localeCompare(b.title, "fa"));
    }
    return base;
  }, [schedule.shows, effectiveFilters, genre, hideUnscripted, language, country, now, sortBy]);

  const groups = useMemo(() => groupShows(filtered, now), [filtered, now]);
  const todayLabel = useMemo(() => jalaliFromStamp(new Date(now).toISOString()), [now]);

  const toggle = useCallback(
    (show: Show) => favorites.toggle(show.id, show.source ?? "tvmaze", show.title),
    [favorites],
  );
  const isFavorite = useCallback(
    (show: Show) => favoriteKeys.has(favoriteKey(show.id, show.source ?? "tvmaze")),
    [favoriteKeys],
  );

  // Narrowing filters hide the featured sections; content preferences do not.
  const hasNarrowingFilters = filters.category !== "all" || !!genre || !!debouncedSearch;
  const hasFilters = hasNarrowingFilters || hideUnscripted || language !== "all" || country !== "all";
  const activeFilterCount =
    (filters.category !== "all" ? 1 : 0) +
    (genre ? 1 : 0) +
    (!filters.onlyPopular ? 1 : 0) +
    (hideUnscripted ? 1 : 0) +
    (language !== "all" ? 1 : 0) +
    (country !== "all" ? 1 : 0);

  function clearFilters() {
    setSearch("");
    setGenre(null);
    setHideUnscripted(true);
    setLanguage("en");
    setCountry("US");
    setFilters({ search: "", category: "all", onlyPopular: true });
  }

  // Live TV hooks
  const liveTV = useLiveTVSections();
  const favoriteEpisodes = useFavoriteEpisodes();
  const dismissedFeatured = useFeaturedDismissed();
  const thisWeek = useMemo(() => {
    const weekLater = now + 7 * 86_400_000;
    return favoriteEpisodes.items
      .filter((show) => {
        if (!show.airstamp) return false;
        const at = new Date(show.airstamp).getTime();
        if (at < now - 6 * 3_600_000 || at > weekLater) return false;
        if (hideUnscripted && isUnscripted(show)) return false;
        if (language !== "all" && languageKey(show.language) !== language) return false;
        if (country !== "all" && (show.countryCode ?? "").toUpperCase() !== country) return false;
        return true;
      })
      .sort((a, b) => (a.airstamp ?? "").localeCompare(b.airstamp ?? ""))
      .slice(0, 10);
  }, [favoriteEpisodes.items, now, hideUnscripted, language, country]);

  const featured = useMemo(() => {
    const byKey = new Map(
      schedule.shows.map((show) => [favoriteKey(show.id, show.source ?? "tvmaze"), show]),
    );
    const favoriteGenres = favorites.items.flatMap(
      (item) => byKey.get(favoriteKey(item.showId, item.source))?.genres ?? [],
    );
    const excludedKeys = new Set<string>();
    [...liveTV.onTheAir, ...liveTV.airingToday].forEach((show) => excludedKeys.add(`tmdb:${show.id}`));
    return rankFeaturedSuggestions(filtered, {
      now,
      favoriteKeys,
      favoriteGenres,
      excludedKeys,
      dismissedKeys: dismissedFeatured.keys,
      limit: 6,
    });
  }, [filtered, now, favorites.items, favoriteKeys, schedule.shows, liveTV.onTheAir, liveTV.airingToday, dismissedFeatured.keys]);

  // Filter live TV sections with content preferences and date filtering for airingToday
  const today = useMemo(() => toIsoDay(dateAfterDays(0)), [now]);
  const filteredOnTheAir = useMemo(() => {
    return liveTV.onTheAir.filter((show) => {
      if (!favoriteKeys.has(favoriteKey(show.id, "tmdb"))) return false;
      if (hideUnscripted && isUnscripted(show)) return false;
      if (language !== "all" && languageKey(show.language) !== language) return false;
      if (country !== "all" && (show.countryCode ?? "").toUpperCase() !== country) return false;
      return true;
    }).slice(0, 10);
  }, [liveTV.onTheAir, favoriteKeys, hideUnscripted, language, country]);

  const filteredAiringToday = useMemo(() => {
    return liveTV.airingToday.filter((show) => {
      if (!favoriteKeys.has(favoriteKey(show.id, "tmdb"))) return false;
      const next = show.nextEpisode;
      if (next?.airdate !== today) return false;
      if (hideUnscripted && isUnscripted(show)) return false;
      if (language !== "all" && languageKey(show.language) !== language) return false;
      if (country !== "all" && (show.countryCode ?? "").toUpperCase() !== country) return false;
      return true;
    }).slice(0, 10);
  }, [liveTV.airingToday, favoriteKeys, hideUnscripted, language, country, today]);

  // Deduplicate between onTheAir and airingToday (prefer airingToday)
  const dedupedOnTheAir = useMemo(() => {
    const airingTodayIds = new Set(filteredAiringToday.map(s => s.id));
    return filteredOnTheAir.filter(s => !airingTodayIds.has(s.id));
  }, [filteredOnTheAir, filteredAiringToday]);

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div>
          <p className="text-label text-brand/90">
            امروز به وقت تهران · {todayLabel}
          </p>
          <h1 className="mt-1 text-display text-copy">
            سریال‌هایی که زیر رادار شما هستند
          </h1>
          <p className="mt-1.5 max-w-xl text-body leading-relaxed text-muted">
            فصل جدید سریال‌های قدیمی و قسمت‌های تازه، با تاریخ شمسی و یادآوری.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="جست‌وجوی سریال، شبکه یا ژانر"
            aria-label="جست‌وجوی سریال، شبکه یا ژانر"
            leadingIcon={<Search className="h-4 w-4" strokeWidth={1.8} />}
            trailing={search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="پاک کردن جست‌وجو"
                className="grid h-8 w-8 place-items-center rounded-full text-muted hover:text-white"
              >
                <X className="h-4 w-4" strokeWidth={1.8} />
              </button>
            ) : undefined}
          />
          </div>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as RadarSort)}
            aria-label="مرتب سازی"
            className="h-10 shrink-0 rounded-control border border-edge/12 bg-black/20 px-2 text-caption text-ink-200 focus:border-brand/60 focus:outline-none"
          >
            {SORT_OPTIONS.map((item) => (
              <option key={item.key} value={item.key}>{item.label}</option>
            ))}
          </select>
          <Button
            variant="secondary"
            size="icon"
            aria-label="فیلترها"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((value) => !value)}
            className="relative shrink-0"
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={1.8} />
            {activeFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-micro font-bold text-ink-950">
                {toPersianDigits(activeFilterCount)}
              </span>
            )}
          </Button>
        </div>

        {filtersOpen && (
          <div className="sr-pop space-y-4 rounded-card border border-edge/10 bg-panel/80 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-title text-copy">فیلترها</p>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  پاک کردن
                </Button>
              )}
            </div>

            <div>
              <p className="text-label text-muted">دسته</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {FILTERS.map((item) => (
                  <Chip
                    key={item.key}
                    selected={filters.category === item.key}
                    onClick={() => setFilters((prev) => ({ ...prev, category: item.key }))}
                  >
                    {item.label}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Chip
                tone="info"
                selected={filters.onlyPopular}
                onClick={() => setFilters((prev) => ({ ...prev, onlyPopular: !prev.onlyPopular }))}
              >
                فقط محبوب‌ها
              </Chip>
              <Chip
                tone="success"
                selected={hideUnscripted}
                onClick={() => setHideUnscripted((value) => !value)}
              >
                بدون رئالیتی/تاک‌شو
              </Chip>
            </div>

            <div>
              <p className="text-label text-muted">ژانر</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Chip tone="neutral" selected={genre === null} onClick={() => setGenre(null)}>
                  همه ژانرها
                </Chip>
                {GENRES.map((item) => (
                  <Chip
                    key={item}
                    tone="neutral"
                    selected={genre === item}
                    onClick={() => setGenre((prev) => (prev === item ? null : item))}
                  >
                    {genreLabel(item)}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-label text-muted">
                زبان
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  className="mt-1.5 h-10 w-full rounded-control border border-edge/12 bg-black/20 px-3 text-body text-copy focus:border-brand/60 focus:outline-none"
                >
                  {LANGUAGE_FILTERS.map((item) => (
                    <option key={item.key} value={item.key}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-label text-muted">
                کشور
                <select
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                  className="mt-1.5 h-10 w-full rounded-control border border-edge/12 bg-black/20 px-3 text-body text-copy focus:border-brand/60 focus:outline-none"
                >
                  {COUNTRY_FILTERS.map((item) => (
                    <option key={item.key} value={item.key}>{item.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}
      </section>

      {featured.length > 0 && !hasNarrowingFilters && (
        <section>
          <SectionHeader
            className="mb-3"
            title="پیشنهاد رادار"
            description="انتخاب بر اساس امتیاز، محبوبیت، نزدیکی پخش و تنوع ژانر"
          />
          <div className="sr-hide-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {featured.map((suggestion) => {
              const show = suggestion.show;
              const key = favoriteKey(show.id, show.source ?? "tvmaze");
              return (
                <div key={key} className="relative w-[148px] shrink-0">
                  <button
                    type="button"
                    aria-label="این پیشنهاد را نشان نده"
                    title="علاقه ندارم"
                    onClick={() => dismissedFeatured.dismiss(key)}
                    className="sr-no-tap absolute right-2 top-2 z-20 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-caption text-white/75 backdrop-blur active:bg-black/75"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                  <ShowCard show={show} favorite={isFavorite(show)} onToggleFavorite={toggle} />
                  <p className="mt-1 truncate text-center text-caption text-muted" title={suggestion.reasons.join(" · ")}>
                    {suggestion.reasons.join(" · ")}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Live TV - On the Air */}
      {dedupedOnTheAir.length > 0 && !hasNarrowingFilters && (
        <section>
          <SectionHeader className="mb-3" title="در حال پخش" description="روی آنتن" />
          <div className="sr-hide-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {dedupedOnTheAir.map((show: typeof liveTV.onTheAir[0]) => (
              <div key={show.id} className="w-[136px] shrink-0">
                <ShowCard show={show} favorite={isFavorite(show)} onToggleFavorite={toggle} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Live TV - Airing Today */}
      {filteredAiringToday.length > 0 && !hasNarrowingFilters && (
        <section>
          <SectionHeader className="mb-3" title="امروز پخش می‌شود" description="قسمت تازه" />
          <div className="sr-hide-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {filteredAiringToday.map((show: typeof liveTV.airingToday[0]) => (
              <div key={show.id} className="w-[136px] shrink-0">
                <ShowCard show={show} favorite={isFavorite(show)} onToggleFavorite={toggle} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* This Week - Personal Calendar */}
      {thisWeek.length > 0 && !hasNarrowingFilters && (
        <section>
          <SectionHeader
            className="mb-3"
            title="این هفته"
            description="قسمت‌های پیش‌رو و فصل‌های جدید ستاره‌ها"
          />
          <div className="space-y-2">
            {thisWeek.map((show) => {
              const next = show.nextEpisode;
              return (
                <Link
                  key={show.favoriteKey}
                  to={show.source === "tmdb" ? `/tv/${show.id}` : `/series/${show.id}`}
                  className="block"
                >
                  <article className="relative overflow-hidden rounded-card border border-edge/10 bg-panel/80">
                    <div className="flex items-center gap-3 p-3">
                      <Poster show={show} className="h-16 w-12 shrink-0 rounded-control" rounded="rounded-control" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-sky-400/90 px-2 py-0.5 text-micro font-bold text-sky-950">سریال</span>
                          <span className="text-caption text-ink-300">{show.title}</span>
                        </div>
                        <p className="text-sm font-medium text-white line-clamp-1" dir="auto">
                          {next?.name || `قسمت ${toPersianDigits(next?.number ?? 0)}`}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          {next?.season && next?.number && (
                            <span className="text-caption text-muted">
                              فصل {toPersianDigits(next.season)} • قسمت {toPersianDigits(next.number)}
                            </span>
                          )}
                          {show.airstamp && (
                            <span className="text-caption text-brand">
                              {jalaliDate(new Date(show.airstamp))}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <SectionHeader
          className="mb-4"
          title={schedule.loading ? "در حال دریافت برنامه" : `${toPersianDigits(filtered.length)} سریال زیر رادار`}
          description={hasFilters ? "فیلترها اعمال شده‌اند" : "بر اساس زمان پخش به وقت تهران"}
          action={
            <div className="flex items-center gap-1">
              <Button
                variant={view === "grid" ? "secondary" : "ghost"}
                size="icon"
                className="h-9 w-9"
                aria-label="نمایش کارت‌ها"
                onClick={() => setView("grid")}
              >
                <LayoutGrid className="h-4 w-4" strokeWidth={1.8} />
              </Button>
              <Button
                variant={view === "list" ? "secondary" : "ghost"}
                size="icon"
                className="h-9 w-9"
                aria-label="نمایش فهرستی"
                onClick={() => setView("list")}
              >
                <List className="h-4 w-4" strokeWidth={1.8} />
              </Button>
              <Button
                variant={view === "compact" ? "secondary" : "ghost"}
                size="icon"
                className="h-9 w-9"
                aria-label="نمایش فشرده"
                onClick={() => setView("compact")}
              >
                <Rows3 className="h-4 w-4" strokeWidth={1.8} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                aria-label="به‌روزرسانی داده‌ها"
                onClick={schedule.refresh}
              >
                <RefreshCw className={`h-4 w-4 ${schedule.refreshing ? "animate-spin" : ""}`} strokeWidth={1.8} />
              </Button>
            </div>
          }
        />

        {schedule.error && (
          <div className="mb-4 rounded-control border border-danger/25 bg-danger/10 px-3 py-2 text-caption text-danger flex items-center justify-between gap-2">
            <span>{schedule.error} — دادهٔ ذخیره‌شده نمایش داده می‌شود.</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={schedule.refresh}
              disabled={schedule.refreshing}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${schedule.refreshing ? "animate-spin" : ""}`} strokeWidth={1.8} />
              تلاش مجدد
            </Button>
          </div>
        )}

        {schedule.loading && schedule.shows.length <= 6 ? (
          <SkeletonCards count={8} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Radar className="h-5 w-5" strokeWidth={1.8} />}
            title="سریالی با این فیلترها پیدا نشد"
            description="فیلترها را پاک کنید، «فقط محبوب‌ها» را خاموش کنید یا عبارت دیگری جست‌وجو کنید."
            compact
            action={hasFilters ? (
              <Button variant="primary" size="sm" onClick={clearFilters}>
                پاک کردن فیلترها
              </Button>
            ) : undefined}
          />
        ) : view === "grid" ? (
          <div className="space-y-6">
            {groups.map((group) => {
              const isExpanded = expandedGroups.has(group.key);
              const displayShows = isExpanded ? group.shows : group.shows.slice(0, 20);
              const hasMore = group.shows.length > 20 && !isExpanded;
              return (
                <div key={group.key}>
                  <div className="mb-2.5 flex items-baseline gap-2">
                    <h3 className="text-title font-bold text-white">{group.title}</h3>
                    <span className="text-caption text-muted">{toPersianDigits(group.shows.length)} سریال</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {displayShows.map((show) => (
                      <ShowCard
                        key={show.id}
                        show={show}
                        favorite={isFavorite(show)}
                        onToggleFavorite={toggle}
                      />
                    ))}
                  </div>
                  {hasMore && (
                    <button
                      type="button"
                      onClick={() => setExpandedGroups((prev) => new Set(prev).add(group.key))}
                      className="mt-2 w-full rounded-control border border-edge/12 bg-white/4 px-3 py-1.5 text-caption text-ink-200 hover:bg-white/8"
                    >
                      نمایش {toPersianDigits(group.shows.length - 20)} مورد دیگر
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : view === "compact" ? (
          <div className="space-y-6">
            {groups.map((group) => {
              const isExpanded = expandedGroups.has(group.key);
              const displayShows = isExpanded ? group.shows : group.shows.slice(0, 30);
              const hasMore = group.shows.length > 30 && !isExpanded;
              return (
                <div key={group.key}>
                  <div className="mb-2 flex items-baseline gap-2">
                    <h3 className="text-title font-bold text-white">{group.title}</h3>
                    <span className="text-caption text-muted">{toPersianDigits(group.shows.length)} سریال</span>
                  </div>
                  <div className="space-y-1">
                    {displayShows.map((show) => (
                      <CompactShowRow
                        key={show.id}
                        show={show}
                        favorite={isFavorite(show)}
                        onToggleFavorite={toggle}
                      />
                    ))}
                  </div>
                  {hasMore && (
                    <button
                      type="button"
                      onClick={() => setExpandedGroups((prev) => new Set(prev).add(group.key))}
                      className="mt-2 w-full rounded-control border border-edge/12 bg-white/4 px-3 py-1.5 text-caption text-ink-200 hover:bg-white/8"
                    >
                      نمایش {toPersianDigits(group.shows.length - 30)} مورد دیگر
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => {
              const isExpanded = expandedGroups.has(group.key);
              const displayShows = isExpanded ? group.shows : group.shows.slice(0, 25);
              const hasMore = group.shows.length > 25 && !isExpanded;
              return (
                <div key={group.key}>
                  <div className="mb-2.5 flex items-baseline gap-2">
                    <h3 className="text-title font-bold text-white">{group.title}</h3>
                    <span className="text-caption text-muted">{toPersianDigits(group.shows.length)} سریال</span>
                  </div>
                  <div className="space-y-2">
                    {displayShows.map((show) => (
                      <ShowRow
                        key={show.id}
                        show={show}
                        favorite={isFavorite(show)}
                        onToggleFavorite={toggle}
                      />
                    ))}
                  </div>
                  {hasMore && (
                    <button
                      type="button"
                      onClick={() => setExpandedGroups((prev) => new Set(prev).add(group.key))}
                      className="mt-2 w-full rounded-control border border-edge/12 bg-white/4 px-3 py-1.5 text-caption text-ink-200 hover:bg-white/8"
                    >
                      نمایش {toPersianDigits(group.shows.length - 25)} مورد دیگر
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-card border border-edge/10 bg-panel/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-title text-white">دربارهٔ رادار</h3>
            <p className="mt-1 text-caption leading-relaxed text-muted">
              دادهها از TMDB گرفته میشوند و هر ۶ ساعت بهروزرسانی میشوند. TMDB ساعت دقیق پخش نمیدهد؛ بنابراین فقط تاریخ قسمت نمایش داده میشود و یادآورها ساعت ۹ صبح تهران در روز پخش تنظیم میشوند.
            </p>
          </div>
          <Link to="/settings" className="shrink-0 rounded-control border border-edge/10 bg-white/5 px-3 py-1.5 text-caption text-ink-200">
            تنظیمات
          </Link>
        </div>
      </section>
    </div>
  );
}export default RadarPage;
