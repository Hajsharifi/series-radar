import { describe, expect, it } from "vitest";
import { applyQuietHours } from "../quiet-hours";
import { tehranWallToEpoch } from "../date";
import type { AppSettings } from "../settings";

const base: AppSettings = {
  defaultLeadHours: 24,
  quietHoursEnabled: true,
  quietStart: "23:00",
  quietEnd: "07:00",
};

function at(hh: number, mm = 0, day = 20) {
  return tehranWallToEpoch(2026, 11, day, hh, mm);
}

describe("applyQuietHours", () => {
  it("does nothing when disabled", () => {
    const trigger = at(2);
    expect(applyQuietHours(trigger, null, { ...base, quietHoursEnabled: false })).toBe(trigger);
  });

  it("moves an early-morning reminder to the end of the window", () => {
    const trigger = at(2);
    expect(applyQuietHours(trigger, at(9), base)).toBe(at(7));
  });

  it("moves a late-night reminder to the next morning", () => {
    const trigger = at(23, 30);
    expect(applyQuietHours(trigger, at(9, 0, 21), base)).toBe(at(7, 0, 21));
  });

  it("drops a reminder that would land after the broadcast", () => {
    expect(applyQuietHours(at(2), at(6), base)).toBe(-1);
  });

  it("handles a same-day window", () => {
    const settings = { ...base, quietStart: "13:00", quietEnd: "15:00" };
    expect(applyQuietHours(at(14), at(20), settings)).toBe(at(15));
  });
});
