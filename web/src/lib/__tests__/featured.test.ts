import { describe, expect, it } from "vitest";
import { rankFeaturedShows } from "../featured";
import type { Show } from "../../types";

const NOW = Date.parse("2026-11-17T12:00:00Z");

function show(partial: Partial<Show> & Pick<Show, "id" | "title">): Show {
  return {
    category: "returning",
    posterPath: "/poster.jpg",
    airstamp: "2026-11-20T12:00:00Z",
    rating: 7.5,
    votes: 1000,
    weight: 90,
    genres: ["Drama"],
    source: "tvmaze",
    ...partial,
  };
}

describe("rankFeaturedShows", () => {
  it("orders by the composite score and drops weak entries", () => {
    const shows = [
      show({ id: 1, title: "Great", rating: 8.8, votes: 20000, weight: 100, genres: ["Drama"] }),
      show({ id: 2, title: "Good", rating: 7.9, votes: 800, weight: 92, genres: ["Comedy"] }),
      show({ id: 3, title: "Weak", rating: 6.0, votes: 20, weight: 95, genres: ["Crime"] }),
    ];
    const ranked = rankFeaturedShows(shows, { now: NOW });
    expect(ranked.map((item) => item.title)).toEqual(["Great", "Good"]);
  });

  it("caps each primary genre at two entries", () => {
    const shows = [
      show({ id: 1, title: "D1", rating: 9.0, genres: ["Drama"] }),
      show({ id: 2, title: "D2", rating: 8.8, genres: ["Drama"] }),
      show({ id: 3, title: "D3", rating: 8.6, genres: ["Drama"] }),
      show({ id: 4, title: "C1", rating: 8.4, genres: ["Comedy"] }),
    ];
    const ranked = rankFeaturedShows(shows, { now: NOW, limit: 4 });
    expect(ranked.filter((item) => item.genres?.[0] === "Drama")).toHaveLength(2);
    expect(ranked).toHaveLength(3);
  });

  it("never suggests a starred TVMaze show or an excluded key", () => {
    const shows = [
      show({ id: 1, title: "Starred" }),
      show({ id: 2, title: "Excluded" }),
      show({ id: 3, title: "Fine" }),
    ];
    const ranked = rankFeaturedShows(shows, {
      now: NOW,
      favoriteIds: new Set([1]),
      excludedKeys: new Set(["tvmaze:2"]),
    });
    expect(ranked.map((item) => item.title)).toEqual(["Fine"]);
  });

  it("ignores shows without a poster or a real date", () => {
    const shows = [
      show({ id: 1, title: "NoPoster", posterPath: null, posterOriginal: null }),
      show({ id: 2, title: "Past", airstamp: "2026-01-01T12:00:00Z" }),
      show({ id: 3, title: "Future", genres: ["Comedy"] }),
    ];
    expect(rankFeaturedShows(shows, { now: NOW }).map((item) => item.title)).toEqual(["Future"]);
  });
});
