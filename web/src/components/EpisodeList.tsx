import type { Episode } from '../types';

interface EpisodeListProps {
  episodes: Episode[];
  onToggle: (episodeId: number) => void;
}

export function EpisodeList({ episodes }: EpisodeListProps) {
  const bySeason: Record<number, Episode[]> = {};
  for (const ep of episodes) {
    const s = ep.season || 1;
    (bySeason[s] = bySeason[s] || []).push(ep);
  }
  const seasonKeys = Object.keys(bySeason).map(Number).sort((a, b) => a - b);

  if (seasonKeys.length === 0) {
    return <div className="text-center py-8 text-ink-400">اطلاعات قسمت‌ها موجود نیست</div>;
  }

  return (
    <div className="space-y-6">
      {seasonKeys.map((season) => (
        <section key={season} className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-white">
            <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] text-amber-300">
              فصل {season}
            </span>
            <span className="text-[11px] text-ink-400">{bySeason[season].length} قسمت</span>
          </h3>
          <div className="space-y-2">
            {bySeason[season].sort((a, b) => a.number - b.number).map((ep) => (
              <EpisodeItem key={ep.id} episode={ep} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function EpisodeItem({ episode }: { episode: any }) {
  return (
    <article className="sr-card-hover flex items-center gap-3 rounded-xl border border-white/8 bg-ink-850/70 p-3">
      <span className="shrink-0 w-8 text-center text-[11px] font-bold text-ink-400">
        {episode.number}
      </span>
      <a href={'/show/episode/' + episode.id} className="sr-no-tap flex-1 min-w-0">
        <p className="truncate text-sm font-medium text-white" dir="auto">{episode.name}</p>
        <p className="mt-0.5 truncate text-[11px] text-ink-400" dir="auto">
          {episode.airdate || 'تاریخ مشخص نیست'} {episode.airtime || ''}
        </p>
      </a>
      <button type="button" className="sr-no-tap grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/6 text-white/70">
        ☆
      </button>
    </article>
  );
}