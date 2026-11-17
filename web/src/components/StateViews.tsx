import type { ReactNode } from "react";

export function LoadingState({ label = "در حال بارگذاری…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/8 bg-ink-850/60 px-4 py-14">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/10 border-t-amber-400" />
      <p className="text-xs text-ink-300">{label}</p>
    </div>
  );
}

export function EmptyState({
  icon = "✦",
  title,
  description,
  action,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`rounded-2xl border border-white/8 bg-ink-850/60 px-4 text-center ${compact ? "py-8" : "py-12"}`}>
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-xl text-ink-300">
        {icon}
      </div>
      <p className="mt-3 text-sm font-semibold text-white">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-ink-400">{description}</p>}
      {action && <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

export function SkeletonCards({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-2xl border border-white/8 bg-ink-850/60">
          <div className="sr-skeleton aspect-[2/3] w-full" />
          <div className="space-y-2 p-3">
            <div className="sr-skeleton h-3.5 w-3/4 rounded" />
            <div className="sr-skeleton h-2.5 w-1/2 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-ink-850/60 p-3">
          <div className="sr-skeleton h-14 w-10 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="sr-skeleton h-3 w-2/3 rounded" />
            <div className="sr-skeleton h-2.5 w-1/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
