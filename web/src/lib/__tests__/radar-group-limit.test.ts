import { describe, expect, it } from "vitest";

describe("radar group display limit", () => {
  it("shows every item of a group in the unfiltered all view", async () => {
    const { radarGroupLimit } = await import("../radar-group-limit");
    expect(radarGroupLimit("grid", true)).toBeNull();
    expect(radarGroupLimit("list", true)).toBeNull();
    expect(radarGroupLimit("compact", true)).toBeNull();
  });

  it("keeps the previous caps when a narrowing filter is active", async () => {
    const { radarGroupLimit } = await import("../radar-group-limit");
    expect(radarGroupLimit("grid", false)).toBe(20);
    expect(radarGroupLimit("list", false)).toBe(25);
    expect(radarGroupLimit("compact", false)).toBe(30);
  });
});
