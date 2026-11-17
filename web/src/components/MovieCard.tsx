import { Link } from "react-router-dom";
import type { Movie, MovieTab } from "../types";
import { dayCountdownLabel, toPersianDigits } from "../lib/date";
import {
  movieGenres,
  moviePrimaryDate,
  movieStage,
  movieStageLabel,
  tehranTodayISO,
  type MovieStage,
} from "../lib/movies";
import { JalaliSpans } from "./DateChip";
import { MoviePoster } from "./MoviePoster";

interface MovieCardProps {
  movie: Movie;
  tab: MovieTab;
  favorite: boolean;
  onToggleFavorite: (movie: Movie) => void;
}

function stageBadge(stage: MovieStage): { label: string; className: string } {
  switch (stage) {
    case "upcoming":
      return { label: movieStageLabel(stage), className: "bg-sky-400/90 text-sky-950" };
    case "quality":
      return { label: movieStageLabel(stage), className: "bg-amber-400/90 text-amber-950" };
    case "available":
      return { label: movieStageLabel(stage), className: "bg-emerald-400/90 text-emerald-950" };
    case "expired":
      return { label: movieStageLabel(stage), className: "bg-white/15 text-ink-200" };
    default:
      return { label: movieStageLabel(stage), className: "bg-white/10 text-ink-300" };
  }
}

/** Short caption shown next to the date: release countdown, or "quality unknown". */
function waitingCaption(movie: Movie, stage: MovieStage, date: string | null): string {
  if (stage === "upcoming") return date ? dayCountdownLabel(date) : "";
  if (stage === "quality") {
    const today = tehranTodayISO();
    if (movie.digitalDate && movie.digitalDate > today) return dayCountdownLabel(movie.digitalDate);
    return "کیفیت نامشخص";
  }
  return "";
}

