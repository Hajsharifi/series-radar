import { describe, expect, it } from "vitest";

describe("radar filter defaults", () => {
  it("counts no active filters at the default state", async () => {
    const { RADAR_DEFAULTS, countNonDefaultFilters } = await import("../radar-filters");
    expect(countNonDefaultFilters({ ...RADAR_DEFAULTS })).toBe(0);
  });

  it("counts the three old defaults as non-default choices", async () => {
    const { RADAR_DEFAULTS, countNonDefaultFilters } = await import("../radar-filters");
    expect(countNonDefaultFilters({ ...RADAR_DEFAULTS, language: "en", country: "US", onlyPopular: true })).toBe(3);
  });

  it("counts turning off the scripted-show filter as one active filter", async () => {
    const { RADAR_DEFAULTS, countNonDefaultFilters } = await import("../radar-filters");
    expect(countNonDefaultFilters({ ...RADAR_DEFAULTS, hideUnscripted: false })).toBe(1);
  });
});
