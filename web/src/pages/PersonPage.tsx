import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BackButton } from "../components/BackButton";
import { Poster } from "../components/Poster";
import { cachedFetchJson } from "../lib/offline";
import { API_BASE } from "../lib/api";
import { jalaliDate, toPersianDigits } from "../lib/date";
import type { PersonCredit, PersonDetail } from "../types";

function creditDate(day?: string | null): string {
  if (!day) return "—";
  const date = new Date(`${day}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : jalaliDate(date);
}

function CreditCard({ credit }: { credit: PersonCredit }) {
  const path = credit.mediaType === "movie" ? `/movie/${credit.id}` : `/tv/${credit.id}`;
  return (
    <Link to={path} className="sr-no-tap block">
      <article className="sr-card-hover flex gap-2.5 rounded-2xl border border-white/8 bg-ink-850/70 p-2.5">
        <Poster
          show={{
            id: credit.id,
            title: credit.title,
            posterPath: credit.posterPath,
            posterOriginal: credit.posterPath,
            category: "returning",
            source: "tmdb",
          }}
          className="h-[72px] w-[52px] shrink-0"
          rounded="rounded-lg"
        />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-xs font-semibold text-white" dir="auto">{credit.title}</p>
          {credit.character && <p className="mt-0.5 truncate text-[10px] text-ink-400" dir="auto">{credit.character}</p>}
          <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-ink-400">
            <span>{creditDate(credit.date)}</span>
            {typeof credit.rating === "number" && credit.rating > 0 && (
              <span className="text-amber-300">★ {toPersianDigits(credit.rating.toFixed(1))}</span>
            )}
          </div>
          <span className={`mt-1 inline-block rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${
            credit.mediaType === "movie" ? "bg-sky-400/15 text-sky-200" : "bg-amber-400/15 text-amber-200"
          }`}>
            {credit.mediaType === "movie" ? "فیلم" : "سریال"}
          </span>
        </div>
      </article>
    </Link>
  );
}

function CreditGroup({ title, credits }: { title: string; credits: PersonCredit[] }) {
  if (credits.length === 0) return null;
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-bold text-white">{title}</h2>
        <span className="text-[11px] text-ink-400">{toPersianDigits(credits.length)} مورد</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {credits.map((credit) => (
          <CreditCard key={`${credit.mediaType}-${credit.id}`} credit={credit} />
        ))}
      </div>
    </section>
  );
}

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const personId = Number(id);
  const query = useQuery({
    queryKey: ["person", personId],
    queryFn: () => cachedFetchJson<PersonDetail>(`${API_BASE}/api/person/${personId}`, 20000),
    enabled: Number.isFinite(personId) && personId > 0,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const person = query.data;
  const movies = useMemo(
    () => (person?.credits ?? []).filter((credit) => credit.mediaType === "movie"),
    [person?.credits],
  );
  const series = useMemo(
    () => (person?.credits ?? []).filter((credit) => credit.mediaType === "tv"),
    [person?.credits],
  );

  if (query.isLoading) {
    return <div className="rounded-2xl bg-ink-850/60 px-4 py-16 text-center text-sm text-ink-300">در حال بارگذاری…</div>;
  }

  if (!person) {
    return (
      <div className="rounded-2xl border border-white/8 bg-ink-850/60 px-4 py-14 text-center">
        <p className="text-sm font-semibold text-white">این فرد پیدا نشد</p>
        <p className="mt-1 text-xs text-ink-400">ممکن است شناسه اشتباه باشد یا اتصال برقرار نباشد.</p>
        <Link to="/" className="mt-4 inline-block rounded-lg bg-amber-400 px-4 py-2 text-xs font-semibold text-ink-950">
          بازگشت به رادار
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <BackButton />

      <article className="overflow-hidden rounded-3xl border border-white/8 bg-ink-850/70">
        <div className="flex flex-col gap-4 p-4 sm:flex-row">
          <div className="mx-auto h-32 w-24 shrink-0 overflow-hidden rounded-2xl bg-white/5 sm:mx-0">
            {person.profilePath ? (
              <img src={`https://image.tmdb.org/t/p/w300${person.profilePath}`} alt={person.name} className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center text-2xl font-black text-white/40">
                {person.name.slice(0, 2)}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-right">
            <p className="text-[10px] font-semibold text-amber-300">عوامل</p>
            <h1 className="mt-1 text-2xl font-extrabold text-white" dir="auto">{person.name}</h1>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5 text-[11px] sm:justify-start">
              {person.knownForDepartment && (
                <span className="rounded-lg bg-white/6 px-2 py-1 text-ink-200">{person.knownForDepartment}</span>
              )}
              {person.birthday && (
                <span className="rounded-lg bg-white/6 px-2 py-1 text-ink-200">تولد: {creditDate(person.birthday)}</span>
              )}
              {person.placeOfBirth && (
                <span className="rounded-lg bg-white/6 px-2 py-1 text-ink-200" dir="auto">{person.placeOfBirth}</span>
              )}
            </div>
            {person.biography && (
              <p className="mt-3 line-clamp-6 text-xs leading-relaxed text-ink-300" dir="auto">
                {person.biography}
              </p>
            )}
          </div>
        </div>
      </article>

      <CreditGroup title="فیلم‌ها" credits={movies} />
      <CreditGroup title="سریال‌ها" credits={series} />

      {movies.length === 0 && series.length === 0 && (
        <div className="rounded-2xl border border-white/8 bg-ink-850/60 px-4 py-10 text-center text-xs text-ink-400">
          فیلموگرافی‌ای برای این فرد ثبت نشده است.
        </div>
      )}
    </div>
  );
}
