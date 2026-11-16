import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";

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
  imdbRating?: string | null;
  imdbId?: string | null;
}

async function fetchMovieSearch(query: string, page = 1) {
  const res = await fetch(`${API}/api/movies/search?q=${encodeURIComponent(query)}&page=${page}`);
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

async function fetchTVSearch(query: string, page = 1) {
  const res = await fetch(`${API}/api/tv/search?q=${encodeURIComponent(query)}&page=${page}`);
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

async function fetchDiscover(params: Record<string, string>, type: "movie" | "tv") {
  const queryString = new URLSearchParams(params).toString();
  const res = await fetch(`${API}/api/${type === "movie" ? "movies" : "tv"}/discover?${queryString}`);
  if (!res.ok) throw new Error("Discover failed");
  return res.json();
}

/** Live text search (debounced). Results are tagged with mediaType for correct routing. */
export function useLiveSearch(query: string, type: "movie" | "tv" | "all" = "all") {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const movieQuery = useQuery({
    queryKey: ["search", "movie", debouncedQuery],
    queryFn: () => fetchMovieSearch(debouncedQuery),
    enabled: debouncedQuery.length >= 2 && (type === "movie" || type === "all"),
    staleTime: 5 * 60 * 1000,
  });

  const tvQuery = useQuery({
    queryKey: ["search", "tv", debouncedQuery],
    queryFn: () => fetchTVSearch(debouncedQuery),
    enabled: debouncedQuery.length >= 2 && (type === "tv" || type === "all"),
    staleTime: 5 * 60 * 1000,
  });

  // Tag results explicitly so routing never depends on fragile field presence.
  const results: SearchResult[] = [
    ...(movieQuery.data?.items || []).map((r: SearchResult) => ({ ...r, mediaType: "movie" as const })),
    ...(tvQuery.data?.results || []).map((r: SearchResult) => ({ ...r, mediaType: "tv" as const })),
  ];

  return {
    results,
    isLoading: movieQuery.isFetching || tvQuery.isFetching,
    isFetching: movieQuery.isFetching || tvQuery.isFetching,
    isError: movieQuery.isError || tvQuery.isError,
  };
}

/** Discover/browse when no text query is present. */
export function useAdvancedSearch(filters: SearchFilters) {
  const params: Record<string, string> = {
    language: "en-US",
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
        return { items: (data.items || []).map((r: SearchResult) => ({ ...r, mediaType: "movie" as const })) };
      } else if (filters.type === "tv") {
        const data = await fetchDiscover(params, "tv");
        return { items: (data.results || []).map((r: SearchResult) => ({ ...r, mediaType: "tv" as const })) };
      }
      const [movies, tv] = await Promise.all([
        fetchDiscover(params, "movie"),
        fetchDiscover(params, "tv"),
      ]);
      return {
        items: [
          ...(movies.items || []).map((r: SearchResult) => ({ ...r, mediaType: "movie" as const })),
          ...(tv.results || []).map((r: SearchResult) => ({ ...r, mediaType: "tv" as const })),
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
