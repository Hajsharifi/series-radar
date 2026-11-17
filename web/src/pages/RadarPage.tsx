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
  tehranClock,
  tehranParts,
  toIsoDay,
} from "../lib/date";
import type { Show } from "../types";
import { ShowCard, ShowRow } from "../components/ShowCard";
import { CompactShowRow } from "../components/CompactShowRow";
import { EmptyState, SkeletonCards } from "../components/StateViews";
import { Poster } from "../components/Poster";

const FILTERS: Array<{ key: ShowFilters["category"]; label: string }> = [
  { key: "all", label: "همه" },
  { key: "new", label: CATEGORY_LABEL.new },
  { key: "returning", label: CATEGORY_LABEL.returning },
];

const GENRES = ["Drama", "Comedy", "Crime", "Thriller", "Sci-Fi", "Fantasy", "Animation", "Documentary"];

const UNSCRIPTED_GENRES = new Set([
  "Reality", "Talk Show", "Game Show", "رئالیتی", "تاک‌شو", "مسابقه",
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
  const now = useNowTicker(30_000);
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
  const [hideUnscripted, setHideUnscripted] = useState<boolean>(() => readUiState("radar.hideUnscripted", false));
  const [language, setLanguage] = useState<string>(() => readUiState("radar.language", "all"));
  const [country, setCountry] = useState<string>(() => readUiState("radar.country", "all"));

  useEffect(() => writeUiState("radar.category", filters.category), [filters.category]);
  useEffect(() => writeUiState("radar.onlyPopular", filters.onlyPopular), [filters.onlyPopular]);
  useEffect(() => writeUiState("radar.genre", genre), [genre]);
  useEffect(() => writeUiState("radar.view", view), [view]);
  useEffect(() => writeUiState("radar.hideUnscripted", hideUnscripted), [hideUnscripted]);
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
    return base;
  }, [schedule.shows, effectiveFilters, genre, hideUnscripted, language, country, now]);

  const groups = useMemo(() => groupShows(filtered, now), [filtered, now]);

  const toggle = useCallback(
    (show: Show) => favorites.toggle(show.id, show.source ?? "tvmaze"),
    [favorites],
  );
  const isFavorite = useCallback(
    (show: Show) => favoriteKeys.has(favoriteKey(show.id, show.source ?? "tvmaze")),
    [favoriteKeys],
  );

  const hasFilters = filters.category !== "all" || !!genre || !!debouncedSearch || hideUnscripted || language !== "all" || country !== "all";

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
        return at >= now - 6 * 3_600_000 && at <= weekLater;
      })
      .sort((a, b) => (a.airstamp ?? "").localeCompare(b.airstamp ?? ""))
      .slice(0, 10);
  }, [favoriteEpisodes.items, now]);

  // Tonight = any episode airing on the current Tehran day, from both sources.
  const tonight = useMemo(() => {
    const today = toIsoDay(dateAfterDays(0));
    const found: Array<{
      key: string;
      title: string;
      subtitle: string;
      clock: string;
      path: string;
      source: "tmdb" | "tvmaze";
      posterPath?: string | null;
      posterOriginal?: string | null;
    }> = [];

    for (const show of schedule.shows) {
      if (!show.airstamp) continue;
      const parts = tehranParts(show.airstamp);
      if (!parts || toIsoDay({ y: parts.y, m: parts.m, d: parts.d }) !== today) continue;
      found.push({
        key: `tvmaze-${show.id}`,
        title: show.title,
        subtitle: show.seasonNumber ? `فصل ${toPersianDigits(show.seasonNumber)}` : show.network ?? "سریال",
        clock: tehranClock(show.airstamp),
        path: `/show/${show.id}`,
        source: "tvmaze",
        posterPath: show.posterPath,
        posterOriginal: show.posterOriginal,
      });
    }

    const seen = new Set<number>();
    for (const show of [...liveTV.airingToday, ...liveTV.onTheAir]) {
      if (seen.has(show.id)) continue;
      seen.add(show.id);
      const next = show.nextEpisode;
      if (next?.airdate !== today) continue;
      found.push({
        key: `tmdb-${show.id}`,
        title: show.title,
        subtitle:
          next.season && next.number
            ? `فصل ${toPersianDigits(next.season)} · قسمت ${toPersianDigits(next.number)}`
            : show.network ?? "سریال",
        clock: "امروز",
        path: `/tv/${show.id}`,
        source: "tmdb",
        posterPath: show.posterPath,
        posterOriginal: show.posterOriginal,
      });
    }
    return found.slice(0, 4);
  }, [schedule.shows, liveTV.airingToday, liveTV.onTheAir]);

  const featured = useMemo(() => {
    const byKey = new Map(
      schedule.shows.map((show) => [favoriteKey(show.id, show.source ?? "tvmaze"), show]),
    );
    const favoriteGenres = favorites.items.flatMap(
      (item) => byKey.get(favoriteKey(item.showId, item.source))?.genres ?? [],
    );
    const excludedKeys = new Set<string>();
    tonight.forEach((item) => {
      const [source, id] = item.key.split("-");
      excludedKeys.add(`${source}:${id}`);
    });
    [...liveTV.onTheAir, ...liveTV.airingToday].forEach((show) => excludedKeys.add(`tmdb:${show.id}`));
    return rankFeaturedSuggestions(filtered, {
      now,
      favoriteKeys,
      favoriteGenres,
      excludedKeys,
      dismissedKeys: dismissedFeatured.keys,
      limit: 6,
    });
  }, [filtered, now, favorites.items, favoriteKeys, schedule.shows, tonight, liveTV.onTheAir, liveTV.airingToday, dismissedFeatured.keys]);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-br from-ink-850 via-ink-900 to-ink-950 p-5">
        <div className="pointer-events-none absolute -top-16 left-6 h-40 w-40 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 right-0 h-44 w-44 rounded-full bg-sky-500/10 blur-3xl" />

        <div className="relative flex flex-col gap-4">
          <div>
            <p className="text-[11px] font-medium tracking-wide text-amber-300/90">امروز به وقت تهران</p>
            <h2 className="mt-1 text-2xl font-extrabold leading-snug text-white">
              سریال‌هایی که <span className="text-amber-300">زیر رادار</span> شما هستند
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-300">
              فصل جدید سریال‌های قدیمی و سریال‌های تازه، با تاریخ شمسی و یادآوری.
            </p>
          </div>

          <div className="relative">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="جست‌وجوی سریال، شبکه یا ژانر" aria-label="جست‌وجوی سریال، شبکه یا ژانر"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-white placeholder:text-ink-400 focus:border-amber-400/60 focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="پاک کردن جست‌وجو"
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-xs text-ink-400"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, category: item.key }))}
                className={`sr-no-tap rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  filters.category === item.key
                    ? "bg-amber-400 text-ink-950"
                    : "border border-white/10 bg-white/5 text-ink-300"
                }`}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, onlyPopular: !prev.onlyPopular }))}
              className={`sr-no-tap rounded-full px-3 py-1.5 text-xs font-medium transition ${
                filters.onlyPopular
                  ? "bg-sky-400/20 text-sky-200 ring-1 ring-sky-400/40"
                  : "border border-white/10 bg-white/5 text-ink-300"
              }`}
            >
              فقط محبوب‌ها
            </button>
            <button
              type="button"
              onClick={() => setHideUnscripted((value) => !value)}
              className={`sr-no-tap rounded-full px-3 py-1.5 text-xs font-medium transition ${
                hideUnscripted
                  ? "bg-emerald-400/20 text-emerald-200 ring-1 ring-emerald-400/40"
                  : "border border-white/10 bg-white/5 text-ink-300"
              }`}
            >
              بدون رئالیتی/تاک‌شو
            </button>
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
                {genreLabel(item)}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="radar-language" className="text-[11px] text-ink-400">زبان</label>
              <select
                id="radar-language"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] text-ink-200"
              >
                {LANGUAGE_FILTERS.map((item) => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="radar-country" className="text-[11px] text-ink-400">کشور</label>
              <select
                id="radar-country"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] text-ink-200"
              >
                {COUNTRY_FILTERS.map((item) => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Tonight - a compact highlight built from both data sources */}
      {tonight.length > 0 && !hasFilters && (
        <section className="overflow-hidden rounded-3xl border border-amber-400/25 bg-gradient-to-br from-amber-500/10 via-ink-850 to-ink-900 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-white">امشب به وقت تهران</h2>
              <p className="mt-0.5 text-[11px] text-ink-400">{jalaliFromStamp(new Date().toISOString())}</p>
            </div>
            <Link to="/calendar" className="sr-no-tap rounded-lg bg-white/8 px-3 py-1.5 text-[11px] text-ink-200">
              تقویم هفت روزه ←
            </Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {tonight.map((item) => (
              <Link key={item.key} to={item.path} className="sr-no-tap flex items-center gap-3 rounded-2xl border border-white/8 bg-black/20 p-2.5">
                <Poster
                  show={{
                    id: Number(item.key.replace(/\D/g, "")) || 0,
                    title: item.title,
                    posterPath: item.posterPath,
                    posterOriginal: item.posterOriginal,
                    category: "returning",
                    source: item.source,
                  }}
                  className="h-14 w-11 shrink-0 rounded-lg"
                  rounded="rounded-lg"
                />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-xs font-bold text-white" dir="auto">{item.title}</p>
                  <p className="mt-0.5 line-clamp-1 text-[10px] text-ink-400">{item.subtitle}</p>
                </div>
                <span className="shrink-0 text-[11px] font-bold tabular-nums text-amber-300">{item.clock}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {featured.length > 0 && !hasFilters && (
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">پیشنهاد رادار</h2>
            <span className="text-[11px] text-ink-400">امتیاز، محبوبیت، نزدیکی پخش و تنوع ژانر</span>
          </div>
          <div className="sr-hide-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {featured.map((suggestion) => {
              const show = suggestion.show;
              const key = favoriteKey(show.id, show.source ?? "tvmaze");
              return (
                <div key={key} className="relative w-[136px] shrink-0">
                  <button
                    type="button"
                    aria-label="این پیشنهاد را نشان نده"
                    title="علاقه ندارم"
                    onClick={() => dismissedFeatured.dismiss(key)}
                    className="sr-no-tap absolute right-2 top-2 z-20 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-[11px] text-white/75 backdrop-blur active:bg-black/75"
                  >
                    ✕
                  </button>
                  <ShowCard show={show} favorite={isFavorite(show)} onToggleFavorite={toggle} />
                  <p className="mt-1 truncate text-center text-[9px] text-ink-400" title={suggestion.reasons.join(" · ")}>
                    {suggestion.reasons.join(" · ")}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Live TV - On the Air */}
      {liveTV.onTheAir.length > 0 && !hasFilters && (
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">در حال پخش</h2>
            <span className="text-[11px] text-ink-400">روی آنتن</span>
          </div>
          <div className="sr-hide-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {liveTV.onTheAir.slice(0, 10).map((show: typeof liveTV.onTheAir[0]) => (
              <div key={show.id} className="w-[136px] shrink-0">
                <ShowCard show={show} favorite={isFavorite(show)} onToggleFavorite={toggle} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Live TV - Airing Today */}
      {liveTV.airingToday.length > 0 && !hasFilters && (
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">امروز پخش می‌شود</h2>
            <span className="text-[11px] text-ink-400">قسمت تازه</span>
          </div>
          <div className="sr-hide-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {liveTV.airingToday.slice(0, 10).map((show: typeof liveTV.airingToday[0]) => (
              <div key={show.id} className="w-[136px] shrink-0">
                <ShowCard show={show} favorite={isFavorite(show)} onToggleFavorite={toggle} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* This Week - Personal Calendar */}
      {thisWeek.length > 0 && !hasFilters && (
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">این هفته</h2>
            <span className="text-[11px] text-ink-400">قسمت‌های پیش‌رو و فصل‌های جدید ستاره‌ها</span>
          </div>
          <div className="space-y-2">
            {thisWeek.map((show) => {
              const next = show.nextEpisode;
              return (
                <Link
                  key={show.favoriteKey}
                  to={show.source === "tmdb" ? `/tv/${show.id}` : `/series/${show.id}`}
                  className="block"
                >
                  <article className="relative overflow-hidden rounded-2xl border border-white/8 bg-ink-850/70">
                    <div className="flex items-center gap-3 p-3">
                      <Poster show={show} className="h-16 w-12 shrink-0 rounded-xl" rounded="rounded-xl" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-sky-400/90 px-2 py-0.5 text-[10px] font-bold text-sky-950">سریال</span>
                          <span className="text-[11px] text-ink-300">{show.title}</span>
                        </div>
                        <p className="text-sm font-medium text-white line-clamp-1" dir="auto">
                          {next?.name || `قسمت ${toPersianDigits(next?.number ?? 0)}`}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          {next?.season && next?.number && (
                            <span className="text-[11px] text-ink-400">
                              فصل {toPersianDigits(next.season)} • قسمت {toPersianDigits(next.number)}
                            </span>
                          )}
                          {show.airstamp && (
                            <span className="text-[11px] text-amber-300">
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
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-white">
              {schedule.loading ? "در حال دریافت برنامه" : `${toPersianDigits(filtered.length)} سریال زیر رادار`}
            </h2>
            <p className="mt-0.5 text-[11px] text-ink-400">
              {hasFilters ? "فیلترها اعمال شده‌اند" : "بر اساس زمان پخش به وقت تهران"}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setView("grid")}
              aria-label="نمایش کارت‌ها"
              className={`rounded-lg px-2.5 py-1.5 text-xs ${view === "grid" ? "bg-white/15 text-white" : "bg-white/4 text-ink-400"}`}
            >
              ▦
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              aria-label="نمایش فهرستی"
              className={`rounded-lg px-2.5 py-1.5 text-xs ${view === "list" ? "bg-white/15 text-white" : "bg-white/4 text-ink-400"}`}
            >
              ☰
            </button>
            <button
              type="button"
              onClick={() => setView("compact")}
              aria-label="نمایش فشرده"
              className={`rounded-lg px-2.5 py-1.5 text-xs ${view === "compact" ? "bg-white/15 text-white" : "bg-white/4 text-ink-400"}`}
            >
              ≣
            </button>
            <button
              type="button"
              onClick={schedule.refresh}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-ink-200 active:bg-white/10"
            >
              {schedule.refreshing ? "…" : "به‌روزرسانی"}
            </button>
          </div>
        </div>

        {schedule.error && (
          <div className="mb-4 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {schedule.error} — دادهٔ ذخیره‌شده نمایش داده می‌شود.
          </div>
        )}

        {schedule.loading && schedule.shows.length <= 6 ? (
          <SkeletonCards count={8} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="◉"
            title="سریالی با این فیلترها پیدا نشد"
            description="فیلترها را پاک کنید، «فقط محبوب‌ها» را خاموش کنید یا عبارت دیگری جست‌وجو کنید."
            compact
            action={hasFilters ? (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setGenre(null);
                  setHideUnscripted(false);
                  setLanguage("all");
                  setCountry("all");
                  setFilters({ search: "", category: "all", onlyPopular: true });
                }}
                className="rounded-lg bg-amber-400 px-3.5 py-1.5 text-xs font-semibold text-ink-950"
              >
                پاک کردن فیلترها
              </button>
            ) : undefined}
          />
        ) : view === "grid" ? (
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.key}>
                <div className="mb-2.5 flex items-baseline gap-2">
                  <h3 className="text-sm font-bold text-white">{group.title}</h3>
                  <span className="text-[11px] text-ink-400">{toPersianDigits(group.shows.length)} سریال</span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {group.shows.map((show) => (
                    <ShowCard
                      key={show.id}
                      show={show}
                      favorite={isFavorite(show)}
                      onToggleFavorite={toggle}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : view === "compact" ? (
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.key}>
                <div className="mb-2 flex items-baseline gap-2">
                  <h3 className="text-sm font-bold text-white">{group.title}</h3>
                  <span className="text-[11px] text-ink-400">{toPersianDigits(group.shows.length)} سریال</span>
                </div>
                <div className="space-y-1">
                  {group.shows.map((show) => (
                    <CompactShowRow
                      key={show.id}
                      show={show}
                      favorite={isFavorite(show)}
                      onToggleFavorite={toggle}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.key}>
                <div className="mb-2.5 flex items-baseline gap-2">
                  <h3 className="text-sm font-bold text-white">{group.title}</h3>
                  <span className="text-[11px] text-ink-400">{toPersianDigits(group.shows.length)} سریال</span>
                </div>
                <div className="space-y-2">
                  {group.shows.map((show) => (
                    <ShowRow
                      key={show.id}
                      show={show}
                      favorite={isFavorite(show)}
                      onToggleFavorite={toggle}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/8 bg-ink-850/50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">دربارهٔ رادار</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-400">
              داده‌ها از TVMaze گرفته می‌شوند؛ برنامهٔ امروز و فردا هر دقیقه و فهرست کامل هر ۶ ساعت به‌روزرسانی
              می‌شود. تاریخ‌ها به وقت تهران نمایش داده می‌شوند.
            </p>
          </div>
          <Link to="/settings" className="shrink-0 rounded-lg bg-white/6 px-3 py-1.5 text-xs text-ink-200">
            تنظیمات
          </Link>
        </div>
      </section>
    </div>
  );
}export default RadarPage;
