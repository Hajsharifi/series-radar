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

async function fetchDiscoverMovies(params: Record<string, string>) {
  const queryString = new URLSearchParams(params).toString();
  const res = await fetch(`${API}/api/movies/discover?${queryString}`);
  if (!res.ok) throw new Error("Discover failed");
  return res.json();
}

async function fetchDiscoverTV(params: Record<string, string>) {
  const queryString = new URLSearchParams(params).toString();
  const res = await fetch(`${API}/api/tv/discover?${queryString}`);
  if (!res.ok) throw new Error("Discover failed");
  return res.json();
}

export function useLiveSearch(query: string, type: "movie" | "tv" | "all" = "all") {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
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

  const results: SearchResult[] = [
    ...(movieQuery.data?.items || []),
    ...(tvQuery.data?.results || []),
  ];

  return {
    results,
    isLoading: movieQuery.isLoading || tvQuery.isLoading,
    isError: movieQuery.isError || tvQuery.isError,
  };
}

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
        return fetchDiscoverMovies(params);
      } else if (filters.type === "tv") {
        return fetchDiscoverTV(params);
      }
      const [movies, tv] = await Promise.all([
        fetchDiscoverMovies(params),
        fetchDiscoverTV(params),
      ]);
      return { items: [...(movies.items || []), ...(tv.results || [])] };
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
  53: "تریلر",
  10752: "جنگی",
  37: "vestern",
  10759: "اکشن و ماجراجویی",
  10762: "کودک",
  10763: "خبری",
  10764: "رئالیتی",
  10765: "علمی-تخیلی و فانتزی",
  10766: "سوپر اوپرا",
  10767: "توک‌شو",
  10768: "جنگ و سیاست",
};

export function getGenreName(id: number): string {
  return GENRE_MAP[id] || String(id);
}

export function getGenreId(name: string): number | null {
  const entry = Object.entries(GENRE_MAP).find(([, v]) => v === name);
  return entry ? Number(entry[0]) : null;
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