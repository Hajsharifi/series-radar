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

vi.mock("../offline", () => ({
  cachedFetchJson: vi.fn(),
}));

vi.mock("../api", () => ({
  API_BASE: "http://api.test",
}));

describe("favorite migration", () => {
  it("migrates a tvmaze favorite using the title field", async () => {
    localStorage.setItem(
      "sr:favorites:v2",
      JSON.stringify([
        { showId: 100, source: "tvmaze", reminderEnabled: true, reminderLeadHours: 24, addedAt: "2026-01-01", identity: "Severance" },
      ]),
    );
    const { cachedFetchJson } = await import("../offline");
    (cachedFetchJson as any)
      .mockResolvedValueOnce({ name: "Severance", premiered: "2022-02-18" })
      .mockResolvedValueOnce({ results: [{ id: 95396, title: "جداسازی", originalTitle: "Severance", firstAirDate: "2022-02-18" }] });

    const { migrateFavoritesToTmdb, isMigrationDone } = await import("../favorite-migration");
    const report = await migrateFavoritesToTmdb();
    expect(report.migrated).toBe(1);
    expect(report.dropped).toHaveLength(0);

    const favorites = await import("../favorites");
    const items = favorites.getFavorites();
    expect(items).toHaveLength(1);
    expect(items[0].source).toBe("tmdb");
    expect(items[0].showId).toBe(95396);
    expect(isMigrationDone()).toBe(true);
  });

  it("keeps the favorite and does not set the marker on network error", async () => {
    localStorage.setItem(
      "sr:favorites:v2",
      JSON.stringify([
        { showId: 100, source: "tvmaze", reminderEnabled: true, reminderLeadHours: 24, addedAt: "2026-01-01" },
      ]),
    );
    const { cachedFetchJson } = await import("../offline");
    (cachedFetchJson as any).mockRejectedValueOnce(new Error("network down"));

    const { migrateFavoritesToTmdb, isMigrationDone } = await import("../favorite-migration");
    const report = await migrateFavoritesToTmdb();
    expect(report.migrated).toBe(0);
    expect(isMigrationDone()).toBe(false);

    const favorites = await import("../favorites");
    const items = favorites.getFavorites();
    expect(items).toHaveLength(1);
    expect(items[0].source).toBe("tvmaze");
    expect(items[0].showId).toBe(100);
  });

  it("does nothing when already migrated", async () => {
    localStorage.setItem("sr:favorites:migrated-to-tmdb:v2", "1");
    localStorage.setItem(
      "sr:favorites:v2",
      JSON.stringify([
        { showId: 100, source: "tvmaze", reminderEnabled: true, reminderLeadHours: 24, addedAt: "2026-01-01" },
      ]),
    );
    const { cachedFetchJson } = await import("../offline");
    const callsBefore = (cachedFetchJson as any).mock.calls.length;
    const { migrateFavoritesToTmdb } = await import("../favorite-migration");
    const report = await migrateFavoritesToTmdb();
    expect(report.migrated).toBe(0);
    expect((cachedFetchJson as any).mock.calls.length).toBe(callsBefore);
  });

  it("sets the marker when there are no tvmaze items", async () => {
    localStorage.setItem(
      "sr:favorites:v2",
      JSON.stringify([
        { showId: 95396, source: "tmdb", reminderEnabled: true, reminderLeadHours: 24, addedAt: "2026-01-01" },
      ]),
    );
    const { migrateFavoritesToTmdb, isMigrationDone } = await import("../favorite-migration");
    const report = await migrateFavoritesToTmdb();
    expect(report.migrated).toBe(0);
    expect(report.dropped).toHaveLength(0);
    expect(isMigrationDone()).toBe(true);
  });
});