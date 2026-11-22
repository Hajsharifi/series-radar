import { useEffect, useState, type ReactNode, memo, type MemoExoticComponent } from "react";
import { posterFallbackLabel, posterGradient, posterUrl } from "../lib/poster";
import type { Show } from "../types";

interface PosterProps {
  show: Show;
  className?: string;
  rounded?: string;
  sizesHint?: string;
}

function PosterInner({ show, className = "", rounded = "rounded-card" }: PosterProps) {
  const [failed, setFailed] = useState(false);
  const url = posterUrl(show);

  // Responsive srcset for TMDB posters (2:3 aspect ratio) to cut payload and CLS.
  const srcSet =
    show.posterPath && !show.posterPath.startsWith("http")
      ? `https://image.tmdb.org/t/p/w342${show.posterPath} 342w, https://image.tmdb.org/t/p/w500${show.posterPath} 500w`
      : undefined;

  useEffect(() => {
    setFailed(false);
  }, [url]);

  if (!url || failed) {
    return (
      <div
        className={`flex items-center justify-center ${rounded} ${className}`}
        style={{ background: posterGradient(show) }}
        aria-hidden="true"
      >
        <span className="text-2xl font-black tracking-tight text-white/70">{posterFallbackLabel(show)}</span>
      </div>
    );
  }

  return (
    <img
      src={url}
      srcSet={srcSet}
      sizes="(max-width: 640px) 45vw, 200px"
      width={342}
      height={513}
      alt={show.title}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`object-cover ${rounded} ${className}`}
      style={{ background: posterGradient(show) }}
    />
  );
}

export const Poster: MemoExoticComponent<typeof PosterInner> = memo(PosterInner, (prev, next) => {
  return (
    prev.show.id === next.show.id &&
    prev.show.posterPath === next.show.posterPath &&
    prev.show.posterOriginal === next.show.posterOriginal &&
    prev.className === next.className &&
    prev.rounded === next.rounded
  );
});

export function SkeletonPoster({ className = "" }: { className?: string }) {
  return <div className={`sr-skeleton rounded-card ${className}`} />;
}

export function SectionTitle({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-bold text-white">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}