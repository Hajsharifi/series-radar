import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { cachedFetchJson } from "../lib/offline";

const API = import.meta.env.VITE_API_BASE || "http://31.56.229.237:8090";

export interface SearchFilters {
  query: string;
  type: "movie" | "tv" | "all";
  genre: string;
  year: string;
  rating: string;
  status: string;
  network: string;
  sortBy: "popularity" | "rating" | "date";
  sortOrder: "desc" | "asc";
}

export interface SearchResult {
  id: number;
  title: string;
  mediaType?: "movie" | "tv";
  source?: "tmdb";
  originalTitle?: string;
  overview?: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  firstAirDate?: string | null;
  releaseDate?: string | null;
  rating?: number | null;
  votes?: number | null;
  popularity?: number | null;
  language?: string | null;
  genreIds?: number[];
  genres?: string[];
  status?: string | null;
  networks?: { name: string }[];
  networkNames?: string[];
  imdbRating?: string | null;
  imdbId?: string | null;
  matchScore?: number;
}

interface MultiSearchResponse {
  items: SearchResult[];
  suggestion?: { text: string; type?: "movie" | "tv" } | null;
  queries?: string[];
}

async function fetchMulti(query: string, type: "movie" | "tv" | "all") {
  const url = `${API}/api/search/multi?q=${encodeURIComponent(query)}&type=${type}`;
  return cachedFetchJson<MultiSearchResponse>(url);
}

async function fetchDiscover(params: Record<string, string>, type: "movie" | "tv") {
  const queryString = new URLSearchParams(params).toString();
  return cachedFetchJson<any>(`${API}/api/${type === "movie" ? "movies" : "tv"}/discover?${queryString}`);
}

/** Live Persian-aware search (debounced) with typo tolerance. */
export function useLiveSearch(query: string, type: "movie" | "tv" | "all" = "all") {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const search = useQuery({
    queryKey: ["search", "multi", debouncedQuery, type],
    queryFn: () => fetchMulti(debouncedQuery, type),
    enabled: debouncedQuery.length >= 2,
    staleTime: 5 * 60 * 1000,
  });

  const results: SearchResult[] = (search.data?.items || []).map((item) => ({
    ...item,
    source: "tmdb",
    mediaType: item.mediaType === "tv" ? "tv" : "movie",
  }));

  return {
    results,
    suggestion: search.data?.suggestion || null,
    isLoading: search.isFetching,
    isFetching: search.isFetching,
    isError: search.isError,
  };
}

/** Discover/browse when no text query is present. */
export function useAdvancedSearch(filters: SearchFilters) {
  const params: Record<string, string> = {
    sort_by: `${filters.sortBy}.${filters.sortOrder}`,
    include_adult: "false",
    page: "1",
  };
  if (filters.year) params["primary_release_date.gte"] = `${filters.year}-01-01`;
  if (filters.year) params["primary_release_date.lte"] = `${filters.year}-12-31`;
  if (filters.rating) params["vote_average.gte"] = filters.rating;
  if (filters.genre) params["with_genres"] = filters.genre;

  const queryKey = ["discover", filters.type, params];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (filters.type === "movie") {
        const data = await fetchDiscover(params, "movie");
        return { items: (data.items || []).map((r: SearchResult) => ({ ...r, mediaType: "movie" as const, source: "tmdb" as const })) };
      } else if (filters.type === "tv") {
        const data = await fetchDiscover(params, "tv");
        return { items: (data.results || []).map((r: SearchResult) => ({ ...r, mediaType: "tv" as const, source: "tmdb" as const })) };
      }
      const [movies, tv] = await Promise.all([
        fetchDiscover(params, "movie"),
        fetchDiscover(params, "tv"),
      ]);
      return {
        items: [
          ...(movies.items || []).map((r: SearchResult) => ({ ...r, mediaType: "movie" as const, source: "tmdb" as const })),
          ...(tv.results || []).map((r: SearchResult) => ({ ...r, mediaType: "tv" as const, source: "tmdb" as const })),
        ],
      };
    },
    enabled: !filters.query || filters.query.length < 2,
    staleTime: 5 * 60 * 1000,
  });

  return query;
}

export const GENRE_MAP: Record<number, string> = {
  28: "اکشن",
  12: "ماجراجویی",
  16: "انیمیشن",
  35: "کمدی",
  80: "جنایی",
  99: "مستند",
  18: "دراما",
  10751: "خانوادگی",
  14: "فانتزی",
  36: "تاریخی",
  27: "ترسناک",
  10402: "موزیکال",
  9648: "معمایی",
  10749: "رومانتیک",
  878: "علمی-تخیلی",
  10770: "فیلم تلویزیونی",
  53: "هیجانانگیز",
  10752: "جنگی",
  37: "وسترن",
  10759: "اکشن و ماجراجویی",
  10762: "کودک",
  10763: "خبری",
  10764: "رئالیتی",
  10765: "علمی-تخیلی و فانتزی",
  10766: "سوپر اوپرا",
  10767: "تاکشو",
  10768: "جنگ و سیاست",
};

export function getGenreName(id: number): string {
  return GENRE_MAP[id] || String(id);
}

export const ALL_GENRES = Object.entries(GENRE_MAP).map(([id, name]) => ({
  id: Number(id),
  name,
}));

export const SORT_OPTIONS = [
  { value: "popularity", label: "محبوبیت" },
  { value: "rating", label: "امتیاز" },
  { value: "date", label: "تاریخ انتشار" },
] as const;

export const RATING_OPTIONS = [
  { value: "", label: "همه" },
  { value: "7", label: "۷+" },
  { value: "8", label: "۸+" },
  { value: "9", label: "۹+" },
] as const;
