import { useState } from "react";
import { Check, Copy, Download, ExternalLink, RefreshCw } from "lucide-react";
import { useDownloads } from "../hooks/useDownloads";
import { openExternalUrl } from "../lib/native";
import { relativeSyncLabel, toPersianDigits } from "../lib/date";
import {
  payloadLinkCount,
  type DownloadEpisode,
  type DownloadLink,
  type DownloadPayload,
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

function EpisodeRow({ episode }: { episode: DownloadEpisode }) {
  return (
    <div className="rounded-xl border border-edge/10 bg-black/20 p-2.5">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-emerald-400/12 px-2 py-0.5 text-micro font-semibold text-emerald-300">
          {episode.label}
        </span>
        <span
          className="truncate text-micro text-muted"
          dir="ltr"
          style={{ unicodeBidi: "isolate" }}
        >
          {episode.quality}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {episode.links.map((link) => (
          <LinkButton key={link.id} link={link} />
        ))}
      </div>
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
      {payload.seasons?.map((season, seasonIndex) => (
        <div key={`${season.number}-${seasonIndex}`} className="space-y-2">
          <p className="text-caption font-semibold text-ink-100">{season.label}</p>
          {season.groups.map((group, groupIndex) => (
            <div key={`${group.id}-${groupIndex}`} className="space-y-2">
              <p className="text-micro text-ink-300">{group.label}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.episodes?.map((episode) => (
                  <EpisodeRow key={`${episode.number}-${episode.quality}`} episode={episode} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
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
