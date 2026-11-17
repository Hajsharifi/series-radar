import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFavorites } from "../hooks/useFavorites";
import { useScheduleContext } from "../hooks/ScheduleContext";
import {
  filterShows,
  groupShows,
  useDebounced,
  useFavoriteIds,
  useNowTicker,
  type ShowFilters,
} from "../hooks/useSchedule";
import { useLiveTVSections, useThisWeekEpisodes } from "../hooks/useLiveTV";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { CATEGORY_LABEL, genreLabel } from "../lib/labels";
import { toPersianDigits, jalaliDate } from "../lib/date";
import type { Show } from "../types";
import { ShowCard, ShowRow } from "../components/ShowCard";
import { Poster } from "../components/Poster";

const FILTERS: Array<{ key: ShowFilters["category"]; label: string }> = [
  { key: "all", label: "همه" },
  { key: "new", label: CATEGORY_LABEL.new },
  { key: "returning", label: CATEGORY_LABEL.returning },
];

const GENRES = ["Drama", "Comedy", "Crime", "Thriller", "Sci-Fi", "Fantasy", "Animation", "Documentary"];

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

export function RadarPage() {
  const schedule = useScheduleContext();
  const now = useNowTicker(30_000);
  const favorites = useFavorites();
  const favoriteIds = useFavoriteIds();

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ShowFilters>({ search: "", category: "all", onlyPopular: true });
  const [genre, setGenre] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");

  usePullToRefresh(() => schedule.refresh(), { threshold: 80 });

  const debouncedSearch = useDebounced(search, 250);
  const effectiveFilters = useMemo(() => ({ ...filters, search: debouncedSearch }), [filters, debouncedSearch]);

  const filtered = useMemo(() => {
    // A text search should always reach the whole catalogue, even when the
    // "popular only" toggle is on.
    const scoped = { ...effectiveFilters, onlyPopular: effectiveFilters.onlyPopular && !effectiveFilters.search };
    const base = filterShows(schedule.shows, scoped, now);
    return genre ? base.filter((show) => (show.genres ?? []).includes(genre)) : base;
  }, [schedule.shows, effectiveFilters, genre, now]);

  const groups = useMemo(() => groupShows(filtered, now), [filtered, now]);

  const featured = useMemo(() => {
    const upcoming = filtered.filter((show) => show.airstamp);
    const soon = upcoming.filter((show) => new Date(show.airstamp!).getTime() - now < 14 * 86_400_000);
    const pool = soon.length >= 4 ? soon : upcoming;
    return [...pool]
      .sort((a, b) => {
        const weightDiff = (b.weight ?? 0) - (a.weight ?? 0);
        if (weightDiff !== 0) return weightDiff;
        return (a.airstamp ?? "").localeCompare(b.airstamp ?? "");
      })
      .slice(0, 6);
  }, [filtered, now]);

  const toggle = useCallback((show: Show) => favorites.toggle(show.id), [favorites]);

  const hasFilters = filters.category !== "all" || !!genre || !!debouncedSearch;

  // Live TV hooks
  const liveTV = useLiveTVSections();
  const thisWeek = useThisWeekEpisodes(Array.from(favoriteIds));

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
              placeholder="جست‌وجوی سریال، شبکه یا ژانر"
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
        </div>
      </section>

      {featured.length > 0 && !hasFilters && (
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">پیشنهاد رادار</h2>
            <span className="text-[11px] text-ink-400">محبوب‌ترین‌های نزدیک</span>
          </div>
          <div className="sr-hide-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {featured.map((show) => (
              <div key={show.id} className="w-[136px] shrink-0">
                <ShowCard show={show} favorite={favoriteIds.has(show.id)} onToggleFavorite={toggle} />
              </div>
            ))}
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
                <ShowCard show={show} favorite={favoriteIds.has(show.id)} onToggleFavorite={toggle} />
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
                <ShowCard show={show} favorite={favoriteIds.has(show.id)} onToggleFavorite={toggle} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* This Week - Personal Calendar */}
      {thisWeek.data && thisWeek.data.length > 0 && !hasFilters && (
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">این هفته</h2>
            <span className="text-[11px] text-ink-400">قسمت‌های پیش‌رو سریال‌های ستاره‌دار</span>
          </div>
          <div className="space-y-2">
            {thisWeek.data.slice(0, 10).map((ep) => (
              <Link key={ep.id} to={"/series/" + ep.showId} className="block">
                <article className="relative overflow-hidden rounded-2xl border border-white/8 bg-ink-850/70">
                  <div className="flex items-center gap-3 p-3">
                    {ep.show?.posterPath && (
                      <Poster
                        show={{ id: ep.showId, title: ep.show?.title || "", posterPath: ep.show.posterPath, posterOriginal: ep.show.posterOriginal, category: "returning" as const }}
                        className="h-16 w-12 shrink-0 rounded-xl"
                        rounded="rounded-xl"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-sky-400/90 px-2 py-0.5 text-[10px] font-bold text-sky-950">سریال</span>
                        <span className="text-[11px] text-ink-300">{ep.show?.title || "نامشخص"}</span>
                      </div>
                      <p className="text-sm font-medium text-white line-clamp-1" dir="auto">{ep.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-ink-400">فصل {ep.season} • قسمت {ep.number}</span>
                        {ep.airdate && (
                          <span className="text-[11px] text-amber-300">
                            {jalaliDate(new Date(ep.airdate + "T12:00:00"))}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              </Link>
            ))}
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <SkeletonCard key={index} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-ink-850/60 px-4 py-10 text-center">
            <p className="text-sm font-semibold text-white">سریالی با این فیلترها پیدا نشد</p>
            <p className="mt-1 text-xs text-ink-400">
              فیلترها را پاک کنید، «فقط محبوب‌ها» را خاموش کنید یا عبارت دیگری جست‌وجو کنید.
            </p>
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setGenre(null);
                  setFilters({ search: "", category: "all", onlyPopular: true });
                }}
                className="mt-3 rounded-lg bg-amber-400 px-3.5 py-1.5 text-xs font-semibold text-ink-950"
              >
                پاک کردن فیلترها
              </button>
            )}
          </div>
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
                      favorite={favoriteIds.has(show.id)}
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
                      favorite={favoriteIds.has(show.id)}
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
