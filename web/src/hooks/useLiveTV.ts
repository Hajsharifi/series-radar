import { useQuery } from "@tanstack/react-query";
import type { Show } from "../types";
import { cachedFetchJson } from "../lib/offline";

const API = import.meta.env.VITE_API_BASE || "http://31.56.229.237:8090";

export interface LiveTVShow extends Show {
  episode?: {
    id: number;
    name: string;
    season: number;
    number: number;
    airdate: string;
    airtime: string;
    airstamp: string;
    summary: string | null;
  };
}

async function fetchLiveTVShows(endpoint: string) {
  return cachedFetchJson<any>(`${API}${endpoint}`);
}

async function fetchShowEpisodes(showId: number) {
  try {
    return await cachedFetchJson<{ episodes: any[] }>(`${API}/api/tv/${showId}/episodes`);
  } catch {
    return { episodes: [] };
  }
}

export function useOnTheAir() {
  return useQuery({
    queryKey: ["tv", "on_the_air"],
    queryFn: () => fetchLiveTVShows("/api/tv/on_the_air"),
    staleTime: 5 * 60 * 1000,
    select: (data) => data.results || [],
  });
}

export function useAiringToday() {
  return useQuery({
    queryKey: ["tv", "airing_today"],
    queryFn: () => fetchLiveTVShows("/api/tv/airing_today"),
    staleTime: 5 * 60 * 1000,
    select: (data) => data.results || [],
  });
}

export function useThisWeekEpisodes(favoriteIds: number[]) {
  return useQuery({
    queryKey: ["tv", "this_week", favoriteIds],
    queryFn: async () => {
      const now = new Date();
      const weekLater = new Date(now.getTime() + 7 * 86400000);
      const allEpisodes: (LiveTVShow["episode"] & { showId: number; show?: { title: string; posterPath: string | null; posterOriginal: string | null } })[] = [];

      // Fetch episodes for favorite shows only (to limit API calls)
      for (const showId of favoriteIds) {
        try {
          const [episodesData, showData] = await Promise.all([
            fetchShowEpisodes(showId),
            fetchLiveTVShows("/api/tv/" + showId),
          ]);
          for (const ep of episodesData.episodes || []) {
            if (ep.airstamp) {
              const airTime = new Date(ep.airstamp);
              if (airTime >= now && airTime <= weekLater) {
                allEpisodes.push({
                  ...ep,
                  showId,
                  show: {
                    title: showData.title || "",
                    posterPath: showData.posterPath || null,
                    posterOriginal: showData.backdropPath || null,
                  },
                });
              }
            }
          }
        } catch {
          // Ignore individual show errors
        }
      }

      // Sort by air time
      allEpisodes.sort((a, b) => new Date(a.airstamp!).getTime() - new Date(b.airstamp!).getTime());
      return allEpisodes.slice(0, 20);
    },
    enabled: favoriteIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/** Map TMDB API items to the Show shape used by cards, tagging them as tmdb. */
function safeShows(data: unknown): LiveTVShow[] {
  if (!Array.isArray(data)) return [];
  return (data as any[])
    .filter((item) => item && typeof item === "object" && item.id != null && typeof item.title === "string")
    .map((item) => {
      const next = item.nextEpisode || null;
      return {
        ...item,
        source: "tmdb" as const,
        category: "returning" as const,
        network: item.networkNames?.[0] || item.networks?.[0]?.name || null,
        airstamp: next?.airdate ? `${next.airdate}T12:00:00Z` : null,
        seasonNumber: next?.season ?? item.numberOfSeasons ?? null,
        episode: next
          ? {
              id: next.id,
              name: next.name,
              season: next.season,
              number: next.number,
              airdate: next.airdate,
              airtime: "",
              airstamp: next.airdate ? `${next.airdate}T12:00:00Z` : "",
              summary: next.overview ?? null,
            }
          : undefined,
      } as LiveTVShow;
    });
}

export function useLiveTVSections() {
  const onTheAir = useOnTheAir();
  const airingToday = useAiringToday();

  return {
    onTheAir: safeShows(onTheAir.data).slice(0, 10),
    airingToday: safeShows(airingToday.data).slice(0, 10),
    isLoading: onTheAir.isLoading || airingToday.isLoading,
    isError: onTheAir.isError || airingToday.isError,
  };
}