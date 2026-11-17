import type { CastMember } from "../types";

interface CreditsSectionProps {
  kind: "movie" | "series";
  directors?: string[];
  creators?: string[];
  cast?: CastMember[];
  /** OMDB strings are only used when TMDB credits are unavailable. */
  fallbackDirector?: string | null;
  fallbackActors?: string | null;
}

function splitNames(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

export function CreditsSection({
  kind,
  directors,
  creators,
  cast,
  fallbackDirector,
  fallbackActors,
}: CreditsSectionProps) {
  const leadNames = directors?.length
    ? directors
    : creators?.length
      ? creators
      : splitNames(fallbackDirector);
  const people: CastMember[] = cast?.length
    ? cast
    : splitNames(fallbackActors).map((name) => ({ name }));

  if (leadNames.length === 0 && people.length === 0) return null;

  return (
    <section className="rounded-2xl border border-white/8 bg-black/25 p-4">
      <h2 className="mb-3 text-sm font-bold text-white">عوامل اصلی</h2>
      {leadNames.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] text-ink-400">{kind === "movie" ? "کارگردان" : "سازنده"}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {leadNames.map((name) => (
              <span
                key={name}
                className="rounded-lg bg-white/6 px-2 py-1 text-[11px] font-semibold text-ink-100"
                dir="auto"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}
      {people.length > 0 && (
        <div>
          <p className="text-[10px] text-ink-400">بازیگران اصلی</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {people.map((person, index) => (
              <span
                key={`${person.name}-${index}`}
                className="rounded-lg bg-white/6 px-2 py-1 text-[11px]"
                dir="auto"
              >
                <span className="font-semibold text-ink-100">{person.name}</span>
                {person.character && <span className="text-ink-400"> · {person.character}</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
