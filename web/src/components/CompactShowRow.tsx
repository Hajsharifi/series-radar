import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { memo, type MemoExoticComponent } from "react";
import type { Show } from "../types";
import { jalaliDate, tehranClock, toPersianDigits } from "../lib/date";
import { showEventKind } from "../lib/show-event";

interface CompactShowRowProps {
  show: Show;
  favorite: boolean;
  onToggleFavorite: (show: Show) => void;
}

function CompactShowRowInner({ show, favorite, onToggleFavorite }: CompactShowRowProps) {
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
    <div className="flex items-center gap-2 rounded-control border border-edge/10 bg-panel/80 px-2.5 py-1.5">
      <Link to={detailPath} className="sr-no-tap min-w-0 flex-1">
        <p className="truncate text-body font-semibold text-white" dir="auto">
          {show.title}
        </p>
        <p className="mt-0.5 truncate text-caption text-muted" dir="rtl">
          {[
            show.network ?? show.networkNames?.[0] ?? "—",
            show.airstamp ? jalaliDate(new Date(show.airstamp)) : null,
            clock,
            episode,
            typeof show.rating === "number" && show.rating > 0 ? `امتیاز ${toPersianDigits(show.rating.toFixed(1))}` : null,
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
        <Star className="h-[18px] w-[18px]" fill={favorite ? "currentColor" : "none"} strokeWidth={1.8} />
      </button>
    </div>
  );
}

export const CompactShowRow: MemoExoticComponent<typeof CompactShowRowInner> = memo(CompactShowRowInner, (prev, next) => {
  return (
    prev.show.id === next.show.id &&
    prev.show.updatedAt === next.show.updatedAt &&
    prev.favorite === next.favorite &&
    prev.onToggleFavorite === next.onToggleFavorite
  );
});
