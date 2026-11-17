import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEpisodeTracking } from "./useEpisodeTracking";
import { cachedFetchJson } from "../lib/offline";

const TVMAZE_API = "https://api.tvmaze.com";

async function fetchSeriesDetail(showId: number) {
  try {
    const show = await cachedFetchJson<any>(
      `${TVMAZE_API}/shows/${showId}?embed[]=episodes&embed[]=cast&embed[]=crew`,
    );
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
    const cast = ((show._embedded?.cast ?? []) as any[])
      .slice(0, 8)
      .map((item) => ({ id: item?.person?.id, name: item?.person?.name ?? "", character: item?.character?.name ?? null }))
      .filter((item: { name: string }) => Boolean(item.name));
    const creatorPeople = ((show._embedded?.crew ?? []) as any[])
      .filter((item) => item?.type === "Creator" && item?.person?.name)
      .map((item) => ({ id: item.person.id, name: item.person.name as string }));
    const seenCreators = new Set<string>();
    const uniqueCreators = creatorPeople.filter((person) => {
      if (seenCreators.has(person.name)) return false;
      seenCreators.add(person.name);
      return true;
    });
    return {
      ...show,
      episodes,
      cast,
      creators: uniqueCreators.map((person) => person.name),
      creatorIds: uniqueCreators.map((person) => person.id),
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