export function MovieCard({ movie, tab, favorite, onToggleFavorite }: MovieCardProps) {
  const stage = movieStage(movie);
  const date = moviePrimaryDate(movie, tab);
  const badge = stageBadge(stage);
  const finished = stage === "available" || stage === "expired";
  const caption = waitingCaption(movie, stage, date);
  const genres = movieGenres(movie).slice(0, 2);

  return (
    <article className="sr-card-hover sr-pop group relative flex flex-col overflow-hidden rounded-2xl border border-white/8 bg-ink-850/80 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.9)]">
      <Link to={`/movie/${movie.id}`} className="sr-no-tap relative block">
        <MoviePoster movie={movie} className="aspect-[2/3] w-full" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-ink-950 via-ink-950/70 to-transparent" />
        <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-1">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}>
            {badge.label}
          </span>
          {caption && (
            <span className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-ink-200 backdrop-blur">
              {caption}
            </span>
          )}
        </div>
        {typeof movie.rating === "number" && movie.rating > 0 && (
          <span className="absolute right-2 top-2 rounded-lg bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 backdrop-blur">
            ★ {toPersianDigits(movie.rating.toFixed(1))}
          </span>
        )}
        {/* OMDB ratings badges */}
        {(movie.imdbRating || movie.rottenTomatoesRating || movie.metacriticRating) && (
          <div className="absolute right-2 top-24 flex flex-col gap-1">
            {movie.imdbRating && (
              <span className="rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-bold text-amber-300 backdrop-blur">
                IMDb {movie.imdbRating.split("/")[0]}
              </span>
            )}
            {movie.rottenTomatoesRating && (
              <span className="rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-bold text-red-400 backdrop-blur">
                RT {movie.rottenTomatoesRating.replace("%", "")}%
              </span>
            )}
            {movie.metacriticRating && (
              <span className="rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-bold text-green-400 backdrop-blur">
                MC {movie.metacriticRating.split("/")[0]}
              </span>
            )}
          </div>
        )}
      </Link>

      {!finished && (
        <button
          type="button"
          aria-label={favorite ? "حذف از ستارهها" : "افزودن به ستارهها"}
          aria-pressed={favorite}
          onClick={() => onToggleFavorite(movie)}
          className={`sr-no-tap absolute top-2 left-2 z-10 grid h-9 w-9 place-items-center rounded-full text-base shadow-lg backdrop-blur transition ${
            favorite ? "bg-amber-400 text-ink-950" : "bg-black/45 text-white/85 hover:bg-black/65"
          }`}
        >
          {favorite ? "★" : "☆"}
        </button>
      )}

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <Link
          to={`/movie/${movie.id}`}
          className="sr-no-tap line-clamp-2 min-h-[2.4em] text-sm font-bold leading-snug text-white"
          dir="auto"
        >
          {movie.title}
        </Link>
        <p className="truncate text-[11px] text-ink-400" dir="auto">
          {genres.length ? genres.join(" · ") : movie.originalTitle ?? "—"}
        </p>
        <div className="mt-auto flex items-center justify-between gap-1 border-t border-white/6 pt-1.5">
          <JalaliSpans stamp={date} className="text-[11px] font-medium text-ink-200" />
          {stage === "quality" && movie.releaseKind === "digital" ? (
            <span className="shrink-0 rounded-md bg-white/6 px-1.5 py-0.5 text-[10px] text-ink-300">
              دیجیتال
            </span>
          ) : movie.certification ? (
            <span className="shrink-0 rounded-md bg-white/6 px-1.5 py-0.5 text-[10px] text-ink-300">
              {movie.certification}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function MovieRow({
  movie,
  tab,
  favorite,
  onToggleFavorite,
  stage: stageProp,
}: MovieCardProps & { stage?: MovieStage }) {
  const stage = stageProp ?? movieStage(movie);
  const date = moviePrimaryDate(movie, tab);
  const badge = stageBadge(stage);
  const genres = movieGenres(movie).slice(0, 2);
  const caption = waitingCaption(movie, stage, date);

  return (
    <article className="sr-card-hover flex items-center gap-3 rounded-2xl border border-white/8 bg-ink-850/70 p-2.5">
      <Link to={`/movie/${movie.id}`} className="sr-no-tap shrink-0">
        <div className="relative">
          <MoviePoster movie={movie} className="h-[70px] w-[50px]" rounded="rounded-xl" />
          <span className="absolute -bottom-1 -left-1 rounded-md bg-sky-400 px-1 py-0.5 text-[9px] font-bold text-sky-950">
            فیلم
          </span>
        </div>
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link to={`/movie/${movie.id}`} className="sr-no-tap block truncate text-sm font-semibold text-white" dir="auto">
            {movie.title}
          </Link>
          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${badge.className}`}>
            {badge.label}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-ink-400" dir="auto">
          {genres.length ? genres.join(" · ") : movie.originalTitle ?? "—"}
          {caption ? ` · ${caption}` : ""}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-300">
          <JalaliSpans stamp={date} />
          {movie.imdbRating && (
            <span className="rounded bg-black/50 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
              IMDb {movie.imdbRating.split("/")[0]}
            </span>
          )}
          {movie.rottenTomatoesRating && (
            <span className="rounded bg-black/50 px-1.5 py-0.5 text-[9px] font-bold text-red-400">
              RT {movie.rottenTomatoesRating.replace("%", "")}%
            </span>
          )}
          {movie.metacriticRating && (
            <span className="rounded bg-black/50 px-1.5 py-0.5 text-[9px] font-bold text-green-400">
              MC {movie.metacriticRating.split("/")[0]}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        aria-label={favorite ? "حذف از ستارهها" : "افزودن به ستارهها"}
        aria-pressed={favorite}
        onClick={() => onToggleFavorite(movie)}
        className={`sr-no-tap grid h-9 w-9 shrink-0 place-items-center rounded-full ${
          favorite ? "bg-amber-400 text-ink-950" : "bg-white/6 text-white/70"
        }`}
      >
        {favorite ? "★" : "☆"}
      </button>
    </article>
  );
}

export function movieOnlineLabel(movie: Movie): string {
  const date = movie.digitalDate ?? movie.onlineDate ?? movie.physicalDate;
  if (!date) return "تاریخ نامشخص";
  return dayCountdownLabel(date);
}
