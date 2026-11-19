import { Link } from "react-router-dom";
import type { CastMember } from "../types";

interface CreditsSectionProps {
  kind: "movie" | "series";
  directors?: string[];
  directorIds?: number[];
  creators?: string[];
  creatorIds?: number[];
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

function PersonChip({ id, name }: { id?: number; name: string }) {
  const className =
    "rounded-lg bg-white/6 px-2 py-1 text-caption font-semibold text-ink-100 transition hover:bg-white/10";
  if (id) {
    return (
      <Link to={`/person/${id}`} className={className} dir="auto">
        {name}
      </Link>
    );
  }
  return <span className={className} dir="auto">{name}</span>;
}

export function CreditsSection({
  kind,
  directors,
  directorIds,
  creators,
  creatorIds,
  cast,
  fallbackDirector,
  fallbackActors,
}: CreditsSectionProps) {
  const leadNames = directors?.length
    ? directors
    : creators?.length
      ? creators
      : splitNames(fallbackDirector);
  const leadIds = directors?.length
    ? directorIds
    : creators?.length
      ? creatorIds
      : undefined;
  const people: CastMember[] = cast?.length
    ? cast
    : splitNames(fallbackActors).map((name) => ({ name }));

  if (leadNames.length === 0 && people.length === 0) return null;

  return (
    <section className="rounded-card border border-edge/10 bg-black/25 p-4">
      <h2 className="mb-3 text-sm font-bold text-white">عوامل اصلی</h2>
      {leadNames.length > 0 && (
        <div className="mb-3">
          <p className="text-micro text-muted">{kind === "movie" ? "کارگردان" : "سازنده"}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {leadNames.map((name, index) => (
              <PersonChip key={`${name}-${index}`} id={leadIds?.[index]} name={name} />
            ))}
          </div>
        </div>
      )}
      {people.length > 0 && (
        <div>
          <p className="text-micro text-muted">بازیگران اصلی</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {people.map((person, index) => (
              <span
                key={`${person.name}-${index}`}
                className="rounded-lg bg-white/6 px-2 py-1 text-caption"
                dir="auto"
              >
                {person.id ? (
                  <Link to={`/person/${person.id}`} className="font-semibold text-ink-100 hover:text-white">
                    {person.name}
                  </Link>
                ) : (
                  <span className="font-semibold text-ink-100">{person.name}</span>
                )}
                {person.character && <span className="text-muted"> · {person.character}</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
