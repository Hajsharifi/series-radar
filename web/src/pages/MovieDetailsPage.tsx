import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Movie } from "../types";
import { useMovieFavorites } from "../hooks/useMovies";
import { useMovieTrack } from "../hooks/useMovieTrack";
import { fetchMovieDetail, findCachedMovie, movieBackdropUrl, movieGenres, moviePosterUrl } from "../lib/movies";
import {
  dayCountdownLabel,
  gregorianDate,
  jalaliDate,
  reminderTimeMsForDay,
  tehranDateFromStamp,
  toPersianDigits,
} from "../lib/date";
import { usdFull, usdShort } from "../lib/format";
import { MoviePoster } from "../components/MoviePoster";
import { JalaliSpans } from "../components/DateChip";

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
      <p className="text-[10px] opacity-70">{label}</p>
      <p className="mt-0.5 text-xs font-semibold" dir="rtl">
        {jalali ? jalaliDate(jalali) : "نامشخص"}
      </p>
      <p className="text-[10px] opacity-60" dir="ltr" style={{ unicodeBidi: "isolate" }}>
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

  const onlineDay = movie?.onlineDate ?? movie?.digitalDate ?? movie?.physicalDate ?? null;
  const reminderEpoch = reminderTimeMsForDay(onlineDay);
  const reminderDay = reminderEpoch ? new Date(reminderEpoch).toISOString() : null;

  if (!movie) {
    return (
      <div className="rounded-2xl border border-white/8 bg-ink-850/60 px-4 py-14 text-center">
        {loading ? (
          <>
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-sky-400" />
            <p className="mt-3 text-sm text-ink-300">در حال بارگذاری فیلم…</p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-white">{failed ? "ارتباط با سرور برقرار نشد" : "این فیلم پیدا نشد"}</p>
            <p className="mt-1 text-xs text-ink-400">ممکن است از فهرست حذف شده باشد یا اینترنت قطع باشد.</p>
            <Link to="/movies" className="mt-4 inline-block rounded-lg bg-sky-400 px-4 py-2 text-xs font-semibold text-sky-950">
              بازگشت به فیلم‌ها
            </Link>
          </>
        )}
      </div>
    );
  }

  // Determine if movie is in cinema (has theatrical date but no digital/physical yet)
  const isInCinema = movie?.theatricalDate && !movie?.digitalDate && !movie?.physicalDate;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <Link to="/movies" className="text-xs text-ink-400">
          → بازگشت به فیلم‌ها
        </Link>
        <div className="flex items-center gap-2">
          {isInCinema && (
            <button
              type="button"
              onClick={() => tracked.toggle(movie.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                tracked.ids.has(movie.id) ? "bg-sky-400 text-sky-950" : "bg-white/8 text-white"
              }`}
            >
              {tracked.ids.has(movie.id) ? "🔔 در رادار" : "🔔 پیگیری کیفیت"}
            </button>
          )}
          <button
            type="button"
            onClick={() => favorites.toggle(movie.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              favorites.ids.has(movie.id) ? "bg-amber-400 text-ink-950" : "bg-white/8 text-white"
            }`}
          >
            {favorites.ids.has(movie.id) ? "★ ستاره‌دار" : "☆ ستاره"}
          </button>
        </div>
      </div>

      <article className="overflow-hidden rounded-3xl border border-white/8 bg-ink-850/70">
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
                <span className="rounded-full bg-sky-400/90 px-2 py-0.5 text-[10px] font-bold text-sky-950">فیلم</span>
                {movie.certification && (
                  <span className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-ink-200">{movie.certification}</span>
                )}
                {typeof movie.rating === "number" && movie.rating > 0 && (
                  <span className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                    ★ {toPersianDigits(movie.rating.toFixed(1))}
                  </span>
                )}
              </div>
              <h1 className="mt-1 text-xl font-extrabold leading-tight text-white" dir="auto">
                {movie.title}
              </h1>
              {movie.originalTitle && movie.originalTitle !== movie.title && (
                <p className="truncate text-[11px] text-ink-300" dir="auto">
                  {movie.originalTitle}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
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
            {onlineDay && (
              <p className="mt-2 text-[11px] text-ink-400">
                {movie.availableNow
                  ? `نسخهٔ دیجیتال از ${dayCountdownLabel(onlineDay).replace("پخش شده", "چند روز پیش")} در دسترس است.`
                  : `انتشار نسخهٔ دیجیتال ${dayCountdownLabel(onlineDay)} است.`}
              </p>
            )}
          </div>

          {onlineDay && (
            <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
              <p className="text-[11px] text-ink-400">یادآوری انتشار خانگی</p>
              <p className="mt-1 text-sm font-semibold text-white">
                <JalaliSpans date={reminderDay ? tehranDateFromStamp(reminderDay) : null} className="text-sm font-semibold text-white" />
                {" "}ساعت ۰۹:۰۰
              </p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[11px] text-ink-400">
                  {!favorite
                    ? "با ستاره‌کردن فیلم فعال می‌شود"
                    : favorite.reminderEnabled === false
                      ? "برای این فیلم خاموش است"
                      : "۲۴ ساعت قبل از انتشار، ۰۹:۰۰ تهران"}
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
          )}

          { (movie.budget || movie.revenue || movie.imdbRating || movie.rottenTomatoesRating || movie.metacriticRating) ? (
            <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">امتیازات و بودجه</h2>
                <Link to="/boxoffice" className="text-[11px] text-sky-300">
                  گیشهٔ کامل
                </Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {movie.imdbRating && (
                  <div className="rounded-xl bg-white/5 px-3 py-2">
                    <p className="text-[10px] text-ink-400">IMDb</p>
                    <p className="mt-0.5 font-semibold text-amber-300">{movie.imdbRating}</p>
                  </div>
                )}
                {movie.rottenTomatoesRating && (
                  <div className="rounded-xl bg-white/5 px-3 py-2">
                    <p className="text-[10px] text-ink-400">Rotten Tomatoes</p>
                    <p className="mt-0.5 font-semibold text-red-400">{movie.rottenTomatoesRating}</p>
                  </div>
                )}
                {movie.metacriticRating && (
                  <div className="rounded-xl bg-white/5 px-3 py-2">
                    <p className="text-[10px] text-ink-400">Metacritic</p>
                    <p className="mt-0.5 font-semibold text-green-400">{movie.metacriticRating}</p>
                  </div>
                )}
                {movie.budget && (
                  <div className="rounded-xl bg-white/5 px-3 py-2">
                    <p className="text-[10px] text-ink-400">بودجهٔ تولید</p>
                    <p className="mt-0.5 font-semibold text-ink-100">{usdShort(movie.budget)}</p>
                    <p className="text-[10px] text-ink-400" dir="ltr">{usdFull(movie.budget)}</p>
                  </div>
                )}
                {movie.revenue && (
                  <div className="rounded-xl bg-white/5 px-3 py-2 sm:col-span-2">
                    <p className="text-[10px] text-ink-400">فروش جهانی</p>
                    <p className="mt-0.5 font-semibold text-ink-100">{usdShort(movie.revenue)}</p>
                    <p className="text-[10px] text-ink-400" dir="ltr">{usdFull(movie.revenue)}</p>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {movie.overview && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">داستان</h2>
                <span className="text-[10px] text-ink-400">خلاصه به انگلیسی</span>
              </div>
              <p className="text-left text-[13px] leading-7 text-ink-300" dir="auto">
                {movie.overview}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {movie.trailerKey && (
              <a
                href={`https://www.youtube.com/watch?v=${movie.trailerKey}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-center text-xs text-ink-200"
              >
                ▶ تریلر
              </a>
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

      <p className="text-[11px] leading-relaxed text-ink-400">
        دادهٔ این صفحه از TMDB می‌آید و ممکن است تاریخ‌های انتشار بعد از اعلام رسمی تغییر کنند.
        {moviePosterUrl(movie) ? "" : " پوستر رسمی برای این فیلم در دسترس نیست."}
      </p>
    </div>
  );
}
export default MovieDetailsPage;
