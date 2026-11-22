import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { BackButton } from "../components/BackButton";
import { useFavorites } from "../hooks/useFavorites";
import { useScheduleContext } from "../hooks/ScheduleContext";
import { EVENT_CHIP, EVENT_LABEL, genreLabel, statusLabel } from "../lib/labels";
import { showEventKind } from "../lib/show-event";
import {
  countdownLabel,
  gregorianFromStamp,
  leadHoursLabel,
  reminderDateWithLead,
  reminderTimeMsWithLead,
  tehranClock,
  toPersianDigits,
  weekdayName,
} from "../lib/date";
import { LEAD_OPTIONS, getSettings } from "../lib/settings";
import { Poster } from "../components/Poster";
import { JalaliSpans } from "../components/DateChip";
import { ShowCard } from "../components/ShowCard";
import { CreditsSection } from "../components/CreditsSection";
import { DownloadPanel } from "../components/DownloadPanel";
import { seriesDownloadKey } from "../lib/downloads";

import { cachedFetchJson } from "../lib/offline";
import { API_BASE } from "../lib/api";
import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { Button } from "../components/ui";

export function ShowDetailsPage() {
  const { id } = useParams();
  const showId = Number(id);
  const schedule = useScheduleContext();
  const favorites = useFavorites();
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["showDetailPage", showId],
    queryFn: () => cachedFetchJson<any>(`${API_BASE}/api/tv/${showId}`, 15000),
    enabled: Number.isFinite(showId),
    staleTime: 10 * 60 * 1000,
  });

  const scheduledShow = useMemo(() => schedule.shows.find((item) => item.id === showId), [schedule.shows, showId]);
  const show = useMemo(() => {
    if (scheduledShow) return scheduledShow;
    if (!detail) return undefined;
    return {
      id: detail.id ?? showId,
      title: detail.title ?? `سریال ${showId}`,
      originalTitle: detail.originalTitle ?? detail.title ?? "",
      posterPath: detail.posterPath ?? null,
      posterOriginal: detail.backdropPath ?? detail.posterPath ?? null,
      overview: detail.overview ?? "",
      genres: detail.genres ?? [],
      rating: detail.rating ?? null,
      votes: detail.votes ?? null,
      popularity: detail.popularity ?? null,
      weight: Math.round((detail.popularity ?? 0) * 10),
      status: detail.status ?? null,
      airstamp: detail.nextEpisode?.airdate ? `${detail.nextEpisode.airdate}T12:00:00Z` : null,
      airDate: detail.nextEpisode?.airdate ?? null,
      dateSource: (detail as any)?.dateSource ?? detail?.nextEpisode?.dateSource ?? null,
      dateConfidence: (detail as any)?.dateConfidence ?? null,
      tmdbAirdate: detail?.nextEpisode?.tmdbAirdate ?? null,
      countryCode: detail.countryCode ?? null,
      language: detail.language ?? null,
      network: detail.networkNames?.[0] ?? null,
      category: "returning" as const,
      source: "tmdb" as const,
      mediaType: "tv" as const,
    } as any;
  }, [scheduledShow, detail, showId]);
  const favorite = favorites.items.find(
    (item) => item.showId === showId && item.source === "tmdb",
  );
  const reminderOn = Boolean(favorite) && favorite?.reminderEnabled !== false;

  const related = useMemo(() => {
    if (!show) return [];
    const genres = show.genres ?? [];
    return schedule.shows
      .filter((item) => item.id !== show.id)
      .map((item) => ({ item, score: (item.genres ?? []).filter((genre) => genres.includes(genre)).length }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || (b.item.weight ?? 0) - (a.item.weight ?? 0))
      .slice(0, 6)
      .map((entry) => entry.item);
  }, [schedule.shows, show]);

  if (!show) {
    return (
      <div className="rounded-card border border-edge/10 bg-panel/70 px-4 py-14 text-center">
        {schedule.loading || detailLoading ? (
          <>
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-amber-400" />
            <p className="mt-3 text-sm text-ink-300">در حال بارگذاری…</p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-white">این سریال پیدا نشد</p>
            <p className="mt-1 text-xs text-muted">ممکن است از برنامهٔ آینده حذف شده باشد.</p>
            <Link to="/" className="mt-4 inline-block rounded-lg bg-amber-400 px-4 py-2 text-xs font-semibold text-ink-950">
              بازگشت به رادار
            </Link>
          </>
        )}
      </div>
    );
  }

  const isFavorite = Boolean(favorite);
  const countdown = countdownLabel(show.airstamp);
  const lead = favorite?.reminderLeadHours || getSettings().defaultLeadHours;
  const reminderAt = reminderTimeMsWithLead(show.airstamp, lead);
  const reminderClock = reminderAt ? tehranClock(new Date(reminderAt).toISOString()) : "—";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <BackButton className="text-muted" />
        <Button
          variant={isFavorite ? "primary" : "secondary"}
          size="sm"
          onClick={() => favorites.toggle(show.id, "tmdb", [show.title, show.originalTitle ?? ""])}
        >
          <Star className="h-3.5 w-3.5" fill={isFavorite ? "currentColor" : "none"} strokeWidth={1.8} />
          {isFavorite ? "ستاره‌دار" : "ستاره"}
        </Button>
      </div>

      <article className="overflow-hidden rounded-3xl border border-edge/10 bg-panel/80">
        <div className="relative">
          <Poster show={show} className="h-[300px] w-full" rounded="rounded-none" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-850 via-ink-850/40 to-transparent" />
          <div className="absolute inset-x-4 bottom-3">
            <span className={`inline-block rounded-full px-2 py-0.5 text-micro font-semibold ring-1 ${EVENT_CHIP[showEventKind(show)]}`}>
              {EVENT_LABEL[showEventKind(show)]}
            </span>
            <h1 className="mt-1.5 text-2xl font-extrabold leading-tight text-white" dir="auto">
              {show.title}
            </h1>
            {show.network && (
              <p className="mt-0.5 text-xs text-ink-300">
                {show.network}
                {show.countryCode ? ` · ${show.countryCode}` : ""}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2 text-caption">
            <span className="rounded-lg bg-white/6 px-2 py-1 text-ink-200">{statusLabel(show.status)}</span>
            {show.seasonNumber && (
              <span className="rounded-lg bg-white/6 px-2 py-1 text-ink-200">
                فصل {toPersianDigits(show.seasonNumber)}
              </span>
            )}
            {typeof show.rating === "number" && show.rating > 0 && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-brand/12 px-2 py-1 text-brand">
                <Star className="h-3 w-3" fill="currentColor" strokeWidth={0} /> {toPersianDigits(show.rating.toFixed(1))}
              </span>
            )}
            <span className="rounded-lg bg-white/6 px-2 py-1 text-ink-300">
              {show.dateSource === "tvmaze"
                ? "تأییدشده با TVMaze"
                : show.dateSource === "pattern"
                ? "تخمینی (الگوی فصل)"
                : show.dateSource === "pending"
                ? "در حال بررسی"
                : show.isDateConfirmed
                ? "تاریخ قطعی"
                : "زمان تقریبی"}
            </span>
            {show.tmdbAirdate && show.tmdbAirdate !== show.airDate && (
              <span className="rounded-lg bg-white/6 px-2 py-1 text-ink-400" title="تاریخ TMDB">
                TMDB: {show.tmdbAirdate}
              </span>
            )}
          </div>

          <div className="rounded-card border border-edge/10 bg-black/25 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-caption text-muted">پخش بعدی</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <JalaliSpans
                    stamp={show.airstamp}
                    className="text-2xl font-extrabold text-white"
                    yearClassName="text-sm font-normal text-muted"
                  />
                </div>
                <p className="mt-1 text-caption text-muted" dir="ltr" style={{ unicodeBidi: "isolate" }}>
                  {gregorianFromStamp(show.airstamp)}
                </p>
              </div>
              <div className="text-left">
                <div className="text-lg font-bold text-amber-300">{tehranClock(show.airstamp)}</div>
                <div className="text-caption text-muted">{weekdayName(show.airstamp)} · تهران</div>
              </div>
            </div>
            {countdown && countdown !== "پخش شده" && (
              <p className="mt-2 inline-block rounded-lg bg-amber-400/12 px-2 py-1 text-caption font-medium text-amber-200">
                {countdown}
                {weekdayName(show.airstamp) ? ` · ${weekdayName(show.airstamp)}` : ""}
              </p>
            )}
          </div>

          <div className="rounded-card border border-edge/10 bg-black/25 p-4">
            <p className="text-caption text-muted">یادآوری · {leadHoursLabel(lead)}</p>
            <p className="mt-1 text-sm font-semibold text-white">
              <JalaliSpans
                date={reminderDateWithLead(show.airstamp, lead)}
                className="text-sm font-semibold text-white"
                yearClassName="text-muted"
              />{" "}
              ساعت {reminderClock}
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-caption text-muted">
                {!favorite
                  ? "با ستاره‌کردن سریال فعال می‌شود"
                  : favorite.reminderEnabled === false
                    ? "برای این سریال خاموش است"
                    : `${leadHoursLabel(lead)} · ${reminderClock} تهران`}
              </p>
              <button
                type="button"
                onClick={() => {
                  if (!favorite) {
                    favorites.add(show.id, "tmdb", [show.title, show.originalTitle ?? ""]);
                    return;
                  }
                  favorites.setReminder(show.id, "tmdb", favorite.reminderEnabled === false);
                }}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                  reminderOn ? "bg-amber-400" : "bg-white/15"
                }`}
                aria-label="تغییر یادآوری"
                aria-pressed={reminderOn}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
                    reminderOn ? "left-0.5" : "right-0.5"
                  }`}
                />
              </button>
            </div>
            {favorite && (
              <div className="mt-3 border-t border-edge/10 pt-3">
                <p className="mb-1.5 text-caption text-muted">چقدر قبل یادآوری شود؟</p>
                <div className="flex flex-wrap gap-1.5">
                  {LEAD_OPTIONS.map((option) => (
                    <button
                      key={option.hours}
                      type="button"
                      onClick={() => favorites.setLead(show.id, "tmdb", option.hours)}
                      className={`sr-no-tap rounded-lg px-2.5 py-1 text-caption ${
                        lead === option.hours ? "bg-amber-400 font-semibold text-ink-950" : "bg-white/6 text-ink-300"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {show.overview && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <h2 className="text-title text-white">داستان</h2>
                <span className="text-micro text-muted">خلاصه به انگلیسی</span>
              </div>
              <p className="text-left text-body leading-7 text-ink-300" dir="auto">
                {show.overview}
              </p>
            </div>
          )}

          {!!show.genres?.length && (
            <div className="flex flex-wrap gap-1.5">
              {show.genres.map((item: string) => (
                <span key={item} className="rounded-lg bg-white/5 px-2 py-1 text-caption text-ink-300">
                  {genreLabel(item)}
                </span>
              ))}
            </div>
          )}

          <CreditsSection kind="series" creators={detail?.createdBy} creatorIds={detail?.createdByIds} cast={detail?.cast} />

          {show.officialSite && (
            <a
              href={show.officialSite}
              target="_blank"
              rel="noreferrer"
              className="block rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-center text-xs text-ink-200"
            >
              سایت رسمی سریال
            </a>
          )}
        </div>
      </article>

      <DownloadPanel keyName={seriesDownloadKey(showId, "tmdb")} enabled={isFavorite} />

      {related.length > 0 && (
        <section>
          <h2 className="mb-2.5 text-sm font-bold text-white">شبیه این سریال</h2>
          <div className="sr-hide-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {related.map((item) => (
              <div key={item.id} className="w-[136px] shrink-0">
                <ShowCard
                  show={item}
                  favorite={favorites.keys.has(`${item.source ?? "tmdb"}:${item.id}`)}
                  onToggleFavorite={() => favorites.toggle(item.id, item.source ?? "tmdb", [item.title, item.originalTitle ?? ""])}
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}export default ShowDetailsPage;
