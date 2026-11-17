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
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  Object.defineProperty(globalThis, "window", { value: new EventTarget(), configurable: true });
  vi.resetModules();
});

describe("favorites storage", () => {
  it("migrates the pre-source list to TVMaze", async () => {
    localStorage.setItem(
      "sr:favorites:v1",
      JSON.stringify([{ showId: 82, reminderEnabled: true, reminderLeadHours: 24, addedAt: "2026-01-01" }]),
    );
    const favorites = await import("../favorites");
    const items = favorites.getFavorites();
    expect(items).toHaveLength(1);
    expect(items[0].source).toBe("tvmaze");
    expect(favorites.favoriteKeys()).toEqual(new Set(["tvmaze:82"]));
  });

  it("keeps TMDB and TVMaze entries with the same numeric id apart", async () => {
    const favorites = await import("../favorites");
    favorites.addFavorite(42, "tvmaze");
    favorites.addFavorite(42, "tmdb");
    expect(favorites.getFavorites()).toHaveLength(2);
    expect(favorites.favoriteKeys()).toEqual(new Set(["tvmaze:42", "tmdb:42"]));
    favorites.removeFavorite(42, "tmdb");
    expect(favorites.favoriteKeys()).toEqual(new Set(["tvmaze:42"]));
  });

  it("does not resurrect legacy entries after the list becomes empty", async () => {
    localStorage.setItem(
      "sr:favorites:v1",
      JSON.stringify([{ showId: 7, reminderEnabled: true, reminderLeadHours: 24, addedAt: "2026-01-01" }]),
    );
    const favorites = await import("../favorites");
    favorites.removeFavorite(7, "tvmaze");
    expect(favorites.getFavorites()).toHaveLength(0);
  });
});
