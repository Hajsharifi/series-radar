import { beforeEach, describe, expect, it, vi } from "vitest";

class MemoryStorage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  key(index: number) {
    return Array.from(this.data.keys())[index] ?? null;
  }
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
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
  const fakeWindow = Object.assign(new EventTarget(), {
    location: { hostname: "example.com", protocol: "https:", href: "https://example.com/" },
  });
  Object.defineProperty(globalThis, "window", { value: fakeWindow, configurable: true });
  vi.resetModules();
});

describe("TV schedule", () => {
  it("includes upcoming discover shows and keeps one card per TMDB id", async () => {
    const show = (id: number, title: string) => ({
      source: "tmdb",
      id,
      title,
      originalTitle: title,
      firstAirDate: "2026-12-01",
    });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const results = url.endsWith("/api/tv/upcoming")
        ? [show(171802, "Blade Runner 2099"), show(3, "Popular Show")]
        : url.endsWith("/api/tv/on_the_air")
          ? [show(1, "On Air")]
          : url.endsWith("/api/tv/airing_today")
            ? [show(2, "Airing Today")]
            : url.endsWith("/api/tv/popular")
              ? [show(3, "Popular Show")]
              : url.endsWith("/api/tv/top_rated")
                ? [show(4, "Top Rated")]
                : [];
      return { ok: true, status: 200, json: async () => ({ results }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchTVSchedule } = await import("../tmdb-tv");
    const shows = await fetchTVSchedule();
    const ids = shows.map((item) => item.id);

    expect(ids).toContain(171802);
    expect(ids.filter((id) => id === 3)).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/api/tv/upcoming"))).toBe(true);
  });
});
