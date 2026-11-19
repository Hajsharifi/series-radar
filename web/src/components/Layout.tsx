import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import {
  CalendarDays,
  Download,
  Ellipsis,
  Film,
  Radar,
  RefreshCw,
  Search,
  Settings,
  Star,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import { useFavorites } from "../hooks/useFavorites";
import { useMovieFavorites } from "../hooks/useMovies";
import { useScheduleContext } from "../hooks/ScheduleContext";
import { RelativeUpdated } from "./DateChip";
import { BackButton, hasInAppHistory } from "./BackButton";
import { toPersianDigits } from "../lib/date";
import { useNetworkState, retryNetwork } from "../lib/offline";
import { queryClient } from "../lib/queryClient";
import { ErrorBoundary } from "./ErrorBoundary";
import { Button } from "./ui/Button";

const NAV: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: "/", label: "رادار", icon: Radar },
  { to: "/search", label: "جستجو", icon: Search },
  { to: "/calendar", label: "تقویم", icon: CalendarDays },
  { to: "/movies", label: "فیلم‌ها", icon: Film },
  { to: "/favorites", label: "ستاره‌ها", icon: Star },
];

export function Layout() {
  const { items } = useFavorites();
  const movies = useMovieFavorites();
  const { updatedAt, refresh, refreshing } = useScheduleContext();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const totalStars = items.length + movies.items.length;
  const network = useNetworkState();

  useEffect(() => {
    mainRef.current?.focus();
    window.scrollTo({ top: 0, behavior: "auto" });
    setMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (event: MouseEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [moreOpen]);

  return (
    <div className="app-shell">
      <a href="#main-content" className="sr-skip-link">
        پرش به محتوای اصلی
      </a>
      {network.offline && (
        <div role="status" aria-live="polite" className="border-b border-amber-400/25 bg-amber-500/15 px-4 py-2 text-center text-caption text-amber-200">
          <span>
            اتصال برقرار نشد — نمایش آخرین داده
            {network.savedAt ? ` (${new Date(network.savedAt).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })})` : ""}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="mr-2 min-h-7 px-2 text-caption text-amber-200"
            onClick={() => {
              retryNetwork();
              queryClient.invalidateQueries();
            }}
          >
            تلاش مجدد
          </Button>
        </div>
      )}
      <header className="sr-sticky">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {(location.pathname !== "/" || hasInAppHistory(location)) && (
              <BackButton compact />
            )}
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-brand text-ink-950">
              <Radar className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-title text-white">رادار</h1>
              <p className="truncate text-caption text-muted">سریال و فیلم‌هایی که به‌زودی می‌آیند</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-edge/12 bg-white/4 px-2.5 py-1 text-caption text-ink-300 sm:inline-flex">
              <Star className="h-3.5 w-3.5 text-brand" fill="currentColor" strokeWidth={0} />
              {toPersianDigits(totalStars)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={refresh}
              aria-label="به‌روزرسانی داده‌ها"
              className="h-9 w-9"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} strokeWidth={1.8} />
            </Button>
            <div ref={moreRef} className="relative">
              <Button
                variant="ghost"
                size="icon"
                aria-label="بیشتر"
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                onClick={() => setMoreOpen((value) => !value)}
                className="h-9 w-9"
              >
                <Ellipsis className="h-4 w-4" strokeWidth={1.8} />
              </Button>
              {moreOpen && (
                <div
                  role="menu"
                  className="sr-pop absolute left-0 top-full z-40 mt-2 w-44 overflow-hidden rounded-card border border-edge/15 bg-panel-raised p-1 shadow-float"
                >
                  <Link
                    to="/downloads"
                    role="menuitem"
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-2 rounded-control px-3 py-2 text-caption text-copy transition hover:bg-white/6"
                  >
                    <Download className="h-4 w-4 text-emerald-300" strokeWidth={1.8} />
                    لینکهای دانلود
                  </Link>
                  <Link
                    to="/boxoffice"
                    role="menuitem"
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-2 rounded-control px-3 py-2 text-caption text-copy transition hover:bg-white/6"
                  >
                    <Ticket className="h-4 w-4 text-muted" strokeWidth={1.8} />
                    گیشه
                  </Link>
                  <Link
                    to="/settings"
                    role="menuitem"
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-2 rounded-control px-3 py-2 text-caption text-copy transition hover:bg-white/6"
                  >
                    <Settings className="h-4 w-4 text-muted" strokeWidth={1.8} />
                    تنظیمات
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 pb-2">
          <RelativeUpdated iso={updatedAt} />
        </div>
      </header>

      <main id="main-content" ref={mainRef} tabIndex={-1} className="sr-main">
        <ErrorBoundary resetKey={location.pathname}>
          <div key={location.pathname} className="sr-page-enter">
            <Outlet />
          </div>
        </ErrorBoundary>
      </main>

      <nav className="sr-safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-edge/10 bg-ink-950/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-stretch justify-around px-1">
          {NAV.map((item) => {
            const active = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={`sr-no-tap flex flex-1 flex-col items-center gap-1 py-1.5 text-micro font-medium transition ${
                  active ? "text-brand" : "text-muted"
                }`}
              >
                <span className={`grid h-7 w-11 place-items-center rounded-full transition ${
                  active ? "bg-brand/12" : "bg-transparent"
                }`}>
                  <item.icon
                    className="h-[18px] w-[18px]"
                    strokeWidth={active ? 2.2 : 1.7}
                    fill={item.icon === Star && active ? "currentColor" : "none"}
                  />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
