import type { CategoryFilter } from "./tvmaze";

export interface RadarFilterState {
  category: CategoryFilter;
  onlyPopular: boolean;
  hideUnscripted: boolean;
  language: string;
  country: string;
  genre: string | null;
}

export const RADAR_DEFAULTS: RadarFilterState = {
  category: "all",
  onlyPopular: false,
  hideUnscripted: true,
  language: "all",
  country: "all",
  genre: null,
};

const COUNTED_KEYS: Array<keyof RadarFilterState> = [
  "category",
  "onlyPopular",
  "hideUnscripted",
  "language",
  "country",
  "genre",
];

/** Count only choices that differ from the defaults, so the badge is
 * meaningful after the defaults were widened. */
export function countNonDefaultFilters(state: RadarFilterState): number {
  return COUNTED_KEYS.filter((key) => state[key] !== RADAR_DEFAULTS[key]).length;
}
