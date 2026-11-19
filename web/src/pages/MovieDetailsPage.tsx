import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BackButton } from "../components/BackButton";
import { useQuery } from "@tanstack/react-query";
import { cachedFetchJson } from "../lib/offline";
import { openExternalUrl } from "../lib/native";
import type { Movie } from "../types";
import { useMovieFavorites } from "../hooks/useMovies";
import { useMovieTrack } from "../hooks/useMovieTrack";
import {
  fetchMovieDetail,
  findCachedMovie,
  movieBackdropUrl,
  movieGenres,
  moviePosterUrl,
  movieStage,
  movieStageLabel,
  tehranTodayISO,
} from "../lib/movies";
import {
  dayCountdownLabel,
  gregorianDate,
  jalaliDate,
  leadHoursLabel,
  releaseMorningMs,
  reminderTimeForDayWithLead,
  tehranClock,
  tehranDateFromStamp,
  toPersianDigits,
} from "../lib/date";
import { getSettings } from "../lib/settings";
import { usdFull, usdShort } from "../lib/format";
import { MoviePoster } from "../components/MoviePoster";
import { JalaliSpans } from "../components/DateChip";
import { CreditsSection } from "../components/CreditsSection";
import { API_BASE } from "../lib/api";
import { Bell, Star } from "lucide-react";
import { Button } from "../components/ui";

function formatDay(day?: string | null): { jalali: Date | null; gregorian: string } {
  const date = tehranDateFromStamp(day ? `${day}T12:00:00Z` : null);
  return { jalali: date, gregorian: date ? gregorianDate(date) : "" };
}

function ReleaseRow({
  label,
  day,
  tone = "muted",
}: {
  label: string;
  day?: string | null;
  tone?: "muted" | "amber" | "sky" | "emerald";
}) {
  const { jalali, gregorian } = formatDay(day);
  const tones = {
    muted: "bg-white/6 text-ink-200",
    amber: "bg-amber-400/12 text-amber-200",
    sky: "bg-sky-400/12 text-sky-200",
    emerald: "bg-emerald-400/12 text-emerald-200",
  } as const;
  return (
    <div className={`rounded-xl px-3 py-2 ${tones[tone]}`}>
      <p className="text-micro opacity-70">{label}</p>
      <p className="mt-0.5 text-xs font-semibold" dir="rtl">
        {jalali ? jalaliDate(jalali) : "نامشخص"}
      </p>
      <p className="text-micro opacity-60" dir="ltr" style={{ unicodeBidi: "isolate" }}>
        {gregorian || "—"}
      </p>
    </div>
  );
}

