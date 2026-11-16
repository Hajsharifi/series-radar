import { useEffect, useState } from "react";
import type { Movie } from "../types";
import { moviePosterUrl } from "../lib/movies";

const GRADIENTS = [
  "linear-gradient(135deg,#0c1a3a 0%,#1d4ed8 55%,#38bdf8 100%)",
  "linear-gradient(135deg,#3b0764 0%,#6b21a8 55%,#a855f7 100%)",
  "linear-gradient(135deg,#7c2d12 0%,#b45309 55%,#f59e0b 100%)",
  "linear-gradient(135deg,#064e3b 0%,#0f766e 55%,#14b8a6 100%)",
  "linear-gradient(135deg,#1e293b 0%,#334155 55%,#475569 100%)",
];

function hashTitle(title?: string): number {
  let value = 0;
  const safe = title ?? "";
  for (let index = 0; index < safe.length; index += 1) {
    value = (value * 31 + safe.charCodeAt(index)) | 0;
  }
  return Math.abs(value);
}

export function MoviePoster({
  movie,
  className = "",
  rounded = "rounded-2xl",
}: {
  movie: Movie;
  className?: string;
  rounded?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = moviePosterUrl(movie);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  if (!url || failed) {
    return (
      <div
        className={`flex items-center justify-center ${rounded} ${className}`}
        style={{ background: GRADIENTS[hashTitle(movie.title) % GRADIENTS.length] }}
        aria-hidden="true"
      >
        <span className="px-2 text-center text-2xl font-black tracking-tight text-white/70" dir="auto">
          {(movie.title ?? movie.originalTitle ?? "؟").slice(0, 2)}
        </span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={movie.title}
      loading="lazy"
      decoding="async"
      className={`object-cover ${rounded} ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
