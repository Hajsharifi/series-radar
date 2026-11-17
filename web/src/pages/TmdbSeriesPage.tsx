import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { BackButton } from "../components/BackButton";
import { useQuery } from "@tanstack/react-query";
import { cachedFetchJson } from "../lib/offline";
import { openExternalUrl } from "../lib/native";
import { gregorianDate, jalaliDate, leadHoursLabel, toPersianDigits } from "../lib/date";
import { GENRE_MAP } from "../hooks/useSearch";
import { useEpisodeTracking } from "../hooks/useEpisodeTracking";
import { Poster } from "../components/Poster";
import { CreditsSection } from "../components/CreditsSection";
import type { CastMember } from "../types";
import { API_BASE } from "../lib/api";
import { useFavorites } from "../hooks/useFavorites";
import { LEAD_OPTIONS, getSettings } from "../lib/settings";

const API = API_BASE;

interface TmdbEpisode {
  id: number;
  season: number;
  number: number;
  name?: string;
  airdate?: string | null;
  summary?: string | null;
  image?: { medium?: string; original?: string } | null;
}

interface TmdbSeason {
  seasonNumber?: number;
  name?: string;
  episodeCount?: number;
  airDate?: string | null;
  posterPath?: string | null;
}

interface TmdbSeries {
  id: number;
  title: string;
  originalTitle?: string | null;
  overview?: string | null;
  tagline?: string | null;
  posterPath?: string | null;
  backdropPath?: string | null;
  firstAirDate?: string | null;
  lastAirDate?: string | null;
  rating?: number | null;
  votes?: number | null;
  status?: string | null;
  numberOfSeasons?: number | null;
  numberOfEpisodes?: number | null;
  networkNames?: string[];
  genres?: string[];
  genreIds?: number[];
  language?: string | null;
  productionCountries?: string[];
  spokenLanguages?: string[];
  episodeRunTime?: number[];
  trailerKey?: string | null;
  imdbRating?: string | null;
  createdBy?: string[];
  createdByIds?: number[];
  directors?: string[];
  directorIds?: number[];
  cast?: CastMember[];
  omdbDirector?: string | null;
  omdbActors?: string | null;
  seasons?: TmdbSeason[];
  nextEpisode?: { season?: number; number?: number; name?: string; airdate?: string } | null;
}

function backdrop(path?: string | null): string | null {
  return path ? `https://image.tmdb.org/t/p/w780${path}` : null;
}

function formatDay(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  return `${jalaliDate(date)} (${gregorianDate(date)})`;
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/6 bg-white/4 px-3 py-2">
      <p className="text-[10px] text-ink-400">{label}</p>
      <p className="mt-0.5 text-xs font-semibold text-ink-100" dir="auto">{value || "—"}</p>
    </div>
  );
}

