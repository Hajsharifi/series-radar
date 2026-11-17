import type { Show, ShowCategory, ShowEventKind } from "../types";
import { EVENT_LABEL } from "./labels";

interface NextEpisodeHint {
  season?: number | null;
  number?: number | null;
}

/** Decide from the actual next episode whether this is a new series, a new
 * season, or simply the next episode of the season already on air. */
export function eventKindFromEpisode(
  next?: NextEpisodeHint | null,
  seasonCount?: number | null,
): ShowEventKind {
  const season = next?.season ?? null;
  const number = next?.number ?? null;
  if (season === 1 && number === 1) return "series-premiere";
  if (season !== null && season > 1 && number === 1) return "season-premiere";
  if (season !== null && number !== null && number > 1) return "new-episode";
  // A returning show with seasons but no known next episode is simply airing.
  if ((seasonCount ?? 0) > 1) return "airing";
  return "airing";
}

/** Category is kept for filters/legacy data; event kind drives the visible tag. */
export function categoryFromEvent(kind: ShowEventKind): ShowCategory {
  if (kind === "series-premiere") return "new";
  if (kind === "season-premiere") return "returning";
  return "announced";
}

export function showEventKind(show: Show): ShowEventKind {
  if (show.eventKind) return show.eventKind;
  if (show.category === "new") return "series-premiere";
  if (show.category === "returning") return show.seasonNumber && show.seasonNumber > 1 ? "season-premiere" : "airing";
  return "airing";
}

export function showEventLabel(show: Show): string {
  return EVENT_LABEL[showEventKind(show)];
}
