import { Link } from "react-router-dom";

/** Small reusable entry point to the local "recently released" history. */
export function MovieHistoryPageLink({ className = "" }: { className?: string }) {
  return (
    <Link
      to="/movie-history"
      className={`rounded-lg bg-white/6 px-3 py-1.5 text-xs text-ink-200 ${className}`}
    >
      تاریخچهٔ فیلمها
    </Link>
  );
}
