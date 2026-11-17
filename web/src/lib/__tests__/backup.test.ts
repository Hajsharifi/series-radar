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

describe("backup restore", () => {
  it("writes favorites to the current storage key and keeps the source", async () => {
    const backup = await import("../backup");
    const favorites = await import("../favorites");
    const result = backup.importBackup(
      JSON.stringify({
        version: 1,
        exportedAt: "2026-01-01T00:00:00.000Z",
        favorites: [
          {
            showId: 42,
            source: "tmdb",
            reminderEnabled: true,
            reminderLeadHours: 24,
            addedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        movieFavorites: [],
        trackedMovies: [],
      }),
    );
    expect(result.ok).toBe(true);
    expect(favorites.getFavorites()).toHaveLength(1);
    expect(favorites.getFavorites()[0].source).toBe("tmdb");
    expect(localStorage.getItem("sr:favorites:v2")).toContain("42");
  });

  it("upgrades a legacy backup entry without a source to TVMaze", async () => {
    const backup = await import("../backup");
    const favorites = await import("../favorites");
    const result = backup.importBackup(
      JSON.stringify({
        version: 1,
        exportedAt: "2026-01-01T00:00:00.000Z",
        favorites: [
          { showId: 7, reminderEnabled: true, reminderLeadHours: 24, addedAt: "2026-01-01T00:00:00.000Z" },
        ],
        movieFavorites: [],
        trackedMovies: [],
      }),
    );
    expect(result.ok).toBe(true);
    expect(favorites.getFavorites()[0].source).toBe("tvmaze");
  });

  it("rejects an invalid payload", async () => {
    const backup = await import("../backup");
    expect(backup.importBackup("{}").ok).toBe(false);
  });
});
