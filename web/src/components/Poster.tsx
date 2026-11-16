import { useEffect, useState, type ReactNode } from "react";
import { posterFallbackLabel, posterGradient, posterUrl } from "../lib/poster";
import type { Show } from "../types";

interface PosterProps {
  show: Show;
  className?: string;
  rounded?: string;
  sizesHint?: string;
}

export function Poster({ show, className = "", rounded = "rounded-2xl" }: PosterProps) {
  const [failed, setFailed] = useState(false);
  const url = posterUrl(show);

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
      alt={show.title}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`object-cover ${rounded} ${className}`}
      style={{ background: posterGradient(show) }}
    />
  );
}

export function SkeletonPoster({ className = "" }: { className?: string }) {
  return <div className={`sr-skeleton rounded-2xl ${className}`} />;
}

export function SectionTitle({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-bold text-white">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-ink-400">{hint}</p>}
      </div>
      {action}
    </div>
  );
}