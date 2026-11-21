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
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
  Object.defineProperty(globalThis, "window", { value: new EventTarget(), configurable: true });
  vi.resetModules();
});

describe("movie favorites storage", () => {
  it("collapses duplicate movie rows and repairs storage", async () => {
    localStorage.setItem(
      "sr:movie-favorites:v1",
      JSON.stringify([
        { movieId: 603, reminderEnabled: true, addedAt: "2026-01-01T00:00:00.000Z" },
        { movieId: 603, reminderEnabled: false, addedAt: "2026-02-01T00:00:00.000Z" },
      ]),
    );
    const favorites = await import("../movie-favorites");
    const items = favorites.getMovieFavorites();
    expect(items).toHaveLength(1);
    expect(items[0].movieId).toBe(603);
    expect(JSON.parse(localStorage.getItem("sr:movie-favorites:v1")!)).toHaveLength(1);
  });

  it("dedupes a backup restore list", async () => {
    const favorites = await import("../movie-favorites");
    favorites.replaceMovieFavorites([
      { movieId: 603, reminderEnabled: true, addedAt: "2026-01-01T00:00:00.000Z" },
      { movieId: 603, reminderEnabled: true, addedAt: "2026-02-01T00:00:00.000Z" },
      { movieId: 13, reminderEnabled: true, addedAt: "2026-03-01T00:00:00.000Z" },
    ]);
    expect(favorites.getMovieFavorites()).toHaveLength(2);
  });
});
