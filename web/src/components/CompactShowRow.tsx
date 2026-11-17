import { Link } from "react-router-dom";
import type { Show } from "../types";
import { jalaliDate, tehranClock, toPersianDigits } from "../lib/date";
import { showEventKind } from "../lib/show-event";

interface CompactShowRowProps {
  show: Show;
  favorite: boolean;
  onToggleFavorite: (show: Show) => void;
}

export function CompactShowRow({ show, favorite, onToggleFavorite }: CompactShowRowProps) {
  const event = showEventKind(show);
  const nextSeason = show.nextEpisode?.season ?? show.seasonNumber;
  const nextNumber = show.nextEpisode?.number;
  const episode = event === "new-episode" && nextSeason && nextNumber
    ? `فصل ${toPersianDigits(nextSeason)} · قسمت ${toPersianDigits(nextNumber)}`
    : event === "series-premiere"
      ? "سریال جدید"
      : nextSeason
        ? `فصل ${toPersianDigits(nextSeason)}`
        : "در حال پخش";
  const detailPath = show.source === "tmdb" ? `/tv/${show.id}` : `/show/${show.id}`;
  const clock = show.airstamp && show.source !== "tmdb" ? tehranClock(show.airstamp) : "";

  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-ink-850/70 px-2.5 py-1.5">
      <Link to={detailPath} className="sr-no-tap min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-white" dir="auto">
          {show.title}
        </p>
        <p className="mt-0.5 truncate text-[10px] text-ink-400" dir="rtl">
          {[
            show.network ?? show.networkNames?.[0] ?? "—",
            show.airstamp ? jalaliDate(new Date(show.airstamp)) : null,
            clock,
            episode,
            typeof show.rating === "number" && show.rating > 0 ? `★ ${toPersianDigits(show.rating.toFixed(1))}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </Link>
      <button
        type="button"
        aria-label={favorite ? "حذف از ستاره‌ها" : "افزودن به ستاره‌ها"}
        aria-pressed={favorite}
        onClick={() => onToggleFavorite(show)}
        className={`sr-no-tap grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm ${
          favorite ? "bg-amber-400 text-ink-950" : "bg-white/6 text-white/70"
        }`}
      >
        {favorite ? "★" : "☆"}
      </button>
    </div>
  );
}