export function MovieDetailsPage() {
  const { id } = useParams();
  const movieId = Number(id);
  const favorites = useMovieFavorites();
  const tracked = useMovieTrack();
  const [movie, setMovie] = useState<Movie | null>(() => findCachedMovie(movieId));
  const [loading, setLoading] = useState(!movie);
  const [failed, setFailed] = useState(false);
  const similarQuery = useQuery({
    queryKey: ["similar", "movie", movieId],
    queryFn: () => cachedFetchJson<{ items: Movie[] }>(`${API_BASE}/api/movie/${movieId}/similar`),
    enabled: Number.isFinite(movieId),
    staleTime: 6 * 60 * 60 * 1000,
  });

  useEffect(() => {
    let cancelled = false;
    const cached = findCachedMovie(movieId);
    if (cached) setMovie(cached);
    setLoading(!cached);
    setFailed(false);
    fetchMovieDetail(movieId)
      .then((result) => {
        if (!cancelled) setMovie(result.movie);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [movieId]);

  const favorite = favorites.items.find((item) => item.movieId === movieId);
  const reminderOn = Boolean(favorite) && favorite?.reminderEnabled !== false;
  const genres = useMemo(() => (movie ? movieGenres(movie) : []), [movie]);
  const backdrop = movie ? movieBackdropUrl(movie) : null;

  const stage = movie ? movieStage(movie) : "unknown";
  const finished = stage === "available" || stage === "expired";
  const today = tehranTodayISO();
  const digitalDay = movie?.digitalDate ?? null;
  const digitalFuture = Boolean(digitalDay && digitalDay > today);
  const theatricalDay = movie?.theatricalDate ?? movie?.releaseDate ?? null;
  const theatricalFuture = Boolean(theatricalDay && theatricalDay > today);
  const lead = getSettings().defaultLeadHours;

  // One helper drives both the alarm and what the page promises to the user.
  const digitalTriggerAt = digitalFuture ? reminderTimeForDayWithLead(digitalDay, lead) : null;
  const digitalStamp = digitalTriggerAt ? new Date(digitalTriggerAt).toISOString() : null;
  const reminderDay = digitalStamp ? tehranDateFromStamp(digitalStamp) : null;
  const reminderClock = digitalStamp ? tehranClock(digitalStamp) : "—";

  const theatricalTriggerAt = theatricalFuture ? releaseMorningMs(theatricalDay) : null;
  const theatricalStamp = theatricalTriggerAt ? new Date(theatricalTriggerAt).toISOString() : null;
  const theatricalClock = theatricalStamp ? tehranClock(theatricalStamp) : "—";

  if (!movie) {
    return (
      <div className="rounded-card border border-edge/10 bg-panel/70 px-4 py-14 text-center">
        {loading ? (
          <>
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-sky-400" />
            <p className="mt-3 text-sm text-ink-300">در حال بارگذاری فیلم…</p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-white">{failed ? "ارتباط با سرور برقرار نشد" : "این فیلم پیدا نشد"}</p>
            <p className="mt-1 text-xs text-muted">ممکن است از فهرست حذف شده باشد یا اینترنت قطع باشد.</p>
            <Link to="/movies" className="mt-4 inline-block rounded-lg bg-sky-400 px-4 py-2 text-xs font-semibold text-sky-950">
              بازگشت به فیلم‌ها
            </Link>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <BackButton className="text-muted" />
        <div className="flex items-center gap-2">
          {stage === "quality" && (
            <Button
              variant={tracked.ids.has(movie.id) ? "secondary" : "ghost"}
              size="sm"
              onClick={() => tracked.toggle(movie.id)}
            >
              <Bell className="h-3.5 w-3.5" strokeWidth={1.8} />
              {tracked.ids.has(movie.id) ? "در رادار" : "پیگیری کیفیت"}
            </Button>
          )}
          {finished ? (
            <span className="rounded-control border border-edge/10 bg-white/5 px-3 py-1.5 text-caption text-ink-300">
              کیفیت منتشر شد
            </span>
          ) : (
            <Button
              variant={favorites.ids.has(movie.id) ? "primary" : "secondary"}
              size="sm"
              onClick={() => favorites.toggle(movie.id)}
            >
              <Star className="h-3.5 w-3.5" fill={favorites.ids.has(movie.id) ? "currentColor" : "none"} strokeWidth={1.8} />
              {favorites.ids.has(movie.id) ? "ستاره‌دار" : "ستاره"}
            </Button>
          )}
        </div>
      </div>

      <article className="overflow-hidden rounded-3xl border border-edge/10 bg-panel/80">
        <div className="relative">
          {backdrop ? (
            <img
              src={backdrop}
              alt=""
              className="h-[240px] w-full object-cover opacity-60"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <MoviePoster movie={movie} className="h-[240px] w-full" rounded="rounded-none" />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-850 via-ink-850/60 to-transparent" />
          <div className="absolute inset-x-4 bottom-3 flex items-end gap-3">
            <MoviePoster movie={movie} className="h-[104px] w-[74px] shrink-0 border border-white/15" rounded="rounded-xl" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-sky-400/90 px-2 py-0.5 text-micro font-bold text-sky-950">فیلم</span>
                <span className={`rounded-full px-2 py-0.5 text-micro font-bold ${
                  stage === "upcoming"
                    ? "bg-sky-400/90 text-sky-950"
                    : stage === "quality"
                      ? "bg-amber-400/90 text-amber-950"
                      : "bg-emerald-400/90 text-emerald-950"
                }`}>
                  {movieStageLabel(stage)}
                </span>
                {movie.certification && (
                  <span className="rounded-full bg-black/55 px-2 py-0.5 text-micro text-ink-200">{movie.certification}</span>
                )}
                {typeof movie.rating === "number" && movie.rating > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-micro font-bold text-brand">
                    <Star className="h-3 w-3" fill="currentColor" strokeWidth={0} /> {toPersianDigits(movie.rating.toFixed(1))}
                  </span>
                )}
              </div>
              <h1 className="mt-1 text-headline text-white" dir="auto">
                {movie.title}
              </h1>
              {movie.originalTitle && movie.originalTitle !== movie.title && (
                <p className="truncate text-caption text-ink-300" dir="auto">
                  {movie.originalTitle}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2 text-caption">
            {genres.map((genre) => (
              <span key={genre} className="rounded-lg bg-white/6 px-2 py-1 text-ink-200">
                {genre}
              </span>
            ))}
            {movie.runtime ? (
              <span className="rounded-lg bg-white/6 px-2 py-1 text-ink-200">{toPersianDigits(movie.runtime)} دقیقه</span>
            ) : null}
            {movie.status && (
              <span className="rounded-lg bg-white/6 px-2 py-1 text-ink-300">{movie.status === "Released" ? "منتشرشده" : movie.status}</span>
            )}
          </div>

          <div>
            <h2 className="mb-2 text-sm font-bold text-white">تاریخ‌ها</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <ReleaseRow label="اکران سینمایی" day={movie.theatricalDate ?? movie.releaseDate} tone="amber" />
              <ReleaseRow label="نسخهٔ دیجیتال" day={movie.digitalDate} tone="sky" />
            </div>
            {digitalDay && (
              <p className="mt-2 text-caption text-muted">
                {movie.availableNow
                  ? `نسخهٔ دیجیتال از ${dayCountdownLabel(digitalDay).replace("پخش شده", "چند روز پیش")} در دسترس است.`
                  : `انتشار نسخهٔ دیجیتال ${dayCountdownLabel(digitalDay)} است.`}
              </p>
            )}
          </div>

          {digitalFuture ? (
            <div className="rounded-card border border-edge/10 bg-black/25 p-4">
              <p className="text-caption text-muted">یادآوری انتشار کیفیت خوب</p>
              <p className="mt-1 text-sm font-semibold text-white">
                <JalaliSpans date={reminderDay} className="text-sm font-semibold text-white" />
                {" "}ساعت {reminderClock}
              </p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-caption text-muted">
                  {!favorite
                    ? "با ستاره‌کردن فیلم فعال می‌شود"
                    : favorite.reminderEnabled === false
                      ? "برای این فیلم خاموش است"
                      : `${leadHoursLabel(lead)}، ${reminderClock} به وقت تهران`}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (!favorite) {
                      favorites.add(movie.id);
                      return;
                    }
                    favorites.setReminder(movie.id, favorite.reminderEnabled === false);
                  }}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${reminderOn ? "bg-amber-400" : "bg-white/15"}`}
                  aria-label="تغییر یادآوری انتشار فیلم"
                  aria-pressed={reminderOn}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${reminderOn ? "left-0.5" : "right-0.5"}`}
                  />
                </button>
              </div>
            </div>
          ) : theatricalFuture ? (
            <div className="rounded-card border border-sky-400/20 bg-sky-500/8 p-4">
              <p className="text-caption text-ink-300">یادآوری اکران سینمایی</p>
              <p className="mt-1 text-sm font-semibold text-white">
                <JalaliSpans stamp={theatricalDay ? `${theatricalDay}T12:00:00Z` : null} className="text-sm font-semibold text-white" />
                {" "}ساعت {theatricalClock}
              </p>
              <p className="mt-2 text-caption leading-relaxed text-ink-300">
                {!favorite
                  ? "با انتخاب ستاره، روز اکرانش یادآوری میشود؛ سپس منتظر کیفیت خوبش میمانیم."
                  : favorite.reminderEnabled === false
                    ? "یادآوری این فیلم خاموش است."
                    : `فعال است · ${theatricalClock} به وقت تهران، روز اکران.`}
              </p>
            </div>
          ) : finished ? (
            <div className="rounded-card border border-emerald-400/20 bg-emerald-500/8 p-4 text-xs leading-relaxed text-emerald-200">
              کیفیت خوب این فیلم منتشر شده و از فهرست انتظار و ستاره‌ها حذف شده است.
            </div>
          ) : (
            <div className="rounded-card border border-edge/10 bg-black/25 p-4 text-caption leading-relaxed text-ink-300">
              تاریخ دقیق اکران یا انتشار دیجیتال اعلام نشده است. فیلم را ستاره بزن تا بهمحض اعلام یا انتشار، یک اطلاعیه دریافت کنی.
            </div>
          )}

          { (movie.budget || movie.revenue || movie.imdbRating || movie.rottenTomatoesRating || movie.metacriticRating) ? (
            <div className="rounded-card border border-edge/10 bg-black/25 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-title text-white">امتیازات و بودجه</h2>
                <Link to="/boxoffice" className="text-caption text-sky-300">
                  گیشهٔ کامل
                </Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {movie.imdbRating && (
                  <div className="rounded-xl bg-white/5 px-3 py-2">
                    <p className="text-micro text-muted">IMDb</p>
                    <p className="mt-0.5 font-semibold text-amber-300">{movie.imdbRating}</p>
                  </div>
                )}
                {movie.rottenTomatoesRating && (
                  <div className="rounded-xl bg-white/5 px-3 py-2">
                    <p className="text-micro text-muted">Rotten Tomatoes</p>
                    <p className="mt-0.5 font-semibold text-red-400">{movie.rottenTomatoesRating}</p>
                  </div>
                )}
                {movie.metacriticRating && (
                  <div className="rounded-xl bg-white/5 px-3 py-2">
                    <p className="text-micro text-muted">Metacritic</p>
                    <p className="mt-0.5 font-semibold text-green-400">{movie.metacriticRating}</p>
                  </div>
                )}
                {movie.budget && (
                  <div className="rounded-xl bg-white/5 px-3 py-2">
                    <p className="text-micro text-muted">بودجهٔ تولید</p>
                    <p className="mt-0.5 font-semibold text-ink-100">{usdShort(movie.budget)}</p>
                    <p className="text-micro text-muted" dir="ltr">{usdFull(movie.budget)}</p>
                  </div>
                )}
                {movie.revenue && (
                  <div className="rounded-xl bg-white/5 px-3 py-2 sm:col-span-2">
                    <p className="text-micro text-muted">فروش جهانی</p>
                    <p className="mt-0.5 font-semibold text-ink-100">{usdShort(movie.revenue)}</p>
                    <p className="text-micro text-muted" dir="ltr">{usdFull(movie.revenue)}</p>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {(movie.productionCountries?.length || movie.spokenLanguages?.length || movie.certification) ? (
            <div className="rounded-card border border-edge/10 bg-black/25 p-4">
              <h2 className="mb-2 text-sm font-bold text-white">اطلاعات بیشتر</h2>
              <div className="grid grid-cols-2 gap-2 text-caption sm:grid-cols-3">
                {movie.certification && <div className="rounded-xl bg-white/5 px-3 py-2"><p className="text-muted">درجهبندی</p><p className="mt-0.5 font-semibold text-ink-100">{movie.certification}</p></div>}
                {movie.productionCountries?.length ? <div className="rounded-xl bg-white/5 px-3 py-2"><p className="text-muted">کشور</p><p className="mt-0.5 font-semibold text-ink-100">{movie.productionCountries.join(" · ")}</p></div> : null}
                {movie.spokenLanguages?.length ? <div className="rounded-xl bg-white/5 px-3 py-2"><p className="text-muted">زبان</p><p className="mt-0.5 font-semibold text-ink-100">{movie.spokenLanguages.join(" · ")}</p></div> : null}
                {movie.omdbAwards && <div className="rounded-xl bg-white/5 px-3 py-2 sm:col-span-2"><p className="text-muted">جوایز</p><p className="mt-0.5 font-semibold text-ink-100" dir="auto">{movie.omdbAwards}</p></div>}
              </div>
            </div>
          ) : null}

          <CreditsSection
            kind="movie"
            directors={movie.directors}
            directorIds={movie.directorIds}
            cast={movie.cast}
            fallbackDirector={movie.omdbDirector}
            fallbackActors={movie.omdbActors}
          />

          {movie.overview && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <h2 className="text-title text-white">داستان</h2>
                <span className="text-micro text-muted">ترجمهٔ TMDB</span>
              </div>
              <p className="text-left text-body leading-7 text-ink-300" dir="auto">
                {movie.overview}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {movie.trailerKey && (
              <button
                type="button"
                onClick={() => openExternalUrl(`https://www.youtube.com/watch?v=${movie.trailerKey}`)}
                className="flex-1 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-center text-xs font-semibold text-rose-200 active:bg-rose-500/20"
              >
                ▶ تماشای تریلر
              </button>
            )}
            {movie.imdbId && (
              <a
                href={`https://www.imdb.com/title/${movie.imdbId}/`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-center text-xs text-ink-200"
              >
                IMDb
              </a>
            )}
            {movie.homepage && (
              <a
                href={movie.homepage}
                target="_blank"
                rel="noreferrer"
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-center text-xs text-ink-200"
              >
                سایت رسمی
              </a>
            )}
          </div>
        </div>
      </article>

      {(similarQuery.data?.items?.length ?? 0) > 0 && (
        <section className="space-y-3">
          <h2 className="text-title text-white">عنوانهای مشابه</h2>
          <div className="sr-hide-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {similarQuery.data!.items.map((item) => (
              <Link key={item.id} to={`/movie/${item.id}`} className="sr-no-tap w-[120px] shrink-0">
                <MoviePoster movie={item} className="aspect-[2/3] w-full" />
                <p className="mt-1 line-clamp-2 text-caption font-semibold text-white" dir="auto">{item.title}</p>
                {item.originalTitle && item.originalTitle !== item.title && (
                  <p className="truncate text-micro text-muted" dir="auto">{item.originalTitle}</p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      <p className="text-caption leading-relaxed text-muted">
        دادهٔ این صفحه از TMDB می‌آید و ممکن است تاریخ‌های انتشار بعد از اعلام رسمی تغییر کنند.
        {moviePosterUrl(movie) ? "" : " پوستر رسمی برای این فیلم در دسترس نیست."}
      </p>
    </div>
  );
}
export default MovieDetailsPage;
