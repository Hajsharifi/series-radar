import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useScheduleContext } from "../hooks/ScheduleContext";
import { useFavoriteKeys } from "../hooks/useSchedule";
import { useFavoriteEpisodes } from "../hooks/useFavoriteEpisodes";
import { favoriteKey } from "../lib/favorites";
import { useLiveTVSections } from "../hooks/useLiveTV";
import { useMovieCatalog, useMovieFavorites } from "../hooks/useMovies";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import {
  dateAfterDays,
  jalaliDate,
  jalaliDateParts,
  jalaliParts,
  tehranClock,
  tehranParts,
  toIsoDay,
  toPersianDigits,
  weekdayName,
} from "../lib/date";
import { movieStage, tehranTodayISO } from "../lib/movies";
import { Poster } from "../components/Poster";
import { buildIcs, downloadTextFile, icsFilename } from "../lib/ics";
import { EmptyState } from "../components/StateViews";
import { CalendarDays, Star } from "lucide-react";
import { isNativeApp, saveCalendarFile } from "../lib/native";

interface CalendarItem {
  key: string;
  day: string;
  title: string;
  subtitle: string;
  clock: string;
  path: string;
  source: "tmdb" | "tvmaze";
  kind: "series" | "movie";
  posterPath?: string | null;
  posterOriginal?: string | null;
  favorite: boolean;
}

function pad(value: number) {
  return value < 10 ? `0${value}` : String(value);
}

