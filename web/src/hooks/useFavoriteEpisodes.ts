import { useQueries } from "@tanstack/react-query";
import { useFavorites } from "./useFavorites";
import { cachedFetchJson } from "../lib/offline";
import { API_BASE } from "../lib/api";
import { categoryFromEvent, eventKindFromEpisode } from "../lib/show-event";
import { favoriteKey, type FavoriteSource } from "../lib/favorites";
import type { Show } from "../types";

const TVMAZE_API = "https://api.tvmaze.com";

export interface FavoriteNextShow extends Show {
  favoriteKey: string;
}

interface NextEpisode {
  id?: number;
  season?: number | null;
  number?: number | null;
  name?: string | null;
  airdate?: string | null;
  airstamp?: string | null;
  overview?: string | null;
}

function buildShow(
  base: Partial<Show> & { id: number; title: string; source: FavoriteSource },
  next: NextEpisode | null,
  seasonCount?: number | null,
): FavoriteNextShow | null {
  if (!next?.airdate && !next?.airstamp) return null;
  const kind = eventKindFromEpisode(next, seasonCount);
  const airstamp = next.airstamp ?? `${next.airdate}T12:00:00Z`;
  return {
    id: base.id,
    title: base.title,
    originalTitle: base.originalTitle,
    overview: base.overview,
    posterPath: base.posterPath ?? null,
    posterOriginal: base.posterOriginal ?? null,
    status: base.status,
    category: categoryFromEvent(kind),
    eventKind: kind,
    seasonNumber: next.season ?? null,
    votes: base.votes ?? null,
    airDate: next.airdate ?? null,
    airstamp,
    airtime: null,
    network: base.network ?? null,
    countryCode: base.countryCode ?? null,
    genres: base.genres ?? [],
    language: base.language ?? null,
    rating: base.rating ?? null,
    weight: base.weight ?? 0,
    popularity: base.popularity ?? null,
    isDateConfirmed: true,
    officialSite: base.officialSite ?? null,
    updatedAt: new Date().toISOString(),
    source: base.source,
    mediaType: "tv",
    nextEpisode: {
      id: next.id,
      season: next.season ?? undefined,
      number: next.number ?? undefined,
      name: next.name ?? undefined,
      airdate: next.airdate ?? undefined,
      overview: next.overview ?? undefined,
    },
    favoriteKey: favoriteKey(base.id, base.source),
  };
}

async function tvmazeNext(showId: number): Promise<FavoriteNextShow | null> {
  const data = await cachedFetchJson<any>(
    `${TVMAZE_API}/shows/${showId}?embed[]=nextepisode`,
    15000,
  );
  const next: NextEpisode | null = data?._embedded?.nextepisode ?? null;
  return buildShow(
    {
      id: showId,
      title: data?.name ?? `سریال ${showId}`,
      source: "tvmaze",
      posterPath: data?.image?.medium ?? null,
      posterOriginal: data?.image?.original ?? null,
      network: data?.network?.name ?? data?.webChannel?.name ?? null,
      countryCode: data?.network?.country?.code ?? null,
      genres: data?.genres ?? [],
      language: data?.language ?? null,
      rating: data?.rating?.average ?? null,
      weight: data?.weight ?? 0,
      status: data?.status ?? null,
    },
    next,
  );
}

async function tmdbNext(showId: number): Promise<FavoriteNextShow | null> {
  const data = await cachedFetchJson<any>(`${API_BASE}/api/tv/${showId}`, 15000);
  const next: NextEpisode | null = data?.nextEpisode ?? null;
  return buildShow(
    {
      id: showId,
      title: data?.title ?? `سریال ${showId}`,
      originalTitle: data?.originalTitle ?? undefined,
      overview: data?.overview ?? undefined,
      source: "tmdb",
      posterPath: data?.posterPath ?? null,
      posterOriginal: data?.backdropPath ?? data?.posterPath ?? null,
      network: data?.networkNames?.[0] ?? null,
      genres: data?.genres ?? [],
      language: data?.language ?? null,
      rating: data?.rating ?? null,
      votes: data?.votes ?? null,
      weight: Math.round((data?.popularity ?? 0) * 10),
      popularity: data?.popularity ?? null,
      status: data?.status ?? null,
    },
    next,
    data?.numberOfSeasons ?? null,
  );
}

export function useFavoriteEpisodes() {
  const favorites = useFavorites();
  // Every starred show must get its episode query: capping the list silently
  // drops reminders and download checks for shows beyond the first N. Results
  // are cached for 6h, so this stays cheap after the first load.
  const results = useQueries({
    queries: favorites.items.map((item) => ({
      queryKey: ["favoriteNext", item.source, item.showId],
      queryFn: () => (item.source === "tmdb" ? tmdbNext(item.showId) : tvmazeNext(item.showId)),
      enabled: item.showId > 0,
      staleTime: 6 * 60 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: 1,
    })),
  });

  const items = results
    .map((result) => result.data ?? null)
    .filter((show): show is FavoriteNextShow => Boolean(show));
  const byKey = new Map(items.map((show) => [show.favoriteKey, show]));

  return {
    items,
    byKey,
    loading: results.some((result) => result.isLoading),
  };
}
