import { useQuery } from "@tanstack/react-query";
import { cachedFetchJson } from "../lib/offline";
import type { CastMember } from "../types";

const TVMAZE_API = "https://api.tvmaze.com";

export interface TvmazeCredits {
  cast: CastMember[];
  creators: string[];
  creatorIds: number[];
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
          id: item?.person?.id,
          name: item?.person?.name ?? "",
          character: item?.character?.name ?? null,
        }))
        .filter((item) => Boolean(item.name));
      const creatorPeople = ((data?._embedded?.crew ?? []) as any[])
        .filter((item) => item?.type === "Creator" && item?.person?.name)
        .map((item) => ({ id: item.person.id as number, name: item.person.name as string }));
      const seen = new Set<string>();
      const unique = creatorPeople.filter((person) => {
        if (seen.has(person.name)) return false;
        seen.add(person.name);
        return true;
      });
      return { cast, creators: unique.map((person) => person.name), creatorIds: unique.map((person) => person.id) };
    },
    enabled: Number.isFinite(showId ?? NaN) && (showId ?? 0) > 0,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
  });
}