export default function CalendarPage() {
  const schedule = useScheduleContext();
  const favoriteKeys = useFavoriteKeys();
  const favoriteEpisodes = useFavoriteEpisodes();
  const movieFavorites = useMovieFavorites();
  const catalog = useMovieCatalog();
  const liveTV = useLiveTVSections();
  const [view, setView] = useState<"week" | "month">("week");
  const [notice, setNotice] = useState("");

  usePullToRefresh(() => schedule.refresh(), { threshold: 80 });

  const days = useMemo(() => {
    if (view === "week") {
      return Array.from({ length: 7 }, (_, index) => {
        const parts = dateAfterDays(index);
        const stamp = `${parts.y}-${pad(parts.m)}-${pad(parts.d)}T12:00:00Z`;
        const tehran = tehranParts(stamp);
        return {
          key: toIsoDay(parts),
          label: index === 0 ? "امروز" : index === 1 ? "فردا" : weekdayName(stamp),
          jalali: tehran ? jalaliDate(tehran.date) : "—",
          count: 0,
          today: index === 0,
        };
      });
    }
    const today = dateAfterDays(0);
    const todayKey = toIsoDay(today);
    const todayDate = new Date(today.y, today.m - 1, today.d, 12);
    const todayJalali = jalaliParts(todayDate);
    const startOffset = -(todayJalali.jd - 1);
    const result: Array<{
      key: string;
      label: string;
      jalali: string;
      count: number;
      today: boolean;
    }> = [];
    for (let index = 0; index < 32; index += 1) {
      const parts = dateAfterDays(startOffset + index);
      const date = new Date(parts.y, parts.m - 1, parts.d, 12);
      const jalali = jalaliParts(date);
      if (index > 0 && jalali.jd === 1) break;
      const key = toIsoDay(parts);
      result.push({
        key,
        label: toPersianDigits(jalali.jd),
        jalali: "",
        count: 0,
        today: key === todayKey,
      });
    }
    return result;
  }, [view]);

  const items = useMemo(() => {
    const result: CalendarItem[] = [];
    const validDays = new Set(days.map((day) => day.key));
    const seenSeries = new Set<string>();

    for (const show of schedule.shows) {
      if (!show.airstamp) continue;
      if (!favoriteKeys.has(favoriteKey(show.id, show.source ?? "tvmaze"))) continue;
      const parts = tehranParts(show.airstamp);
      if (!parts) continue;
      const day = toIsoDay({ y: parts.y, m: parts.m, d: parts.d });
      if (!validDays.has(day)) continue;
      result.push({
        key: `show-${show.id}-${day}`,
        day,
        title: show.title,
        subtitle: show.seasonNumber ? `فصل ${toPersianDigits(show.seasonNumber)}` : show.network ?? "سریال",
        clock: tehranClock(show.airstamp),
        path: `/show/${show.id}`,
        source: "tvmaze",
        kind: "series",
        posterPath: show.posterPath,
        posterOriginal: show.posterOriginal,
        favorite: favoriteKeys.has(favoriteKey(show.id, show.source ?? "tvmaze")),
      });
      seenSeries.add(favoriteKey(show.id, show.source ?? "tvmaze"));
    }

    for (const show of favoriteEpisodes.items) {
      if (!show.airstamp) continue;
      const parts = tehranParts(show.airstamp);
      if (!parts) continue;
      const day = toIsoDay({ y: parts.y, m: parts.m, d: parts.d });
      if (!validDays.has(day)) continue;
      const key = favoriteKey(show.id, show.source ?? "tvmaze");
      if (seenSeries.has(key)) continue;
      seenSeries.add(key);
      const next = show.nextEpisode;
      result.push({
        key: `fav-${key}-${day}`,
        day,
        title: show.title,
        subtitle: next?.season && next?.number
          ? `فصل ${toPersianDigits(next.season)} · قسمت ${toPersianDigits(next.number)}`
          : show.network ?? "سریال",
        clock: show.source === "tmdb" ? "زمان اعلام نشده" : tehranClock(show.airstamp),
        path: show.source === "tmdb" ? `/tv/${show.id}` : `/series/${show.id}`,
        source: show.source ?? "tvmaze",
        kind: "series",
        posterPath: show.posterPath,
        posterOriginal: show.posterOriginal,
        favorite: true,
      });
    }

    const seen = new Set<number>();
    for (const show of [...liveTV.airingToday, ...liveTV.onTheAir]) {
      if (!favoriteKeys.has(favoriteKey(show.id, "tmdb"))) continue;
      if (seen.has(show.id)) continue;
      seen.add(show.id);
      const next = show.nextEpisode;
      if (!next?.airdate || !validDays.has(next.airdate)) continue;
      result.push({
        key: `tv-${show.id}-${next.airdate}`,
        day: next.airdate,
        title: show.title,
        subtitle:
          next.season && next.number
            ? `فصل ${toPersianDigits(next.season)} · قسمت ${toPersianDigits(next.number)}`
            : show.network ?? "سریال",
        clock: "زمان اعلام نشده",
        path: `/tv/${show.id}`,
        source: "tmdb",
        kind: "series",
        posterPath: show.posterPath,
        posterOriginal: show.posterOriginal,
        favorite: favoriteKeys.has(favoriteKey(show.id, "tmdb")),
      });
    }

    // Movie theatrical releases and digital-quality releases in the visible range.
    const today = tehranTodayISO();
    for (const movie of catalog.all) {
      if (!movieFavorites.ids.has(movie.id)) continue;
      const stage = movieStage(movie);
      let day: string | null = null;
      let subtitle = "";
      if (stage === "upcoming") {
        day = movie.theatricalDate ?? movie.releaseDate ?? null;
        subtitle = "اکران سینمایی";
      } else if (stage === "quality" && movie.digitalDate && movie.digitalDate > today) {
        day = movie.digitalDate;
        subtitle = "انتشار دیجیتال";
      }
      if (!day || !validDays.has(day)) continue;
      result.push({
        key: `movie-${movie.id}-${subtitle}-${day}`,
        day,
        title: movie.title,
        subtitle,
        clock: "زمان اعلام نشده",
        path: `/movie/${movie.id}`,
        source: "tmdb",
        kind: "movie",
        posterPath: movie.posterPath,
        posterOriginal: movie.backdropPath,
        favorite: movieFavorites.ids.has(movie.id),
      });
    }
    return result;
  }, [days, favoriteKeys, favoriteEpisodes.items, movieFavorites.ids, catalog.all, liveTV.airingToday, liveTV.onTheAir, schedule.shows]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      map.set(item.day, (map.get(item.day) ?? 0) + 1);
    }
    return map;
  }, [items]);

  const [activeDay, setActiveDay] = useState<string | null>(null);
  const selected = activeDay && counts.has(activeDay) ? activeDay : days.find((day) => counts.has(day.key))?.key ?? days[0].key;
  const visible = items
    .filter((item) => item.day === selected)
    .sort((a, b) => a.clock.localeCompare(b.clock) || a.title.localeCompare(b.title, "fa"));

  const monthLabel = useMemo(() => {
    if (view !== "month" || days.length === 0) return "";
    const parts = jalaliDateParts(new Date(`${days[0].key}T12:00:00`));
    return `${parts.month} ${parts.year}`;
  }, [days, view]);

  const leadingBlanks = view === "month" && days.length > 0
    ? (new Date(`${days[0].key}T12:00:00`).getDay() + 1) % 7
    : 0;

  function exportCalendar() {
    const source = items;
    if (source.length === 0) {
      setNotice("موردی برای خروجی وجود ندارد.");
      return;
    }
    const content = buildIcs(
      source.map((item) => ({
        key: item.key,
        day: item.day,
        title: item.title,
        subtitle: item.subtitle,
        clock: item.clock,
      })),
    );
    const filename = icsFilename();
    if (isNativeApp() && saveCalendarFile(filename, content)) {
      setNotice("فایل تقویم ذخیره شد.");
      window.setTimeout(() => setNotice(""), 4000);
      return;
    }
    downloadTextFile(filename, content, "text/calendar;charset=utf-8");
    setNotice("فایل تقویم دانلود شد.");
    window.setTimeout(() => setNotice(""), 4000);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-caption font-medium tracking-wide text-amber-300/90">
            {view === "week" ? "برنامهٔ هفت روزه" : "برنامهٔ ماهانه"}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-white">تقویم سریال‌ها و فیلم‌ها</h1>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-300">
            قسمتهای پیشرو، اکران سینمایی و انتشار دیجیتال فقط برای سریالها و فیلمهای ستارهدار، در {view === "week" ? "هفت روز آینده" : "ماه جاری"} به وقت تهران.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setView(view === "week" ? "month" : "week")}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-caption text-ink-200"
          >
            {view === "week" ? "نمای ماهانه" : "نمای هفتگی"}
          </button>
          <button
            type="button"
            onClick={exportCalendar}
            className="rounded-lg bg-emerald-400 px-3 py-2 text-caption font-semibold text-emerald-950"
          >
            خروجی تقویم
          </button>
        </div>
      </header>

      {notice && (
        <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-500/8 px-3 py-2 text-caption text-emerald-200">
          {notice}
        </p>
      )}

      {view === "week" ? (
        <div className="sr-hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {days.map((day) => {
            const count = counts.get(day.key) ?? 0;
            const active = selected === day.key;
            return (
              <button
                key={day.key}
                type="button"
                aria-pressed={active}
                onClick={() => setActiveDay(day.key)}
                className={`sr-no-tap flex w-[74px] shrink-0 flex-col items-center rounded-card border px-2 py-2.5 transition ${
                  active ? "border-amber-400/60 bg-amber-400/15" : "border-edge/10 bg-panel/70"
                }`}
              >
                <span className={`text-caption font-semibold ${active ? "text-amber-200" : "text-ink-300"}`}>{day.label}</span>
                <span className="mt-1 text-micro leading-tight text-muted">{day.jalali}</span>
                <span className="mt-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-white/8 px-1 text-micro font-bold text-white">
                  {toPersianDigits(count)}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-card border border-edge/10 bg-panel/70 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">{monthLabel}</h2>
            <span className="text-caption text-muted">{toPersianDigits(days.length)} روز</span>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {["ش", "ی", "د", "س", "چ", "پ", "ج"].map((label) => (
              <span key={label} className="py-1 text-micro text-muted">{label}</span>
            ))}
            {Array.from({ length: leadingBlanks }).map((_, index) => (
              <span key={`blank-${index}`} />
            ))}
            {days.map((day) => {
              const count = counts.get(day.key) ?? 0;
              const active = selected === day.key;
              return (
                <button
                  key={day.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setActiveDay(day.key)}
                  className={`sr-no-tap flex min-h-12 flex-col items-center justify-center rounded-xl border text-caption transition ${
                    active
                      ? "border-amber-400/60 bg-amber-400/15 text-amber-100"
                      : day.today
                        ? "border-sky-400/40 bg-sky-400/10 text-sky-100"
                        : "border-edge/10 bg-black/20 text-ink-200"
                  }`}
                >
                  <span className="font-bold">{day.label}</span>
                  {count > 0 && (
                    <span className="mt-0.5 rounded-full bg-white/10 px-1.5 text-micro text-white">
                      {toPersianDigits(count)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-white">
          {days.find((day) => day.key === selected)?.label} · {toPersianDigits(visible.length)} مورد
        </h2>
        <span className="sr-no-tap flex items-center gap-1 rounded-full bg-amber-400/15 px-3 py-1.5 text-caption font-semibold text-amber-200">
          <Star className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} />
          فقط ستارهها
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-5 w-5" strokeWidth={1.8} />}
          title="موردی برای این روز ثبت نشده"
          description="روز دیگری را از بالا انتخاب کنید یا سریال/فیلمی را ستاره دار کنید."
          compact
        />
      ) : (
        <div className="space-y-2">
          {visible.map((item) => {
            const badge =
              item.kind === "movie"
                ? item.subtitle === "انتشار دیجیتال"
                  ? { text: "دیجیتال", className: "bg-emerald-400/90 text-emerald-950" }
                  : { text: "اکران", className: "bg-sky-400/90 text-sky-950" }
                : item.source === "tmdb"
                  ? { text: "روی آنتن", className: "bg-sky-400/90 text-sky-950" }
                  : { text: "رادار", className: "bg-amber-400/90 text-ink-950" };
            return (
              <Link key={item.key} to={item.path} className="sr-no-tap block">
                <article className="flex items-center gap-3 rounded-card border border-edge/10 bg-panel/80 p-3">
                  <Poster
                    show={{
                      id: Number(item.key.replace(/\D/g, "")) || 0,
                      title: item.title,
                      posterPath: item.posterPath,
                      posterOriginal: item.posterOriginal,
                      category: "returning",
                      source: item.source,
                    }}
                    className="h-16 w-12 shrink-0 rounded-xl"
                    rounded="rounded-xl"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-micro font-bold ${badge.className}`}>
                        {badge.text}
                      </span>
                      {item.favorite && <Star className="h-3 w-3 text-brand" fill="currentColor" strokeWidth={0} />}
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm font-semibold text-white" dir="auto">{item.title}</p>
                    <p className="mt-0.5 text-caption text-ink-300">{item.subtitle}</p>
                  </div>
                  <span className="shrink-0 text-caption font-semibold tabular-nums text-amber-300">{item.clock}</span>
                </article>
              </Link>
            );
          })}
        </div>
      )}

      <p className="text-caption leading-relaxed text-ink-300">
        دادهها از TVMaze و TMDB میآیند. ساعت دقیق پخش تنها برای سریالهای رادار موجود است؛ برای فیلمها و سریالهای روی آنتن فقط تاریخ اعلام شده است.
      </p>
    </div>
  );
}
