import { useQuery } from "@tanstack/react-query";
import { cachedFetchJson } from "../lib/offline";
import type { CastMember } from "../types";

const TVMAZE_API = "https://api.tvmaze.com";

export interface TvmazeCredits {
  cast: CastMember[];
  creators: string[];
}

/** Cast and creators for a TVMaze show. TVMaze exposes them through embeds,
 * so one extra request per detail screen is enough. */
export function useTvmazeCredits(showId: number | null) {
  return useQuery({
    queryKey: ["tvmazeCredits", showId],
    queryFn: async (): Promise<TvmazeCredits> => {
      const data = await cachedFetchJson<any>(
        `${TVMAZE_API}/shows/${showId}?embed[]=cast&embed[]=crew`,
        15000,
      );
      const cast: CastMember[] = ((data?._embedded?.cast ?? []) as any[])
        .slice(0, 8)
        .map((item) => ({
          name: item?.person?.name ?? "",
          character: item?.character?.name ?? null,
        }))
        .filter((item) => Boolean(item.name));
      const creators = Array.from(
        new Set(
          ((data?._embedded?.crew ?? []) as any[])
            .filter((item) => item?.type === "Creator")
            .map((item) => item?.person?.name)
            .filter((name): name is string => Boolean(name)),
        ),
      );
      return { cast, creators };
    },
    enabled: Number.isFinite(showId ?? NaN) && (showId ?? 0) > 0,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
  });
}
