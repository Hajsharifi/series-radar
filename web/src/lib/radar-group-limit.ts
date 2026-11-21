export type RadarView = "grid" | "list" | "compact";

const NARROW_LIMITS: Record<RadarView, number> = {
  grid: 20,
  list: 25,
  compact: 30,
};

/**
 * In the unfiltered "all" view every show must be visible — hiding items
 * behind "show more" makes first-season premieres look absent from Radar.
 * Narrowed views keep the old caps to stay compact.
 */
export function radarGroupLimit(view: RadarView, isAllView: boolean): number | null {
  return isAllView ? null : NARROW_LIMITS[view];
}
