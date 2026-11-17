import { describe, expect, it } from "vitest";
import { buildIcs } from "../ics";

describe("buildIcs", () => {
  it("writes all-day events with escaped text", () => {
    const ics = buildIcs([
      {
        key: "tmdb:1",
        day: "2026-11-20",
        title: "Show, One; Two",
        subtitle: "فصل ۳ · قسمت ۴",
        clock: "زمان اعلام نشده",
      },
    ]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261120");
    expect(ics).toContain("DTEND;VALUE=DATE:20261121");
    expect(ics).toContain("SUMMARY:Show\\, One\\; Two");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("deduplicates identical keys", () => {
    const ics = buildIcs([
      { key: "same", day: "2026-11-20", title: "A" },
      { key: "same", day: "2026-11-21", title: "B" },
    ]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });
});
