import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Archive, Download, ExternalLink, RefreshCw } from "lucide-react";
import { useFavorites } from "../hooks/useFavorites";
import { useFavoriteEpisodes } from "../hooks/useFavoriteEpisodes";
import { useScheduleContext } from "../hooks/ScheduleContext";
import { useMovieCatalog, useMovieFavorites } from "../hooks/useMovies";
import { useDownloads } from "../hooks/useDownloads";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { favoriteKey, favoriteIdentities, groupByIdentity, titleIdentity } from "../lib/favorites";
import { relativeSyncLabel, toPersianDigits } from "../lib/date";
import {
  detailRouteFor,
  markDownloadsSeen,
  movieDownloadKey,
  payloadLinkCount,
  seriesDownloadKey,
  unseenLinkIds,
} from "../lib/downloads";
import { getMovieRemovals, subscribeMovieRemovals } from "../lib/movie-removals";
import { openExternalUrl } from "../lib/native";
import { DownloadLinksBody } from "../components/DownloadPanel";
import { EmptyState, SkeletonRows } from "../components/StateViews";
import { Button } from "../components/ui";

interface Entry {
  key: string;
  title: string;
  kind: "movie" | "series";
  archived: boolean;
  route: string | null;
}

export default function DownloadsPage() {
  const favorites = useFavorites();
  const movieFavorites = useMovieFavorites();
  const schedule = useScheduleContext();
  const episodes = useFavoriteEpisodes();
  const catalog = useMovieCatalog();
  const [params] = useSearchParams();
  const focus = params.get("focus") ?? "";
  const [removals, setRemovals] = useState(() => getMovieRemovals());
  const [fresh, setFresh] = useState<Record<string, number>>({});

  useEffect(() => {
    const sync = () => setRemovals(getMovieRemovals());
    sync();
    return subscribeMovieRemovals(sync);
  }, []);

  const entries = useMemo<Entry[]>(() => {
    const byKey = new Map<string, Entry>();
    const seriesRows = favorites.items.map((favorite) => {
      const source = favorite.source === "tmdb" ? "tmdb" : "tmdb";
      const key = seriesDownloadKey(favorite.showId, source);
      const keyString = favoriteKey(favorite.showId, favorite.source);
      const show = schedule.shows.find((item) => favoriteKey(item.id, item.source ?? "tmdb") === keyString)
        ?? episodes.byKey.get(keyString);
      const entry: Entry = {
        key,
        title: show?.title ?? `سریال ${favorite.showId}`,
        kind: "series",
        archived: false,
        route: detailRouteFor(key),
      };
      return {
        favorite,
        entry,
        identities: favoriteIdentities(favorite, show?.title, show?.originalTitle),
      };
    });
    // One download card per real show. TMDB wins when both sources are starred.
    for (const group of groupByIdentity(seriesRows)) {
      const canonical = group.find((row) => row.favorite.source === "tmdb") ?? group[0];
      byKey.set(canonical.entry.key, canonical.entry);
    }

    const seenMovies = new Set<string>();
    for (const favorite of movieFavorites.items) {
      const movie = catalog.byId.get(favorite.movieId);
      const identity = movie ? titleIdentity(movie.title) : "";
      const cardKey = identity || `id:${favorite.movieId}`;
      if (seenMovies.has(cardKey)) continue;
      seenMovies.add(cardKey);
      const key = movieDownloadKey(favorite.movieId);
      byKey.set(key, {
        key,
        title: movie?.title ?? `فیلم ${favorite.movieId}`,
        kind: "movie",
        archived: false,
        route: detailRouteFor(key),
      });
    }
    for (const removal of removals) {
      if (removal.reason !== "available") continue;
      const identity = titleIdentity(removal.title);
      const cardKey = identity || `id:${removal.movieId}`;
      if (seenMovies.has(cardKey)) continue;
      seenMovies.add(cardKey);
      const key = movieDownloadKey(removal.movieId);
      if (byKey.has(key)) continue;
      byKey.set(key, {
        key,
        title: removal.title,
        kind: "movie",
        archived: true,
        route: detailRouteFor(key),
      });
    }
    return Array.from(byKey.values()).slice(0, 40);
  }, [favorites.items, movieFavorites.items, schedule.shows, episodes.byKey, catalog.byId, removals]);

  const { items, loading, refreshing, error, refresh } = useDownloads(
    entries.map((entry) => entry.key),
    entries.length > 0,
  );
  usePullToRefresh(refresh, { threshold: 80 });

  useEffect(() => {
    const next: Record<string, number> = {};
    for (const entry of entries) {
      const payload = items[entry.key];
      if (!payload || payload.status !== "found") continue;
      const count = unseenLinkIds(entry.key, payload).length;
      if (count > 0) next[entry.key] = count;
    }
    setFresh(next);
    const keys = Object.keys(next);
    if (keys.length === 0) return;
    const timer = window.setTimeout(() => {
      for (const key of keys) markDownloadsSeen(key, items[key]);
      setFresh({});
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [entries, items]);

  const found = entries
    .filter((entry) => items[entry.key]?.status === "found")
    .sort((a, b) => Number(b.key === focus) - Number(a.key === focus));
  const waiting = entries.filter(
    (entry) => entry.archived && items[entry.key]?.status === "none",
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-caption font-medium tracking-wide text-emerald-300/90">وقتی لینک منتشر شود</p>
          <h1 className="mt-1 text-2xl font-extrabold text-white">لینکهای دانلود</h1>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            فقط سریالها و فیلمهای ستارهشده بررسی میشوند. هر ساعت یکبار چک میشوند و لینک جدید یکبار اعلان میدهند.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={refresh}
          disabled={refreshing || entries.length === 0}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} strokeWidth={1.8} />
          بررسی همین حالا
        </Button>
      </header>

      {error && (
        <p role="alert" className="rounded-xl border border-amber-400/15 bg-amber-500/8 px-3 py-2 text-caption text-amber-200">
          {error} نتایج قبلی نمایش داده میشود.
        </p>
      )}

      {loading && entries.length > 0 && <SkeletonRows count={4} />}

      {!loading && entries.length === 0 && (
        <EmptyState
          icon={<Download className="h-5 w-5" strokeWidth={1.8} />}
          title="هنوز موردی برای بررسی نیست"
          description="سریال یا فیلمی را ستاره کنید تا در اینجا لینک دانلودش را ببینید."
          action={
            <div className="flex flex-wrap gap-2">
              <Link to="/" className="rounded-lg bg-white/8 px-4 py-2 text-xs text-white">رفتن به رادار</Link>
              <Link to="/movies" className="rounded-lg bg-white/8 px-4 py-2 text-xs text-white">رفتن به فیلمها</Link>
            </div>
          }
        />
      )}

      {!loading && entries.length > 0 && found.length === 0 && waiting.length === 0 && (
        <EmptyState
          icon={<Download className="h-5 w-5" strokeWidth={1.8} />}
          title="هنوز لینکی منتشر نشده است"
          description="منبع Film2Media هنوز لینکی برای این عنوانها ندارد؛ بررسی هر ساعت ادامه دارد."
        />
      )}

      {found.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">لینک آماده</h2>
          {found.map((entry) => {
            const payload = items[entry.key];
            const count = payloadLinkCount(payload);
            return (
              <div
                key={entry.key}
                className={`space-y-2 rounded-card border bg-panel/70 p-3 ${
                  entry.key === focus ? "border-emerald-400/40" : "border-edge/10"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {entry.route ? (
                        <Link to={entry.route} className="text-body font-bold text-white hover:text-emerald-200">
                          {entry.title}
                        </Link>
                      ) : (
                        <span className="text-body font-bold text-white">{entry.title}</span>
                      )}
                      {entry.archived && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2 py-0.5 text-micro text-ink-200">
                          <Archive className="h-3 w-3" strokeWidth={1.8} />
                          از ستارههای اخیر
                        </span>
                      )}
                      {fresh[entry.key] > 0 && (
                        <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-micro font-semibold text-emerald-300">
                          {toPersianDigits(fresh[entry.key])} لینک تازه
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-micro text-muted">
                      {toPersianDigits(count)} لینک · آخرین بررسی {relativeSyncLabel(payload.checkedAt)}
                      {entry.kind === "series" ? " · سریال" : " · فیلم"}
                    </p>
                  </div>
                  {payload.source?.url && (
                    <button
                      type="button"
                      onClick={() => openExternalUrl(payload.source!.url)}
                      aria-label="باز کردن منبع"
                      className="rounded-lg p-1.5 text-muted hover:bg-white/6 hover:text-white"
                    >
                      <ExternalLink className="h-4 w-4" strokeWidth={1.8} />
                    </button>
                  )}
                </div>
                <details open={entry.key === focus}>
                  <summary className="cursor-pointer text-caption text-ink-200">نمایش لینکها</summary>
                  <div className="mt-2">
                    <DownloadLinksBody payload={payload} />
                  </div>
                </details>
              </div>
            );
          })}
        </section>
      )}

      {waiting.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">در انتظار لینک</h2>
          <p className="text-caption text-muted">
            این فیلمها از ستارهها خارج شدند ولی تا پیدا شدن لینک، در پسزمینه بررسی میشوند.
          </p>
          {waiting.map((entry) => (
            <Link
              key={entry.key}
              to={entry.route ?? "/movie-history"}
              className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-edge/10 bg-panel/70 p-3 hover:border-emerald-400/25"
            >
              <span className="flex items-center gap-2 text-body text-white">
                <Archive className="h-3.5 w-3.5 text-muted" strokeWidth={1.8} />
                {entry.title}
              </span>
              <span className="text-micro text-muted">هنوز لینکی نیست</span>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
