import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useScheduleContext } from "../hooks/ScheduleContext";
import { useFavoriteIds } from "../hooks/useSchedule";
import { useLiveTVSections } from "../hooks/useLiveTV";
import { useMovieCatalog, useMovieFavorites } from "../hooks/useMovies";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import {
  dateAfterDays,
  jalaliDate,
  tehranClock,
  tehranParts,
  toIsoDay,
  toPersianDigits,
  weekdayName,
} from "../lib/date";
import { movieStage, tehranTodayISO } from "../lib/movies";
import { Poster } from "../components/Poster";

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
  const favoriteIds = useFavoriteIds();
  const movieFavorites = useMovieFavorites();
  const catalog = useMovieCatalog();
  const liveTV = useLiveTVSections();
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  usePullToRefresh(() => schedule.refresh(), { threshold: 80 });

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const parts = dateAfterDays(index);
        const stamp = `${parts.y}-${pad(parts.m)}-${pad(parts.d)}T12:00:00Z`;
        const tehran = tehranParts(stamp);
        return {
          key: toIsoDay(parts),
          label: index === 0 ? "امروز" : index === 1 ? "فردا" : weekdayName(stamp),
          jalali: tehran ? jalaliDate(tehran.date) : "—",
          count: 0,
        };
      }),
    [],
  );

  const items = useMemo(() => {
    const result: CalendarItem[] = [];
    const validDays = new Set(days.map((day) => day.key));

    for (const show of schedule.shows) {
      if (!show.airstamp) continue;
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
        favorite: favoriteIds.has(show.id),
      });
    }

    const seen = new Set<number>();
    for (const show of [...liveTV.airingToday, ...liveTV.onTheAir]) {
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
        favorite: false,
      });
    }

    // Movie theatrical releases and digital-quality releases in the same week.
    const today = tehranTodayISO();
    for (const movie of catalog.all) {
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
  }, [days, favoriteIds, movieFavorites.ids, catalog.all, liveTV.airingToday, liveTV.onTheAir, schedule.shows]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      if (onlyFavorites && !item.favorite) continue;
      map.set(item.day, (map.get(item.day) ?? 0) + 1);
    }
    return map;
  }, [items, onlyFavorites]);

  const [activeDay, setActiveDay] = useState<string | null>(null);
  const selected = activeDay && counts.has(activeDay) ? activeDay : days.find((day) => counts.has(day.key))?.key ?? days[0].key;
  const visible = items
    .filter((item) => item.day === selected && (!onlyFavorites || item.favorite))
    .sort((a, b) => a.clock.localeCompare(b.clock) || a.title.localeCompare(b.title, "fa"));

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[11px] font-medium tracking-wide text-amber-300/90">برنامهٔ هفت روزه</p>
        <h1 className="mt-1 text-2xl font-extrabold text-white">تقویم سریالها و فیلمها</h1>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-300">
          قسمتهای پیشرو، اکران سینمایی و انتشار دیجیتال فیلمها در هفت روز آینده به وقت تهران — هم موارد ستارهدار و هم آنهایی که در رادارند.
        </p>
      </header>

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
              className={`sr-no-tap flex w-[74px] shrink-0 flex-col items-center rounded-2xl border px-2 py-2.5 transition ${
                active ? "border-amber-400/60 bg-amber-400/15" : "border-white/8 bg-ink-850/60"
              }`}
            >
              <span className={`text-[11px] font-semibold ${active ? "text-amber-200" : "text-ink-300"}`}>{day.label}</span>
              <span className="mt-1 text-[10px] leading-tight text-ink-400">{day.jalali}</span>
              <span className="mt-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-white/8 px-1 text-[10px] font-bold text-white">
                {toPersianDigits(count)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-white">
          {days.find((day) => day.key === selected)?.label} · {toPersianDigits(visible.length)} مورد
        </h2>
        <button
          type="button"
          aria-pressed={onlyFavorites}
          onClick={() => setOnlyFavorites((value) => !value)}
          className={`sr-no-tap rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
            onlyFavorites ? "bg-amber-400 text-ink-950" : "border border-white/10 bg-white/5 text-ink-300"
          }`}
        >
          ★ فقط ستارهها
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-ink-850/60 px-4 py-12 text-center">
          <p className="text-sm font-semibold text-white">موردی برای این روز ثبت نشده</p>
          <p className="mt-1 text-xs text-ink-300">روز دیگری را از بالا انتخاب کنید یا فیلتر ستارهها را خاموش کنید.</p>
        </div>
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
                <article className="flex items-center gap-3 rounded-2xl border border-white/8 bg-ink-850/70 p-3">
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
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.className}`}>
                        {badge.text}
                      </span>
                      {item.favorite && <span className="text-[10px] text-amber-300">★</span>}
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm font-semibold text-white" dir="auto">{item.title}</p>
                    <p className="mt-0.5 text-[11px] text-ink-300">{item.subtitle}</p>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold tabular-nums text-amber-300">{item.clock}</span>
                </article>
              </Link>
            );
          })}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-ink-300">
        دادهها از TVMaze و TMDB میآیند. ساعت دقیق پخش تنها برای سریالهای رادار موجود است؛ برای فیلمها و سریالهای روی آنتن فقط تاریخ اعلام شده است.
      </p>
    </div>
  );
}
