import axios from "axios";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

interface TmdbSeason {
  season_number: number;
  air_date: string | null;
  name: string;
}

interface TmdbShowDetails {
  id: number;
  name: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  status?: string;
  seasons?: TmdbSeason[];
  next_episode_to_air?: { air_date?: string | null; season_number?: number | null } | null;
  first_air_date?: string;
}

interface TmdbDiscoverResult {
  id: number;
  name: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  first_air_date?: string;
}

interface TmdbDiscoverResponse {
  results: TmdbDiscoverResult[];
  total_pages: number;
}

export interface NormalizedShow {
  id: number;
  title: string;
  originalTitle?: string;
  overview?: string;
  posterPath?: string | null;
  status?: string;
  category: "new" | "returning" | "announced" | "unknown";
  nextSeasonNumber?: number | null;
  nextSeasonAirDate?: string | null;
  nextEpisodeAirDate?: string | null;
  isDateConfirmed?: boolean;
  lastSyncedAt: string;
}

function authHeaders() {
  const token = process.env.TMDB_BEARER_TOKEN;
  if (!token) throw new Error("TMDB_BEARER_TOKEN is not configured");
  return { Authorization: `Bearer ${token}` };
}

async function tmdbGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const response = await axios.get<T>(`${TMDB_BASE_URL}${path}`, {
    headers: authHeaders(),
    params: { language: "fa-IR", ...params },
    timeout: 15000,
  });
  return response.data;
}

function futureDate(value?: string | null): boolean {
  if (!value) return false;
  return value >= new Date().toISOString().slice(0, 10);
}

function normalizeDetails(details: TmdbShowDetails): NormalizedShow {
  const today = new Date().toISOString().slice(0, 10);
  const futureSeasons = (details.seasons ?? [])
    .filter((season) => season.season_number > 0 && futureDate(season.air_date))
    .sort((a, b) => String(a.air_date).localeCompare(String(b.air_date)));

  const nextSeason = futureSeasons[0];
  const nextEpisodeDate = details.next_episode_to_air?.air_date ?? null;
  const nextSeasonDate = nextSeason?.air_date ?? null;
  const nextDate = nextSeasonDate ?? nextEpisodeDate ?? null;

  let category: NormalizedShow["category"] = "unknown";
  if (details.status === "Returning Series") category = "returning";
  else if (details.status === "Planned" || details.status === "In Production") category = "announced";
  else if (details.first_air_date && details.first_air_date > today) category = "new";

  return {
    id: details.id,
    title: details.name,
    originalTitle: details.original_name,
    overview: details.overview,
    posterPath: details.poster_path,
    status: details.status,
    category,
    nextSeasonNumber: nextSeason?.season_number ?? details.next_episode_to_air?.season_number ?? null,
    nextSeasonAirDate: nextSeasonDate,
    nextEpisodeAirDate: nextEpisodeDate,
    isDateConfirmed: Boolean(nextDate && (nextEpisodeDate || nextSeasonDate)),
    lastSyncedAt: new Date().toISOString(),
  };
}

export async function getShowDetails(id: number): Promise<NormalizedShow> {
  const details = await tmdbGet<TmdbShowDetails>(`/tv/${id}`);
  return normalizeDetails(details);
}

export async function discoverUpcomingShows(maxPages = 2): Promise<NormalizedShow[]> {
  const statuses = ["0", "1", "2", "5"];
  const collected: NormalizedShow[] = [];

  for (const status of statuses) {
    for (let page = 1; page <= maxPages; page += 1) {
      const data = await tmdbGet<TmdbDiscoverResponse>("/discover/tv", {
        with_status: status,
        sort_by: "popularity.desc",
        page,
      });

      for (const item of data.results) {
        try {
          collected.push(await getShowDetails(item.id));
        } catch (error) {
          console.error(`Failed to fetch show ${item.id}`, error);
        }
      }

      if (page >= data.total_pages) break;
    }
  }

  const byId = new Map<number, NormalizedShow>();
  for (const show of collected) byId.set(show.id, show);
  return [...byId.values()];
}
