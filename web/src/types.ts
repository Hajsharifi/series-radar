export type ShowCategory = "new" | "returning" | "announced";

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
  weight?: number;
  isDateConfirmed?: boolean;
  officialSite?: string | null;
  updatedAt?: string | null;
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
  omdbPlot?: string | null;
}

export interface MovieFavorite {
  movieId: number;
  reminderEnabled: boolean;
  addedAt: string;
}

export type MovieTab = "cinema" | "online" | "upcoming";

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