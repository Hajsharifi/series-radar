import { useState } from "react";
import { Check, Copy, Download, ExternalLink, RefreshCw, ChevronDown } from "lucide-react";
import { useDownloads } from "../hooks/useDownloads";
import { openExternalUrl } from "../lib/native";
import { relativeSyncLabel, toPersianDigits } from "../lib/date";
import {
  payloadLinkCount,
  type DownloadEpisode,
  type DownloadLink,
  type DownloadPayload,
  type DownloadSeason,
} from "../lib/downloads";

function LinkButton({ link }: { link: DownloadLink }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-1 rounded-lg border border-edge/12 bg-black/25 px-2 py-1.5">
      <button
        type="button"
        onClick={() => openExternalUrl(link.url)}
        className="flex min-w-0 items-center gap-1.5 text-caption text-emerald-200 hover:text-white"
        title={link.url}
      >
        <Download className="h-3.5 w-3.5 shrink-0" strokeWidth={1.9} />
        <span className="max-w-[9rem] truncate">{link.label || "دانلود"}</span>
      </button>
      <span
        className="max-w-[10rem] truncate text-micro text-muted"
        dir="ltr"
        style={{ unicodeBidi: "isolate" }}
        title={link.filename}
      >
        {link.filename}
      </span>
      <button
        type="button"
        aria-label="کپی کردن لینک دانلود"
        onClick={() => {
          navigator.clipboard?.writeText(link.url).then(
            () => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            },
            () => setCopied(false),
          );
        }}
        className="shrink-0 rounded p-1 text-muted hover:text-white"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" strokeWidth={1.8} />}
      </button>
    </div>
  );
}



/** Groups episodes by number and collects qualities for each episode */
function groupEpisodesByNumber(episodes: DownloadEpisode[]): Map<number, { episode: DownloadEpisode; qualities: DownloadEpisode[] }> {
  const map = new Map<number, { episode: DownloadEpisode; qualities: DownloadEpisode[] }>();
  for (const ep of episodes) {
    const existing = map.get(ep.number);
    if (!existing) {
      map.set(ep.number, { episode: ep, qualities: [ep] });
    } else {
      existing.qualities.push(ep);
    }
  }
  return map;
}

/** Merges seasons with same number (e.g., dubbled + hardsub for season 1) */
function mergeSeasons(seasons: DownloadSeason[]): DownloadSeason[] {
  const map = new Map<number, DownloadSeason>();
  for (const season of seasons) {
    const existing = map.get(season.number);
    if (!existing) {
      map.set(season.number, { ...season });
    } else {
      // Merge groups from same season number
      existing.groups.push(...season.groups);
      existing.label = season.label || existing.label;
    }
  }
  return Array.from(map.values()).sort((a, b) => (a.number || 0) - (b.number || 0));
}

