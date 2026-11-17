import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
    return {
      ...show,
      episodes,
      watchedEpisodes: new Set<number>(),
      progress: { watched: 0, total: episodes.length },
    } as any;
  } catch {
    return null;
  }
}

export function useSeriesDetail(showId: number | null) {
  const queryClient = useQueryClient();
  const tracking = useEpisodeTracking();

  const { data: series, isLoading } = useQuery({
    queryKey: ["seriesDetail", showId],
    queryFn: () => fetchSeriesDetail(showId!),
    enabled: !!showId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const toggleEpisode = useCallback(
    async (episodeId: number) => {
      if (!showId) return;
      await tracking.toggleWatched(showId, episodeId);
      queryClient.invalidateQueries({ queryKey: ["seriesDetail", showId] });
    },
    [showId, tracking, queryClient]
  );

  return { series, isLoading, toggleEpisode };
}