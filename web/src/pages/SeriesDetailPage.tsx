import { Link } from "react-router-dom";
import { useParams } from "react-router-dom";
import { BackButton } from "../components/BackButton";
import { useSeriesDetail } from "../hooks/useSeriesDetail";
import { toPersianDigits, jalaliDate, tehranClock } from "../lib/date";
import { EpisodeList } from "../components/EpisodeList";
import { Poster } from "../components/Poster";
import { CreditsSection } from "../components/CreditsSection";
import { Star } from "lucide-react";

function formatDate(date?: string | null) {
  if (!date) return { jalali: "—", gregorian: "—" };
  const d = new Date(date + "T12:00:00");
  return {
    jalali: jalaliDate(d),
    gregorian: d.toLocaleDateString("en-GB"),
  };
}

export default function SeriesDetailPage() {
  const { id } = useParams<{ id: string }>();
  const showId = Number(id);
  const { series, isLoading, toggleEpisode } = useSeriesDetail(showId);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-12 w-12">
            <svg className="h-full w-full text-amber-400" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z">
                <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
              </path>
            </svg>
          </div>
          <p className="text-sm text-ink-300">در حال بارگذاری…</p>
        </div>
      </div>
    );
  }

  if (!series) {
    return (
      <div className="rounded-card border border-edge/10 bg-panel/70 px-4 py-14 text-center">
        <p className="text-sm font-semibold text-white">این سریال پیدا نشد</p>
        <p className="mt-1 text-xs text-muted">ممکن است از برنامهٔ آینده حذف شده باشد.</p>
        <Link to="/" className="mt-4 inline-block rounded-lg bg-amber-400 px-4 py-2 text-xs font-semibold text-ink-950">
          بازگشت به رادار
        </Link>
      </div>
    );
  }

  const { progress } = series;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <BackButton className="text-muted" />
      </div>

      <article className="overflow-hidden rounded-3xl border border-edge/10 bg-panel/80">
        <div className="relative">
          <Poster
            show={{
              id: series.id,
              title: series.title,
              posterPath: series.image?.medium,
              posterOriginal: series.image?.original,
              category: "returning" as const,
            }}
            className="h-[240px] w-full"
            rounded="rounded-none"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-850 via-ink-850/40 to-transparent" />
          <div className="absolute inset-x-4 bottom-3 flex items-end gap-3">
            <Poster
              show={{
                id: series.id,
                title: series.title,
                posterPath: series.image?.medium,
                posterOriginal: series.image?.original,
                category: "returning" as const,
              }}
              className="h-[104px] w-[74px] shrink-0 border border-white/15"
              rounded="rounded-xl"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-sky-400/90 px-2 py-0.5 text-micro font-bold text-sky-950">سریال</span>
                {series.status && (
                  <span className="rounded-full bg-black/55 px-2 py-0.5 text-micro text-ink-200">
                    {series.status === "Ended" ? "پایان‌یافته" : series.status}
                  </span>
                )}
                {typeof series.rating?.average === "number" && series.rating.average > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-micro font-bold text-brand">
                    <Star className="h-3 w-3" fill="currentColor" strokeWidth={0} /> {toPersianDigits(series.rating.average.toFixed(1))}
                  </span>
                )}
              </div>
              <h1 className="mt-1 text-xl font-extrabold leading-tight text-white" dir="auto">
                {series.title}
              </h1>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2 text-caption">
            {series.genres?.slice(0, 5).map((genre: string) => (
              <span key={genre} className="rounded-lg bg-white/6 px-2 py-1 text-ink-200">
                {genre}
              </span>
            ))}
            {series.schedule && (
              <span className="rounded-lg bg-white/6 px-2 py-1 text-ink-200">
                {series.schedule.days?.join(", ")} {tehranClock(`2000-01-01T${series.schedule.time}`)}
              </span>
            )}
            {series.network && (
              <span className="rounded-lg bg-white/6 px-2 py-1 text-ink-300">{series.network.name}</span>
            )}
            {series.webChannel && (
              <span className="rounded-lg bg-white/6 px-2 py-1 text-ink-300">{series.webChannel.name}</span>
            )}
          </div>

          <div className="rounded-card border border-edge/10 bg-black/25 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-caption text-muted">پیشرفت تماشا</p>
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (progress.watched / progress.total) * 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-amber-300 shrink-0">
                    {toPersianDigits(progress.watched)} / {toPersianDigits(progress.total)}
                  </span>
                </div>
              </div>
            </div>
            {series.episodes.length > 0 && (
              <p className="mt-2 text-caption text-muted">
                {toPersianDigits(progress.watched)} از {toPersianDigits(progress.total)} قسمت دیده شده
              </p>
            )}
          </div>

          <div>
            <h2 className="mb-2 text-sm font-bold text-white">تاریخ‌ها</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-xl bg-white/5 px-3 py-2">
                <p className="text-micro text-muted">شروع پخش</p>
                <p className="mt-0.5 text-xs font-semibold text-white" dir="rtl">{formatDate(series.premiered).jalali}</p>
                <p className="text-micro text-muted" dir="ltr">{formatDate(series.premiered).gregorian}</p>
              </div>
              {series.ended && (
                <div className="rounded-xl bg-white/5 px-3 py-2">
                  <p className="text-micro text-muted">پایان</p>
                  <p className="mt-0.5 text-xs font-semibold text-white" dir="rtl">{formatDate(series.ended).jalali}</p>
                  <p className="text-micro text-muted" dir="ltr">{formatDate(series.ended).gregorian}</p>
                </div>
              )}
              {series.schedule && (
                <div className="rounded-xl bg-white/5 px-3 py-2">
                  <p className="text-micro text-muted">زمان پخش</p>
                  <p className="mt-0.5 text-xs font-semibold text-white">
                    {tehranClock(`2000-01-01T${series.schedule.time}`)}
                  </p>
                  <p className="text-micro text-muted">
                    {series.schedule.days?.join("، ")}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-card border border-edge/10 bg-black/25 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-title text-white">پیشرفت فصل‌ها</h2>
            </div>
            <div className="space-y-2">
              {(() => {
                const seasonCounts = Object.entries(
                  series.episodes.reduce((acc: Record<number, number>, ep: { season: number }) => {
                    acc[ep.season] = (acc[ep.season] || 0) + 1;
                    return acc;
                  }, {} as Record<number, number>)
                ) as [string, number][];
                return seasonCounts.map(function(entry: [string, number]): React.ReactElement {
                  const [season, count] = entry;
                  return (
                    <div key={season} className="rounded-xl bg-white/5 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-white">فصل {season}</span>
                        <span className="text-sm text-ink-300">{count} قسمت</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {series.summary && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <h2 className="text-title text-white">داستان</h2>
                <span className="text-micro text-muted">خلاصه به انگلیسی</span>
              </div>
              <p className="text-left text-body leading-7 text-ink-300" dir="auto">
                {(series.summary ?? "").replace(/<[^>]*>/g, "")}
              </p>
            </div>
          )}

          <CreditsSection kind="series" creators={series.creators} creatorIds={series.creatorIds} cast={series.cast} />

          <div className="flex flex-wrap gap-2">
            {series.officialSite && (
              <a
                href={series.officialSite}
                target="_blank"
                rel="noreferrer"
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-center text-xs text-ink-200"
              >
                سایت رسمی
              </a>
            )}
            {series.externals?.imdb && (
              <a
                href={`https://www.imdb.com/title/${series.externals.imdb}/`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-center text-xs text-ink-200"
              >
                IMDb
              </a>
            )}
            {series.externals?.thetvdb && (
              <a
                href={`https://thetvdb.com/series/${series.externals.thetvdb}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-center text-xs text-ink-200"
              >
                TVDB
              </a>
            )}
          </div>
        </div>
      </article>

      <section className="mt-6">
        <EpisodeList
          episodes={series.episodes}
          watchedIds={series.watchedEpisodes}
          onToggle={toggleEpisode}
        />
      </section>
    </div>
  );
}
