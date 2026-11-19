import type { Episode } from "../types";

interface EpisodeListProps {
  episodes: Episode[];
  watchedIds?: Set<number>;
  onToggle?: (episodeId: number) => void;
}

export function EpisodeList({ episodes, watchedIds, onToggle }: EpisodeListProps) {
  const bySeason: Record<number, Episode[]> = {};
  for (const ep of episodes) {
    const season = ep.season || 1;
    (bySeason[season] = bySeason[season] || []).push(ep);
  }
  const seasonKeys = Object.keys(bySeason).map(Number).sort((a, b) => a - b);

  if (seasonKeys.length === 0) {
    return <div className="py-8 text-center text-muted">اطلاعات قسمتها موجود نیست</div>;
  }

  return (
    <div className="space-y-6">
      {seasonKeys.map((season) => (
        <section key={season} className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-white">
            <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-caption text-amber-300">
              فصل {season}
            </span>
            <span className="text-caption text-muted">{bySeason[season].length} قسمت</span>
          </h3>
          <div className="space-y-2">
            {bySeason[season]
              .slice()
              .sort((a, b) => (a.number || 0) - (b.number || 0))
              .map((episode) => (
                <EpisodeItem
                  key={episode.id}
                  episode={episode}
                  watched={Boolean(watchedIds?.has(episode.id))}
                  onToggle={onToggle}
                />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function EpisodeItem({
  episode,
  watched,
  onToggle,
}: {
  episode: Episode;
  watched: boolean;
  onToggle?: (episodeId: number) => void;
}) {
  return (
    <article
      className={`sr-card-hover flex items-center gap-3 rounded-xl border p-3 ${
        watched ? "border-emerald-400/20 bg-emerald-500/5" : "border-edge/10 bg-panel/80"
      }`}
    >
      <span className={`w-8 shrink-0 text-center text-caption font-bold ${watched ? "text-emerald-300" : "text-muted"}`}>
        {episode.number}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium ${watched ? "text-muted line-through" : "text-white"}`} dir="auto">
          {episode.name}
        </p>
        <p className="mt-0.5 truncate text-caption text-muted" dir="auto">
          {episode.airdate || "تاریخ مشخص نیست"} {episode.airtime || ""}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onToggle?.(episode.id)}
        aria-label={watched ? "علامت دیدن را بردار" : "این قسمت را دیدم"}
        aria-pressed={watched}
        className={`sr-no-tap grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold transition ${
          watched ? "bg-emerald-400 text-ink-950" : "bg-white/6 text-white/50 active:bg-white/12"
        }`}
      >
        {watched ? "✓" : "○"}
      </button>
    </article>
  );
}
