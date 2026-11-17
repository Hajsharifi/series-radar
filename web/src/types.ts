export type ShowCategory = "new" | "returning" | "announced";

/** What the next broadcast actually is - a season premiere is not the same
 * thing as the next episode of a season that is already airing. */
export type ShowEventKind = "series-premiere" | "season-premiere" | "new-episode" | "airing";

export interface CastMember {
  name: string;
  character?: string | null;
  profilePath?: string | null;
}

export interface Show {
  /** TVMaze show id */
  id: number;
  title: string;
  originalTitle?: string;
  overview?: string;
  posterPath?: string | null;
  posterOriginal?: string | null;
  status?: string;
  category: ShowCategory;
  eventKind?: ShowEventKind;
  seasonNumber?: number | null;
  /** ISO date (YYYY-MM-DD) in the broadcaster's own calendar */
  airDate?: string | null;
  /** ISO instant, used to convert to Tehran time */
  airstamp?: string | null;
  airtime?: string | null;
  network?: string | null;
  countryCode?: string | null;
  genres?: string[];
  language?: string | null;
  rating?: number | null;
  votes?: number | null;
  weight?: number;
  popularity?: number | null;
  isDateConfirmed?: boolean;
  officialSite?: string | null;
  updatedAt?: string | null;
  /** "tmdb" titles use /tv/:id, TVMaze titles use /show/:id */
  source?: "tmdb" | "tvmaze";
  mediaType?: "movie" | "tv";
  nextEpisode?: {
    id?: number;
    season?: number;
    number?: number;
    name?: string;
    airdate?: string;
    overview?: string;
  } | null;
  numberOfSeasons?: number | null;
  networkNames?: string[];
}

export interface Favorite {
  showId: number;
  enabled: boolean;
  reminderEnabled: boolean;
  reminderLeadHours: number;
  addedAt?: string;
}

export interface UserProfile {
  displayName?: string;
  reminderLeadHours?: number;
  timezone?: string;
}

/** A movie as returned by the Series Radar data API (TMDB). */
export interface Movie {
  id: number;
  title: string;
  originalTitle?: string;
  overview?: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  /** Theatrical/release date from TMDB (YYYY-MM-DD) */
  releaseDate?: string | null;
  rating?: number | null;
  votes?: number | null;
  popularity?: number | null;
  language?: string | null;
  genreIds?: number[];
  genres?: string[];
  runtime?: number | null;
  status?: string | null;
  tagline?: string;
  budget?: number | null;
  revenue?: number | null;
  imdbId?: string | null;
  trailerKey?: string | null;
  homepage?: string | null;
  certification?: string | null;
  theatricalDate?: string | null;
  digitalDate?: string | null;
  physicalDate?: string | null;
  /** The digital/physical date chosen for the online tab */
  onlineDate?: string | null;
  releaseKind?: "digital" | "physical";
  availableNow?: boolean;
  /** Additional ratings from OMDB */
  imdbRating?: string | null;        // e.g. "8.5/10"
  rottenTomatoesRating?: string | null; // e.g. "92%"
  metacriticRating?: string | null;    // e.g. "78/100"
  omdbAwards?: string | null;
  omdbGenre?: string | null;
  omdbDirector?: string | null;
  omdbActors?: string | null;
  /** TMDB credits - preferred over the OMDB fallback strings. */
  directors?: string[];
  cast?: CastMember[];
  omdbPlot?: string | null;
  productionCountries?: string[];
  spokenLanguages?: string[];
  externalIds?: Record<string, string | null>;
  matchScore?: number;
  mediaType?: "movie" | "tv";
}

export interface MovieFavorite {
  movieId: number;
  reminderEnabled: boolean;
  addedAt: string;
}

/** "quality" replaces the old cinema/online split: released, awaiting digital. */
export type MovieTab = "quality" | "upcoming";

export interface BoxOfficeEntry {
  rank?: number;
  title: string;
  id?: number | null;
  posterPath?: string | null;
  rating?: number | null;
  releaseDate?: string | null;
  genres?: string[];
  budget?: number | null;
  revenue?: number | null;
  worldwide?: number | null;
  domestic?: number | null;
  international?: number | null;
  weekendGross?: number | null;
  theaters?: number | null;
  weeks?: number | null;
  distributor?: string | null;
}

export interface BoxOfficePayload {
  updatedAt?: string | null;
  source?: string;
  year?: string;
  weekendLabel?: string | null;
  weekend: BoxOfficeEntry[];
  yearly: BoxOfficeEntry[];
}

/** Episode from TVMaze */
export interface Episode {
  id: number;
  season: number;
  number: number;
  name: string;
  airdate: string | null;        // YYYY-MM-DD
  airtime: string | null;        // HH:MM
  airstamp: string | null;       // ISO instant
  runtime: number | null;
  rating: { average: number | null } | null;
  summary: string | null;
  image: { medium: string; original: string } | null;
}

/** Series detail with episodes (TVMaze + local tracking) */
export interface SeriesDetail {
  id: number;
  title: string;
  type: string | null;
  language: string | null;
  genres: string[];
  status: string | null;
  premiered: string | null;       // YYYY-MM-DD
  ended: string | null;           // YYYY-MM-DD
  officialSite: string | null;
  schedule: { time: string; days: string[] } | null;
  rating: { average: number | null } | null;
  weight: number | null;
  network: { name: string; country: { code: string } } | null;
  webChannel: { name: string; country: { code: string } } | null;
  externals: { tvrage: number | null; thetvdb: number | null; imdb: string | null } | null;
  image: { medium: string; original: string } | null;
  summary: string | null;
  updated: number | null;
  _links: { self: { href: string }; previousepisode: { href: string } | null; nextepisode: { href: string } | null } | null;
  /** All episodes from TVMaze */
  episodes: Episode[];
  /** TVMaze cast & creators (?embed[]=cast&embed[]=crew) */
  cast?: CastMember[];
  creators?: string[];
  /** Local tracking state */
  watchedEpisodes: Set<number>;   // episode ids
  /** Progress: watched / total */
  progress: { watched: number; total: number };
}

/** Local episode tracking state */
export interface EpisodeTracking {
  showId: number;
  watchedEpisodeIds: number[];
  lastUpdated: string;
}