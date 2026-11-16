import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { BoxOfficeEntry, BoxOfficePayload } from "../types";
import { cachedBoxOffice, fetchBoxOffice, seedBoxOffice } from "../lib/boxoffice";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { usdFull, usdShort } from "../lib/format";
import { toPersianDigits } from "../lib/date";
import { RelativeUpdated } from "../components/DateChip";
import { MoviePoster } from "../components/MoviePoster";

function EntryTitle({ entry }: { entry: BoxOfficeEntry }) {
  const content = (
    <>
      {entry.posterPath ? (
        <MoviePoster
          movie={{
            id: entry.id ?? entry.rank ?? 0,
            title: entry.title,
            posterPath: entry.posterPath,
          }}
          className="h-[52px] w-[36px] shrink-0"
          rounded="rounded-lg"
        />
      ) : (
        <div className="grid h-[52px] w-[36px] shrink-0 place-items-center rounded-lg bg-white/6 text-[10px] text-ink-400">
          {entry.rank ? `#${toPersianDigits(entry.rank)}` : "•"}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-white" dir="auto">
          {entry.title}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-ink-400" dir="auto">
          {[entry.distributor, entry.weeks ? `${toPersianDigits(entry.weeks)} هفته` : null]
            .filter(Boolean)
            .join(" · ") || "—"}
        </p>
      </div>
    </>
  );
  if (entry.id) {
    return (
      <Link to={`/movie/${entry.id}`} className="sr-no-tap flex min-w-0 flex-1 items-center gap-2.5">
        {content}
      </Link>
    );
  }
  return <div className="flex min-w-0 flex-1 items-center gap-2.5">{content}</div>;
}

function Metric({ label, value, tone = "muted" }: { label: string; value: string; tone?: "muted" | "amber" | "sky" }) {
  const tones = {
    muted: "text-ink-100",
    amber: "text-amber-300",
    sky: "text-sky-300",
  } as const;
  return (
    <div className="rounded-xl bg-white/4 px-2.5 py-2">
      <p className="text-[10px] text-ink-400">{label}</p>
      <p className={`mt-0.5 text-[12px] font-semibold ${tones[tone]}`}>{value}</p>
    </div>
  );
}

function WeekendCard({ entry }: { entry: BoxOfficeEntry }) {
  return (
    <article className="sr-card-hover rounded-2xl border border-white/8 bg-ink-850/70 p-3">
      <div className="flex items-center gap-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-sky-400 text-[12px] font-black text-sky-950">
          {toPersianDigits(entry.rank ?? 0)}
        </span>
        <EntryTitle entry={entry} />
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        <Metric label="آخر هفته" value={usdShort(entry.weekendGross)} tone="sky" />
        <Metric label="داخلی کل" value={usdShort(entry.domestic)} />
        <Metric label="جهانی" value={usdShort(entry.worldwide)} tone="amber" />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 rounded-xl bg-black/25 px-2.5 py-1.5">
        <span className="text-[10px] text-ink-400">بودجه</span>
        <span className="text-[11px] font-medium text-ink-200">{usdShort(entry.budget)}</span>
      </div>
    </article>
  );
}

function YearRow({ entry }: { entry: BoxOfficeEntry }) {
  return (
    <article className="flex items-center gap-2.5 rounded-2xl border border-white/8 bg-ink-850/60 p-2.5">
      <span className="w-5 shrink-0 text-center text-[12px] font-black text-ink-400">
        {toPersianDigits(entry.rank ?? 0)}
      </span>
      <EntryTitle entry={entry} />
      <div className="shrink-0 text-left">
        <p className="text-[12px] font-bold text-amber-300">{usdShort(entry.worldwide)}</p>
        <p className="text-[10px] text-ink-400">داخلی {usdShort(entry.domestic)}</p>
      </div>
    </article>
  );
}

export function BoxOfficePage() {
  const [state, setState] = useState(() => cachedBoxOffice() ?? seedBoxOffice());
  const [loading, setLoading] = useState(state.source !== "network");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  usePullToRefresh(() => load(true), { threshold: 80 });

  const load = useCallback(async (force: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (force) setRefreshing(true);
    try {
      const result = await fetchBoxOffice(force);
      setState(result);
      setError(null);
    } catch (err) {
      setState((prev) => (prev.payload.weekend.length || prev.payload.yearly.length ? prev : seedBoxOffice()));
      setError(err instanceof Error ? err.message : "خطا در دریافت گیشه");
    } finally {
      inFlight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const payload: BoxOfficePayload = state.payload;
  const weekend = payload.weekend ?? [];
  const yearly = payload.yearly ?? [];
  const weekendTotal = weekend.reduce((sum, entry) => sum + (entry.weekendGross ?? 0), 0);
  const top = yearly[0];

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-br from-ink-850 via-ink-900 to-ink-950 p-5">
        <div className="pointer-events-none absolute -top-16 left-8 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative space-y-3">
          <p className="text-[11px] font-medium tracking-wide text-emerald-300/90">باکس آفیس آمریکا و جهان</p>
          <h1 className="text-2xl font-extrabold leading-snug text-white">
            گیشه، به زبان <span className="text-amber-300">عدد</span>
          </h1>
          <p className="text-xs leading-relaxed text-ink-300">
            فروش آخر هفته، فروش داخلی و جهانی، و بودجهٔ تولید — به‌روزرسانی از Box Office Mojo و TMDB.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] text-ink-200">
              سال {toPersianDigits(payload.year ?? new Date().getFullYear())}
            </span>
            {payload.weekendLabel && (
              <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] text-ink-200">
                آخر هفتهٔ {payload.weekendLabel}
              </span>
            )}
            <button
              type="button"
              onClick={() => void load(true)}
              className="rounded-full bg-emerald-400 px-3 py-1 text-[11px] font-bold text-emerald-950"
            >
              {refreshing ? "در حال به‌روزرسانی…" : "به‌روزرسانی"}
            </button>
          </div>
          <p className="text-[11px] text-ink-400">
            {state.source === "seed" ? "نسخهٔ همراه اپ (آفلاین)" : <RelativeUpdated iso={payload.updatedAt} />}
          </p>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          ارتباط با سرور گیشه برقرار نشد — دادهٔ ذخیره‌شده نمایش داده می‌شود.
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-white/8 bg-ink-850/60 p-3">
          <p className="text-[10px] text-ink-400">جمع ۱۰ فیلم برتر</p>
          <p className="mt-1 text-sm font-bold text-sky-300">{usdShort(weekendTotal)}</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-ink-850/60 p-3">
          <p className="text-[10px] text-ink-400">صدر جدول سال</p>
          <p className="mt-1 truncate text-sm font-bold text-white" dir="auto">{top?.title ?? "—"}</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-ink-850/60 p-3">
          <p className="text-[10px] text-ink-400">فروش جهانی صدر</p>
          <p className="mt-1 text-sm font-bold text-amber-300">{usdShort(top?.worldwide)}</p>
        </div>
      </div>

      <section>
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-white">فروش آخر هفته</h2>
          <span className="text-[11px] text-ink-400">{toPersianDigits(weekend.length)} فیلم</span>
        </div>
        {loading && weekend.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="sr-skeleton h-24 rounded-2xl" />
            ))}
          </div>
        ) : weekend.length === 0 ? (
          <p className="rounded-2xl border border-white/8 bg-ink-850/60 px-4 py-6 text-center text-xs text-ink-400">
            جدول آخر هفته در دسترس نیست.
          </p>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {weekend.map((entry) => (
              <WeekendCard key={`${entry.rank}-${entry.title}`} entry={entry} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-white">پرفروش‌ترین‌های سال</h2>
          <span className="text-[11px] text-ink-400">{toPersianDigits(yearly.length)} فیلم</span>
        </div>
        {yearly.length === 0 ? (
          <p className="rounded-2xl border border-white/8 bg-ink-850/60 px-4 py-6 text-center text-xs text-ink-400">
            جدول سالانه در دسترس نیست.
          </p>
        ) : (
          <div className="space-y-2">
            {yearly.map((entry) => (
              <YearRow key={`${entry.rank}-${entry.title}`} entry={entry} />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/8 bg-ink-850/50 p-4">
        <h3 className="text-sm font-semibold text-white">این اعداد چه معنایی دارند؟</h3>
        <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-ink-400">
          <li>«آخر هفته» فروش سه‌روزهٔ سینماهای آمریکاست.</li>
          <li>«داخلی» فروش آمریکا و کانادا و «جهانی» فروش کل دنیاست.</li>
          <li>«بودجه» تخمین بودجهٔ تولید است و هزینهٔ بازاریابی را شامل نمی‌شود.</li>
        </ul>
        <p className="mt-2 text-[10px] text-ink-500">
          منبع: Box Office Mojo و TMDB {payload.year ? `· ${usdFull(top?.worldwide)}` : ""}
        </p>
      </section>
    </div>
  );
}
