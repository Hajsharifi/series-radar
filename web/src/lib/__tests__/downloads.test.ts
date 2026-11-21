import { beforeEach, describe, expect, it, vi } from "vitest";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  clear() {
    this.data.clear();
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemoryStorage(),
    configurable: true,
  });
  vi.resetModules();
});

describe("download link helpers", () => {
  it("builds and parses stable keys", async () => {
    const dl = await import("../downloads");
    expect(dl.movieDownloadKey(603692)).toBe("movie:603692");
    expect(dl.seriesDownloadKey(95396, "tmdb")).toBe("series:tmdb:95396");
    expect(dl.seriesDownloadKey(82)).toBe("series:tmdb:82");
    expect(dl.parseDownloadKey("series:tvmaze:82")).toEqual({
      kind: "series",
      source: "tvmaze",
      id: 82,
    });
    expect(dl.parseDownloadKey("movie:x")).toBeNull();
    expect(dl.parseDownloadKey("series:imdb:82")).toBeNull();
  });

  it("collects movie and series links from either payload shape", async () => {
    const dl = await import("../downloads");
    const link = (id: string) => ({ id, url: `https://x/${id}.mkv`, label: "دانلود", filename: `${id}.mkv` });
    const movie = {
      key: "movie:1",
      status: "found" as const,
      checkedAt: "2026-11-19T00:00:00Z",
      groups: [{ id: "g", label: "دوبله", kind: "dubbled" as const, items: [
        { id: "i", quality: "1080p", links: [link("a"), link("b")] },
      ] }],
    };
    const series = {
      key: "series:tmdb:2",
      status: "found" as const,
      checkedAt: "2026-11-19T00:00:00Z",
      seasons: [{ number: 1, label: "فصل 1", groups: [{
        id: "g", label: "زیرنویس", kind: "hardsub" as const,
        episodes: [{ season: 1, number: 1, label: "قسمت 01", quality: "1080p", links: [link("c")] }],
      }] }],
    };
    expect(dl.payloadLinks(movie).map((item) => item.id)).toEqual(["a", "b"]);
    expect(dl.payloadLinkCount(series)).toBe(1);
    expect(dl.payloadLinks(undefined)).toEqual([]);
  });

  it("marks links seen so the same link is not reported twice", async () => {
    const dl = await import("../downloads");
    const link = (id: string) => ({ id, url: `https://x/${id}.mkv`, label: "دانلود", filename: `${id}.mkv` });
    const payload = {
      key: "movie:1",
      status: "found" as const,
      checkedAt: "2026-11-19T00:00:00Z",
      groups: [{ id: "g", label: "دوبله", kind: "dubbled" as const, items: [
        { id: "i", quality: "1080p", links: [link("a"), link("b")] },
      ] }],
    };
    expect(dl.unseenLinkIds("movie:1", payload)).toEqual(["a", "b"]);
    dl.markDownloadsSeen("movie:1", payload);
    expect(dl.unseenLinkIds("movie:1", payload)).toEqual([]);
    const extended = {
      ...payload,
      groups: [{ ...payload.groups[0], items: [
        { ...payload.groups[0].items[0], links: [link("a"), link("b"), link("c")] },
      ] }],
    };
    expect(dl.unseenLinkIds("movie:1", extended)).toEqual(["c"]);
  });

  it("maps keys back to in-app detail routes", async () => {
    const dl = await import("../downloads");
    expect(dl.detailRouteFor("movie:603692")).toBe("/movie/603692");
    expect(dl.detailRouteFor("series:tmdb:95396")).toBe("/tv/95396");
    expect(dl.detailRouteFor("series:tvmaze:82")).toBe("/show/82");
    expect(dl.detailRouteFor("bad")).toBeNull();
  });
});
