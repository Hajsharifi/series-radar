export interface IcsEvent {
  key: string;
  /** Tehran calendar day: YYYY-MM-DD */
  day: string;
  title: string;
  subtitle?: string;
  clock?: string;
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function addDay(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function compact(day: string): string {
  return day.replace(/-/g, "");
}

function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function uid(key: string): string {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) | 0;
  }
  return `${Math.abs(hash).toString(36)}-${key.length}@series-radar`;
}

/** Build a small all-day calendar. Dates are already Tehran calendar days. */
export function buildIcs(events: IcsEvent[], calendarName = "Series Radar"): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Series Radar//FA//",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    "X-WR-TIMEZONE:Asia/Tehran",
  ];
  const seen = new Set<string>();
  for (const event of events) {
    if (!event.day || seen.has(event.key)) continue;
    seen.add(event.key);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid(event.key)}`,
      `DTSTAMP:${stamp()}`,
      `DTSTART;VALUE=DATE:${compact(event.day)}`,
      `DTEND;VALUE=DATE:${compact(addDay(event.day))}`,
      `SUMMARY:${escapeText(event.title)}`,
      `DESCRIPTION:${escapeText([event.subtitle, event.clock].filter(Boolean).join(" · "))}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export function icsFilename(prefix = "series-radar"): string {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.ics`;
}

export function downloadTextFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
