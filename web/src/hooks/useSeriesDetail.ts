import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEpisodeTracking } from "./useEpisodeTracking";
import { cachedFetchJson } from "../lib/offline";

const TVMAZE_API = "https://api.tvmaze.com";

async function fetchSeriesDetail(showId: number) {
  try {
    const show = await cachedFetchJson<any>(`${TVMAZE_API}/shows/${showId}?embed[]=episodes`);
    const episodes = (show._embedded?.episodes || []).map((ep: any) => ({
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
    return { ...show, episodes };
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
    const watched = new Set(tracking.getWatched("tvmaze", showId ?? 0));
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
      if (showId) tracking.toggleWatched("tvmaze", showId, episodeId);
    },
    [showId, tracking.toggleWatched],
  );

  return { series, isLoading, toggleEpisode, isWatched: (episodeId: number) =>
    showId ? tracking.isWatched("tvmaze", showId, episodeId) : false };
}
