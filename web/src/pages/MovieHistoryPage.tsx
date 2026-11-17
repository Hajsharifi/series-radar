import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  clearMovieRemovals,
  getMovieRemovals,
  subscribeMovieRemovals,
  type MovieRemoval,
} from "../lib/movie-removals";
import { JalaliSpans } from "../components/DateChip";
import { toPersianDigits } from "../lib/date";

export default function MovieHistoryPage() {
  const [items, setItems] = useState<MovieRemoval[]>(() => getMovieRemovals());

  useEffect(() => {
    const sync = () => setItems(getMovieRemovals());
    sync();
    return subscribeMovieRemovals(sync);
  }, []);

  const released = items.filter((item) => item.reason === "available").length;
  const closed = items.length - released;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-emerald-300/90">پایان یک انتظار</p>
          <h1 className="mt-1 text-2xl font-extrabold text-white">تاریخچهٔ فیلمها</h1>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-300">
            فیلمهایی که از فهرست انتظار و ستارهها خارج شدند — کیفیت خوبشان منتشر شده یا پیگیری آنها پایان یافته است.
           این تاریخچه روی همین گوشی ذخیره میشود و بعد از ۹۰ روز پاک میشود.
          </p>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={clearMovieRemovals}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-ink-200"
          >
            پاک کردن تاریخچه
          </button>
        )}
      </header>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-ink-850/60 px-4 py-12 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-xl text-ink-300">◷</div>
          <p className="mt-3 text-sm font-semibold text-white">هنوز فیلمی پایان نگرفته است</p>
          <p className="mt-1 text-xs text-ink-300">
            وقتی نسخهٔ دیجیتال فیلم ستارهدار شما منتشر شود، در اینجا قابل دیدن است.
          </p>
          <Link to="/movies" className="mt-4 inline-block rounded-lg bg-sky-400 px-4 py-2 text-xs font-semibold text-sky-950">
            رفتن به فیلمها
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full bg-emerald-400/12 px-2.5 py-1 text-emerald-200">
              {toPersianDigits(released)} کیفیت منتشر شد
            </span>
            <span className="rounded-full bg-white/6 px-2.5 py-1 text-ink-300">
              {toPersianDigits(closed)} پایان پیگیری
            </span>
          </div>
          <div className="space-y-2">
            {items.map((item) => (
              <Link
                key={`${item.movieId}-${item.at}`}
                to={`/movie/${item.movieId}`}
                className="sr-no-tap block"
              >
                <article className="flex items-center gap-3 rounded-2xl border border-white/8 bg-ink-850/70 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white" dir="auto">{item.title}</p>
                    <p className="mt-0.5 text-[11px] text-ink-300">
                      {item.reason === "available"
                        ? "نسخهٔ دیجیتال باکیفیت منتشر شد"
                        : "بیش از ۹۰ روز از اکران گذشت و تاریخ دیجیتالی اعلام نشد"}
                    </p>
                  </div>
                  <JalaliSpans stamp={item.at} className="shrink-0 text-[11px] text-ink-300" />
                </article>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