function SeasonNode({ 
  season, 
  defaultOpen = false,
  hasNewLinks = false
}: { 
  season: DownloadSeason; 
  defaultOpen?: boolean;
  hasNewLinks?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const totalEpisodes = season.groups.reduce((sum, g) => sum + (g.episodes?.length || 0), 0);
  const qualities = new Set<string>();
  season.groups.forEach(g => g.quality?.forEach(q => qualities.add(q)));
  
  return (
    <div className="rounded-xl border border-edge/10 bg-black/15 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-2 p-3 text-right"
      >
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-caption font-semibold text-white">
            {season.label}
          </span>
          {totalEpisodes > 0 && (
            <span className="rounded-full bg-white/8 px-2 py-0.5 text-micro text-ink-200">
              {toPersianDigits(totalEpisodes)} قسمت
            </span>
          )}
          {qualities.size > 0 && (
            <span className="text-micro text-muted">
              {Array.from(qualities).join("، ")}
            </span>
          )}
          {hasNewLinks && (
            <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-micro font-semibold text-emerald-300">
              لینک تازه
            </span>
          )}
        </div>
        <ChevronDown 
          className={`h-4 w-4 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} 
          strokeWidth={1.8} 
        />
      </button>
      
      {isOpen && (
        <div className="space-y-2 p-3 border-t border-edge/10">
          {season.groups.map((group, groupIndex) => (
            <div key={`${group.id}-${groupIndex}`} className="space-y-2">
              <p className="text-micro text-ink-300">{group.label}</p>
              <div className="space-y-2">
                {(() => {
                  const epMap = groupEpisodesByNumber(group.episodes || []);
                  return Array.from(epMap.entries())
                    .sort((a, b) => a[0] - b[0])
                    .map(([num, { episode, qualities }]) => (
                      <div key={num} className="rounded-xl border border-edge/10 bg-black/20 p-2.5">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-emerald-400/12 px-2 py-0.5 text-micro font-semibold text-emerald-300">
                            {episode.label}
                          </span>
                          <span className="text-micro text-muted">
                            {qualities.map(q => q.quality).join("، ")}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {qualities.flatMap(q => q.links).map((link) => (
                            <LinkButton key={link.id} link={link} />
                          ))}
                        </div>
                      </div>
                    ));
                })()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DownloadLinksBody({ payload }: { payload: DownloadPayload }) {
  return (
    <div className="space-y-3">
      {payload.groups?.map((group) => (
        <div key={group.id} className="space-y-2">
          <p className="text-caption font-semibold text-ink-100">{group.label}</p>
          {group.items?.map((item) => (
            <div key={item.id} className="rounded-xl border border-edge/10 bg-black/20 p-2.5">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="text-micro font-semibold text-white" dir="ltr" style={{ unicodeBidi: "isolate" }}>
                  {item.quality}
                </span>
                {item.encoder && <span className="text-micro text-muted">{item.encoder}</span>}
                {item.note && <span className="text-micro text-amber-200/80">{item.note}</span>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {item.links.map((link) => (
                  <LinkButton key={link.id} link={link} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
      {payload.seasons?.length && (() => {
        const mergedSeasons = mergeSeasons(payload.seasons!);
        // Find season with new links to open by default
        const seasonWithNewLinks = mergedSeasons.findIndex(s => 
          s.groups.some(g => g.episodes?.some(ep => ep.links.length > 0))
        );
        return (
          <>
            {mergedSeasons.map((season, seasonIndex) => (
              <SeasonNode
                key={`${season.number}-${seasonIndex}`}
                season={season}
                defaultOpen={seasonIndex === 0 || seasonIndex === seasonWithNewLinks}
                hasNewLinks={season.groups.some(g => g.episodes?.some(ep => ep.links.length > 0))}
              />
            ))}
          </>
        );
      })()}
    </div>
  );
}

/** Download links for one starred item, shown inside its detail page. */
export function DownloadPanel({
  keyName,
  enabled = true,
}: {
  keyName: string;
  enabled?: boolean;
}) {
  const { items, loading, refreshing, error, refresh } = useDownloads(
    keyName ? [keyName] : [],
    enabled,
  );
  if (!enabled || !keyName) return null;
  const payload = items[keyName];
  const count = payloadLinkCount(payload);

  return (
    <section className="space-y-3 rounded-card border border-emerald-400/15 bg-panel/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-emerald-300" strokeWidth={1.9} />
          <h2 className="text-sm font-bold text-white">لینکهای دانلود</h2>
          {count > 0 && (
            <span className="rounded-full bg-emerald-400/12 px-2 py-0.5 text-micro font-medium text-emerald-300">
              {toPersianDigits(count)} لینک
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          aria-label="بررسی دوباره لینکهای دانلود"
          className="rounded-lg p-1.5 text-muted hover:bg-white/6 hover:text-white disabled:opacity-40"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} strokeWidth={1.8} />
        </button>
      </div>

      {loading && !payload && (
        <p role="status" className="text-caption text-muted">در حال بررسی منبع دانلود…</p>
      )}
      {error && (
        <div className="rounded-xl border border-amber-400/15 bg-amber-500/8 px-3 py-2 text-caption text-amber-200">
          <p>{error}</p>
          <button type="button" onClick={refresh} className="mt-1.5 underline underline-offset-2">
            تلاش دوباره
          </button>
        </div>
      )}
      {payload?.status === "error" && (
        <div className="rounded-xl border border-amber-400/15 bg-amber-500/8 px-3 py-2 text-caption text-amber-200">
          <p>منبع دانلود در دسترس نیست؛ دوباره تلاش کنید.</p>
          <button type="button" onClick={refresh} className="mt-1.5 underline underline-offset-2">
            تلاش دوباره
          </button>
        </div>
      )}
      {payload?.status === "none" && (
        <div className="rounded-xl border border-edge/10 bg-black/20 px-3 py-2.5">
          <p className="text-caption text-copy">هنوز لینک دانلودی منتشر نشده است.</p>
          <p className="mt-1 text-micro text-muted">
            آخرین بررسی {relativeSyncLabel(payload.checkedAt)} — هر ساعت دوباره چک میشود.
          </p>
        </div>
      )}
      {payload?.status === "found" && (
        <>
          <DownloadLinksBody payload={payload} />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-edge/10 pt-2.5">
            <span className="text-micro text-muted">
              آخرین بررسی {relativeSyncLabel(payload.checkedAt)}
            </span>
            {payload.source?.url && (
              <button
                type="button"
                onClick={() => openExternalUrl(payload.source!.url)}
                className="flex items-center gap-1 text-micro text-ink-300 hover:text-white"
              >
                مشاهده در منبع
                <ExternalLink className="h-3 w-3" strokeWidth={1.8} />
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export default DownloadPanel;