export default function TmdbSeriesPage() {
  const { id } = useParams<{ id: string }>();
  const showId = Number(id);
  const [openSeason, setOpenSeason] = useState<number | null>(null);
  const tracking = useEpisodeTracking();
  const favorites = useFavorites();
  const favorite = favorites.find(showId, "tmdb");
  const reminderOn = Boolean(favorite) && favorite?.reminderEnabled !== false;
  const lead = favorite?.reminderLeadHours ?? getSettings().defaultLeadHours;

  const showQuery = useQuery({
    queryKey: ["tmdbSeries", showId],
    queryFn: () => cachedFetchJson<TmdbSeries>(`${API}/api/tv/${showId}`),
    enabled: Number.isFinite(showId),
    staleTime: 6 * 60 * 60 * 1000,
  });

  const episodesQuery = useQuery({
    queryKey: ["tmdbEpisodes", showId],
    queryFn: () => cachedFetchJson<{ episodes: TmdbEpisode[] }>(`${API}/api/tv/${showId}/episodes`),
    enabled: Number.isFinite(showId),
    staleTime: 6 * 60 * 60 * 1000,
  });

  const similarQuery = useQuery({
    queryKey: ["tmdbSimilar", "tv", showId],
    queryFn: () => cachedFetchJson<{ results: TmdbSeries[] }>(`${API}/api/tv/${showId}/similar`),
    enabled: Number.isFinite(showId),
    staleTime: 6 * 60 * 60 * 1000,
  });

  const show = showQuery.data;
  const episodes = episodesQuery.data?.episodes || [];
  const watched = useMemo(
    () => new Set(tracking.getWatched("tmdb", showId)),
    [tracking.state, showId],
  );
  const watchedCount = episodes.filter((episode) => watched.has(episode.id)).length;
  const nextUnwatched = useMemo(
    () =>
      episodes
        .filter((episode) => !watched.has(episode.id))
        .sort((a, b) => (a.season || 0) - (b.season || 0) || (a.number || 0) - (b.number || 0))[0] || null,
    [episodes, watched],
  );
  const seasons = useMemo(() => {
    const map = new Map<number, TmdbEpisode[]>();
    for (const episode of episodes) {
      const key = episode.season || 0;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(episode);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [episodes]);

  if (showQuery.isLoading) {
    return <div className="rounded-2xl bg-ink-850/60 px-4 py-16 text-center text-sm text-ink-300">در حال بارگذاری…</div>;
  }

  if (!show || !show.id) {
    return (
      <div className="rounded-2xl border border-white/8 bg-ink-850/60 px-4 py-14 text-center">
        <p className="text-sm font-semibold text-white">این سریال پیدا نشد</p>
        <Link to="/" className="mt-4 inline-block rounded-lg bg-amber-400 px-4 py-2 text-xs font-semibold text-ink-950">
          بازگشت به رادار
        </Link>
      </div>
    );
  }

  const similar = (similarQuery.data?.results || []).filter((item) => item.id && item.title);
  const hero = backdrop(show.backdropPath);
  const genreNames = show.genres?.length
    ? show.genres
    : (show.genreIds ?? []).map((id) => GENRE_MAP[id]).filter(Boolean);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <BackButton className="text-ink-400" />
        <button
          type="button"
          onClick={() => favorites.toggle(showId, "tmdb")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            favorite ? "bg-amber-400 text-ink-950" : "bg-white/8 text-white"
          }`}
        >
          {favorite ? "★ ستاره‌دار" : "☆ ستاره"}
        </button>
      </div>

      <article className="overflow-hidden rounded-3xl border border-white/8 bg-ink-850/70">
        <div className="relative h-52 sm:h-64">
          {hero && <img src={hero} alt="" className="h-full w-full object-cover opacity-70" />}
          <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/50 to-transparent" />
          <div className="absolute bottom-4 right-4 flex items-end gap-3">
            <Poster
              show={{ id: show.id, title: show.title, posterPath: show.posterPath, posterOriginal: show.backdropPath, category: "returning", source: "tmdb" }}
              className="h-32 w-24 shrink-0 rounded-xl"
              rounded="rounded-xl"
            />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-amber-300">سریال</p>
              <h1 className="line-clamp-2 text-lg font-extrabold leading-snug text-white" dir="auto">{show.title}</h1>
              {show.originalTitle && show.originalTitle !== show.title && (
                <p className="truncate text-xs text-ink-300" dir="auto">{show.originalTitle}</p>
              )}
              {show.tagline && <p className="mt-1 line-clamp-1 text-[11px] italic text-ink-400" dir="auto">{show.tagline}</p>}
            </div>
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {typeof show.rating === "number" && show.rating > 0 && (
              <span className="rounded-lg bg-amber-400/15 px-2 py-1 font-bold text-amber-200">★ {toPersianDigits(show.rating.toFixed(1))}</span>
            )}
            {show.imdbRating && <span className="rounded-lg bg-white/6 px-2 py-1 text-ink-200">IMDb {show.imdbRating}</span>}
            {genreNames.slice(0, 4).map((genre) => (
              <span key={genre} className="rounded-lg bg-white/6 px-2 py-1 text-ink-300">{genre}</span>
            ))}
          </div>

          {show.overview && <p className="text-xs leading-relaxed text-ink-200" dir="auto">{show.overview}</p>}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Info label="وضعیت" value={show.status === "Returning Series" ? "در حال پخش" : show.status === "Ended" ? "پایان یافته" : show.status} />
            <Info label="اولین پخش" value={formatDay(show.firstAirDate)} />
            <Info label="آخرین پخش" value={formatDay(show.lastAirDate)} />
            <Info label="فصل / قسمت" value={`${toPersianDigits(show.numberOfSeasons ?? 0)} / ${toPersianDigits(show.numberOfEpisodes ?? 0)}`} />
            <Info label="شبکه" value={show.networkNames?.join(" · ")} />
            <Info label="زبان" value={show.language ?? show.spokenLanguages?.[0]} />
            <Info label="کشور" value={show.productionCountries?.join(" · ")} />
            <Info label="مدت قسمت" value={show.episodeRunTime?.[0] ? `${toPersianDigits(show.episodeRunTime[0])} دقیقه` : null} />
            {show.nextEpisode && (
              <Info
                label="قسمت بعدی"
                value={`فصل ${toPersianDigits(show.nextEpisode.season ?? 0)} · قسمت ${toPersianDigits(show.nextEpisode.number ?? 0)} — ${formatDay(show.nextEpisode.airdate)}`}
              />
            )}
            {nextUnwatched && (
              <Info
                label="اولین قسمت ندیده"
                value={`فصل ${toPersianDigits(nextUnwatched.season ?? 0)} · قسمت ${toPersianDigits(nextUnwatched.number ?? 0)}`}
              />
            )}
          </div>

          <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] text-ink-400">یادآوری قسمت بعدی · {leadHoursLabel(lead)}</p>
                <p className="mt-1 text-xs font-semibold text-ink-100">
                  {!favorite
                    ? "با ستاره‌کردن سریال فعال می‌شود"
                    : !show.nextEpisode
                      ? "قسمت بعدی هنوز اعلام نشده"
                      : reminderOn
                        ? `فصل ${toPersianDigits(show.nextEpisode.season ?? 0)} · قسمت ${toPersianDigits(show.nextEpisode.number ?? 0)}`
                        : "برای این سریال خاموش است"}
                </p>
              </div>
              <button
                type="button"
                aria-label="تغییر یادآوری"
                aria-pressed={reminderOn}
                onClick={() => {
                  if (!favorite) {
                    favorites.add(showId, "tmdb");
                    return;
                  }
                  favorites.setReminder(showId, "tmdb", favorite.reminderEnabled === false);
                }}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${reminderOn ? "bg-amber-400" : "bg-white/15"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${reminderOn ? "left-0.5" : "right-0.5"}`} />
              </button>
            </div>
            {favorite && (
              <div className="mt-3 border-t border-white/8 pt-3">
                <p className="mb-1.5 text-[11px] text-ink-400">چقدر قبل یادآوری شود؟</p>
                <div className="flex flex-wrap gap-1.5">
                  {LEAD_OPTIONS.map((option) => (
                    <button
                      key={option.hours}
                      type="button"
                      onClick={() => favorites.setLead(showId, "tmdb", option.hours)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] ${
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

          <CreditsSection
            kind="series"
            creators={show.createdBy}
            creatorIds={show.createdByIds}
            directors={show.directors}
            directorIds={show.directorIds}
            cast={show.cast}
            fallbackDirector={show.omdbDirector}
            fallbackActors={show.omdbActors}
          />

          {show.trailerKey && (
            <button
              type="button"
              onClick={() => openExternalUrl(`https://www.youtube.com/watch?v=${show.trailerKey}`)}
              className="w-full rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 active:bg-rose-500/20"
            >
              ▶ تماشای تریلر
            </button>
          )}
        </div>
      </article>

      {/* Seasons / episodes */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">قسمتها</h2>
          <span className="text-[11px] text-ink-400">
            {toPersianDigits(watchedCount)} / {toPersianDigits(episodes.length)} دیده شده
          </span>
        </div>
        {episodes.length > 0 && (
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all"
              style={{ width: `${Math.min(100, (watchedCount / episodes.length) * 100)}%` }}
            />
          </div>
        )}
        {seasons.length === 0 ? (
          <p className="rounded-xl border border-white/8 bg-ink-850/60 px-3 py-5 text-center text-xs text-ink-400">
            اطلاعات قسمتها در دسترس نیست.
          </p>
        ) : (
          seasons.map(([seasonNumber, items]) => {
            const open = openSeason === seasonNumber || (openSeason === null && seasonNumber === seasons[0][0]);
            return (
              <div key={seasonNumber} className="overflow-hidden rounded-2xl border border-white/8 bg-ink-850/60">
                <button
                  type="button"
                  onClick={() => setOpenSeason(open ? -1 : seasonNumber)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-right text-xs font-semibold text-white"
                >
                  <span>فصل {toPersianDigits(seasonNumber)}</span>
                  <span className="text-ink-400">{toPersianDigits(items.length)} قسمت · {open ? "▲" : "▼"}</span>
                </button>
                {open && (
                  <div className="divide-y divide-white/6">
                    {items.map((episode) => {
                      const isWatched = watched.has(episode.id);
                      return (
                        <div key={episode.id} className="flex gap-3 px-3 py-2.5">
                          <span className={`w-7 shrink-0 text-xs font-bold tabular-nums ${isWatched ? "text-emerald-300" : "text-amber-300/90"}`}>
                            {toPersianDigits(episode.number)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className={`text-xs font-semibold ${isWatched ? "text-ink-400 line-through" : "text-white"}`} dir="auto">
                              {episode.name || `قسمت ${episode.number}`}
                            </p>
                            {episode.summary && <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-ink-400" dir="auto">{episode.summary}</p>}
                          </div>
                          {episode.airdate && <span className="shrink-0 text-[10px] text-ink-400">{formatDay(episode.airdate)}</span>}
                          <button
                            type="button"
                            onClick={() => tracking.toggleWatched("tmdb", showId, episode.id)}
                            aria-label={isWatched ? "علامت دیدن را بردار" : "این قسمت را دیدم"}
                            aria-pressed={isWatched}
                            className={`sr-no-tap grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold transition ${
                              isWatched ? "bg-emerald-400 text-ink-950" : "bg-white/6 text-white/50 active:bg-white/12"
                            }`}
                          >
                            {isWatched ? "✓" : "○"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      {similar.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-white">عنوانهای مشابه</h2>
          <div className="sr-hide-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {similar.map((item) => (
              <Link key={item.id} to={`/tv/${item.id}`} className="sr-no-tap w-[120px] shrink-0">
                <Poster
                  show={{ id: item.id, title: item.title, posterPath: item.posterPath, posterOriginal: item.backdropPath, category: "returning", source: "tmdb" }}
                  className="aspect-[2/3] w-full"
                />
                <p className="mt-1 line-clamp-2 text-[11px] font-semibold text-white" dir="auto">{item.title}</p>
                {item.originalTitle && item.originalTitle !== item.title && (
                  <p className="truncate text-[10px] text-ink-400" dir="auto">{item.originalTitle}</p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
