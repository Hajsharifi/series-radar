import { describe, expect, it } from "vitest";
import { categoryFromEvent, eventKindFromEpisode, showEventKind } from "../show-event";
import type { Show } from "../../types";

describe("eventKindFromEpisode", () => {
  it("distinguishes a series premiere from a new season", () => {
    expect(eventKindFromEpisode({ season: 1, number: 1 })).toBe("series-premiere");
    expect(eventKindFromEpisode({ season: 4, number: 1 })).toBe("season-premiere");
  });

  it("does not call a mid-season episode a new season", () => {
    expect(eventKindFromEpisode({ season: 5, number: 3 })).toBe("new-episode");
  });

  it("falls back to airing when no next episode is known", () => {
    expect(eventKindFromEpisode(null, 5)).toBe("airing");
    expect(eventKindFromEpisode(null, 1)).toBe("airing");
  });

  it("maps the visible event back to the legacy category", () => {
    expect(categoryFromEvent("series-premiere")).toBe("new");
    expect(categoryFromEvent("season-premiere")).toBe("returning");
    expect(categoryFromEvent("new-episode")).toBe("announced");
  });

  it("uses eventKind first and category only as a fallback", () => {
    const base = { id: 1, title: "x", category: "returning" } as Show;
    expect(showEventKind({ ...base, eventKind: "new-episode" })).toBe("new-episode");
    expect(showEventKind({ ...base, seasonNumber: 3 })).toBe("season-premiere");
  });
});
