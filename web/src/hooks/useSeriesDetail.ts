import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEpisodeTracking } from "./useEpisodeTracking";
import { cachedFetchJson } from "../lib/offline";
import { API_BASE } from "../lib/api";

async function fetchSeriesDetail(showId: number) {
  try {
    const [detail, episodesRes] = await Promise.all([
      cachedFetchJson<any>(`${API_BASE}/api/tv/${showId}`, 15000),
      cachedFetchJson<any>(`${API_BASE}/api/tv/${showId}/episodes`, 15000),
    ]);
    const episodes = (episodesRes?.episodes || []).map((ep: any) => ({
      id: ep.id,
      season: ep.season,
      number: ep.number,
      name: ep.name,
      airdate: ep.airdate,
      airtime: ep.airtime,
      airstamp: ep.airstamp,
      runtime: ep.runtime,
      rating: ep.rating,
      summary: ep.summary,
      image: ep.image,
    }));
    return {
      id: detail?.id ?? showId,
      name: detail?.title ?? `سریال ${showId}`,
      title: detail?.title ?? `سریال ${showId}`,
      image: detail?.posterPath ? { medium: detail.posterPath, original: detail.posterPath } : null,
      episodes,
      cast: (detail?.cast ?? []).map((c: any) => ({ id: c.id, name: c.name, character: c.character })),
      creators: detail?.createdBy ?? [],
      creatorIds: detail?.createdByIds ?? [],
      overview: detail?.overview ?? "",
      summary: detail?.overview ?? "",
      status: detail?.status ?? null,
      ended: null,
      premiered: detail?.firstAirDate ?? null,
      schedule: null as any,
      network: detail?.networkNames?.[0] ? { name: detail.networkNames[0] } : null,
      webChannel: null as any,
      genres: detail?.genres ?? [],
      rating: detail?.rating ?? null,
      officialSite: detail?.homepage ?? null,
      externals: { imdb: detail?.imdbId ?? null, thetvdb: null },
      _embedded: { episodes, cast: (detail?.cast ?? []).map((c: any) => ({ person: { id: c.id, name: c.name }, character: { name: c.character } })) },
    };
  } catch {
    return null;
  }
}

export function useSeriesDetail(showId: number | null) {
  const tracking = useEpisodeTracking();

  const { data, isLoading } = useQuery({
    queryKey: ["seriesDetail", showId],
    queryFn: () => fetchSeriesDetail(showId!),
    enabled: !!showId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const series = useMemo(() => {
    if (!data) return null;
    const watched = new Set(tracking.getWatched("tmdb", showId ?? 0));
    return {
      ...data,
      watchedEpisodes: watched,
      progress: {
        watched: (data.episodes || []).filter((episode: any) => watched.has(episode.id)).length,
        total: (data.episodes || []).length,
      },
    };
  }, [data, tracking.state, showId]);

  const toggleEpisode = useCallback(
    (episodeId: number) => {
      if (showId) tracking.toggleWatched("tmdb", showId, episodeId);
    },
    [showId, tracking.toggleWatched],
  );

  return { series, isLoading, toggleEpisode, isWatched: (episodeId: number) =>
    showId ? tracking.isWatched("tmdb", showId, episodeId) : false };
}
