import { useQuery } from "@tanstack/react-query";
import type { Show } from "../types";

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
  const res = await fetch(`${API}${endpoint}`);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function fetchShowEpisodes(showId: number) {
  const res = await fetch(`${API}/api/tv/${showId}/episodes`);
  if (!res.ok) return { episodes: [] };
  return res.json();
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

export function useLiveTVSections() {
  const onTheAir = useOnTheAir();
  const airingToday = useAiringToday();

  return {
    onTheAir: onTheAir.data?.slice(0, 10) || [],
    airingToday: airingToday.data?.slice(0, 10) || [],
    isLoading: onTheAir.isLoading || airingToday.isLoading,
    isError: onTheAir.isError || airingToday.isError,
  };
}