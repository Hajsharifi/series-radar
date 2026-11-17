import { Link } from "react-router-dom";
import type { Show } from "../types";
import { EVENT_CHIP, EVENT_LABEL } from "../lib/labels";
import { showEventKind } from "../lib/show-event";
import { countdownLabel, tehranClock, toPersianDigits } from "../lib/date";
import { Poster } from "./Poster";
import { JalaliSpans } from "./DateChip";

interface ShowCardProps {
  show: Show;
  favorite: boolean;
  onToggleFavorite: (show: Show) => void;
}

export function ShowCard({ show, favorite, onToggleFavorite }: ShowCardProps) {
  const countdown = countdownLabel(show.airstamp);
  const clock = show.airstamp && show.source !== "tmdb" ? tehranClock(show.airstamp) : "";
  const event = showEventKind(show);
  const dateStamp = show.airstamp ?? (show.nextEpisode?.airdate ? `${show.nextEpisode.airdate}T12:00:00Z` : null);
  const nextSeason = show.nextEpisode?.season ?? show.seasonNumber;
  const nextNumber = show.nextEpisode?.number;
  const detailPath = show.source === "tmdb" ? `/tv/${show.id}` : `/show/${show.id}`;

  return (
    <article className="sr-card-hover sr-pop group relative flex flex-col overflow-hidden rounded-2xl border border-white/8 bg-ink-850/80 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.9)]">
      <Link to={detailPath} className="sr-no-tap relative block">
        <Poster show={show} className="aspect-[2/3] w-full" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-ink-950 via-ink-950/70 to-transparent" />
        <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-1">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${EVENT_CHIP[event]}`}>
            {EVENT_LABEL[event]}
          </span>
          {countdown && (
            <span className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-ink-200 backdrop-blur">
              {countdown}
            </span>
          )}
        </div>
      </Link>

      <button
        type="button"
        aria-label={favorite ? "حذف از ستاره‌ها" : "افزودن به ستاره‌ها"}
        aria-pressed={favorite}
        onClick={() => onToggleFavorite(show)}
        className={`sr-no-tap absolute top-2 left-2 z-10 grid h-10 w-10 place-items-center rounded-full text-base shadow-lg backdrop-blur transition ${
          favorite ? "bg-amber-400 text-ink-950" : "bg-black/45 text-white/85 hover:bg-black/65"
        }`}
      >
        {favorite ? "★" : "☆"}
      </button>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <Link
          to={detailPath}
          className="sr-no-tap line-clamp-2 min-h-[2.4em] text-sm font-bold leading-snug text-white"
          dir="auto"
        >
          {show.title}
        </Link>
        {show.originalTitle && show.originalTitle !== show.title && (
          <p className="-mt-1 truncate text-[10px] text-ink-400" dir="auto">{show.originalTitle}</p>
        )}

        <div className="flex items-center justify-between gap-1 text-[11px] text-ink-400" dir="rtl">
          <span className="truncate">{show.network ?? show.networkNames?.[0] ?? "—"}</span>
          {clock && <span className="shrink-0 tabular-nums">{clock}</span>}
        </div>

        <div className="mt-auto flex items-center justify-between gap-1 border-t border-white/6 pt-1.5 text-[11px]">
          {dateStamp ? (
            <JalaliSpans stamp={dateStamp} className="text-[11px] font-medium text-ink-200" />
          ) : (
            <span className="text-[11px] text-ink-400">در حال پخش</span>
          )}
          {event === "series-premiere" ? (
            <span className="shrink-0 rounded-md bg-amber-400/12 px-1.5 py-0.5 text-[10px] text-amber-200">
              سریال جدید
            </span>
          ) : event === "new-episode" && nextSeason && nextNumber ? (
            <span className="shrink-0 rounded-md bg-emerald-400/12 px-1.5 py-0.5 text-[10px] text-emerald-200">
              فصل {toPersianDigits(nextSeason)} · قسمت {toPersianDigits(nextNumber)}
            </span>
          ) : nextSeason ? (
            <span className="shrink-0 rounded-md bg-white/6 px-1.5 py-0.5 text-[10px] text-ink-300">
              فصل {toPersianDigits(nextSeason)}
            </span>
          ) : (
            <span className="shrink-0 rounded-md bg-amber-400/12 px-1.5 py-0.5 text-[10px] text-amber-200">
              سریال جدید
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

export function ShowRow({ show, favorite, onToggleFavorite }: ShowCardProps) {
  const countdown = countdownLabel(show.airstamp);
  const detailPath = show.source === "tmdb" ? `/tv/${show.id}` : `/show/${show.id}`;
  const event = showEventKind(show);
  const nextSeason = show.nextEpisode?.season ?? show.seasonNumber;
  const nextNumber = show.nextEpisode?.number;
  const episodeText = event === "series-premiere"
    ? null
    : event === "new-episode" && nextSeason && nextNumber
      ? `فصل ${toPersianDigits(nextSeason)} · قسمت ${toPersianDigits(nextNumber)}`
      : nextSeason
        ? `فصل ${toPersianDigits(nextSeason)}`
        : null;
  return (
    <article className="sr-card-hover flex items-center gap-3 rounded-2xl border border-white/8 bg-ink-850/70 p-2.5">
      <Link to={detailPath} className="sr-no-tap shrink-0">
        <div className="relative">
          <Poster show={show} className="h-[70px] w-[50px]" rounded="rounded-xl" />
          <span className={`absolute -bottom-1 -left-1 rounded-md px-1 py-0.5 text-[9px] font-bold ring-1 ${EVENT_CHIP[event]}`}>
            {EVENT_LABEL[event]}
          </span>
        </div>
      </Link>
      <div className="min-w-0 flex-1">
        <Link to={detailPath} className="sr-no-tap block truncate text-sm font-semibold text-white" dir="auto">
          {show.title}
        </Link>
        <p className="mt-0.5 truncate text-[11px] text-ink-400" dir="rtl">
          {[show.network ?? show.networkNames?.[0] ?? "—", show.airstamp && show.source !== "tmdb" ? tehranClock(show.airstamp) : null, episodeText, countdown]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="mt-0.5 text-[11px] text-ink-300">
          {show.airstamp ? <JalaliSpans stamp={show.airstamp} /> : <span>در حال پخش</span>}
        </div>
      </div>
      <button
        type="button"
        aria-label={favorite ? "حذف از ستاره‌ها" : "افزودن به ستاره‌ها"}
        aria-pressed={favorite}
        onClick={() => onToggleFavorite(show)}
        className={`sr-no-tap grid h-9 w-9 shrink-0 place-items-center rounded-full ${
          favorite ? "bg-amber-400 text-ink-950" : "bg-white/6 text-white/70"
        }`}
      >
        {favorite ? "★" : "☆"}
      </button>
    </article>
  );
}