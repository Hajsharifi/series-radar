import { Link, Outlet, useLocation } from "react-router-dom";
import { useFavorites } from "../hooks/useFavorites";
import { useMovieFavorites } from "../hooks/useMovies";
import { useScheduleContext } from "../hooks/ScheduleContext";
import { RelativeUpdated } from "./DateChip";
import { toPersianDigits } from "../lib/date";

const NAV = [
  { to: "/", label: "رادار", icon: "◉" },
  { to: "/search", label: "جستجو", icon: "🔍" },
  { to: "/movies", label: "فیلم‌ها", icon: "▤" },
  { to: "/boxoffice", label: "گیشه", icon: "◫" },
  { to: "/favorites", label: "ستاره‌ها", icon: "★" },
  { to: "/settings", label: "تنظیمات", icon: "⚙" },
];

export function Layout() {
  const { items } = useFavorites();
  const movies = useMovieFavorites();
  const { updatedAt, refresh, refreshing } = useScheduleContext();
  const location = useLocation();
  const totalStars = items.length + movies.items.length;

  return (
    <div className="app-shell">
      <header className="sr-sticky">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-400 text-base font-black text-ink-950">
              ◉
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-extrabold leading-tight text-white">رادار</h1>
              <p className="truncate text-[11px] text-ink-400">سریال و فیلم‌هایی که به‌زودی می‌آیند</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden rounded-full border border-white/8 bg-white/4 px-2.5 py-1 text-[11px] text-ink-300 sm:block">
              {toPersianDigits(totalStars)} ستاره
            </span>
            <button
              type="button"
              onClick={refresh}
              aria-label="به‌روزرسانی داده‌ها"
              className="sr-no-tap rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-ink-200 active:bg-white/10"
            >
              <span className={refreshing ? "inline-block animate-spin" : "inline-block"}>↻</span>
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 pb-2">
          <RelativeUpdated iso={updatedAt} />
        </div>
      </header>

      <main className="sr-main">
        <Outlet />
      </main>

      <nav className="sr-safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-white/8 bg-ink-950/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-stretch justify-around px-1">
          {NAV.map((item) => {
            const active = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`sr-no-tap flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition ${
                  active ? "text-amber-300" : "text-ink-400"
                }`}
              >
                <span className="text-base leading-none">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
