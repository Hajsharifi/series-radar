import { useLocation, useNavigate } from "react-router-dom";

export interface BackTarget {
  to: string;
  label: string;
}

/** Where to go when a screen was opened directly (notification, saved link)
 * and there is no previous in-app page to return to. */
const FALLBACKS: Array<[RegExp, BackTarget]> = [
  [/^\/movie\//, { to: "/movies", label: "بازگشت به فیلمها" }],
  [/^\/(show|tv|series)\//, { to: "/", label: "بازگشت به رادار" }],
  [/^\/movie-history$/, { to: "/favorites", label: "بازگشت به ستارهها" }],
  [/^\/settings$/, { to: "/", label: "بازگشت به رادار" }],
  [/^\/search$/, { to: "/", label: "بازگشت به رادار" }],
  [/^\/calendar$/, { to: "/", label: "بازگشت به رادار" }],
  [/^\/boxoffice$/, { to: "/", label: "بازگشت به رادار" }],
  [/^\/favorites$/, { to: "/", label: "بازگشت به رادار" }],
  [/^\/movies$/, { to: "/", label: "بازگشت به رادار" }],
];

export function backTargetFor(pathname: string): BackTarget {
  for (const [pattern, target] of FALLBACKS) {
    if (pattern.test(pathname)) return target;
  }
  return { to: "/", label: "بازگشت به رادار" };
}

/** True only when an earlier in-app entry exists. HashRouter uses the special
 * key "default" for the first entry; history.state.idx guards the home screen
 * after coming back from another tab. */
export function hasInAppHistory(location: { key: string }): boolean {
  if (location.key === "default" || typeof window === "undefined") return false;
  const state = window.history.state as { idx?: number } | null;
  return (state?.idx ?? 0) > 0;
}

interface BackButtonProps {
  /** Icon-only variant for the sticky app header. */
  compact?: boolean;
  /** Overrides the visible text; the actual destination is still history first. */
  label?: string;
  className?: string;
}

/** In-app equivalent of the phone's back button. Uses real history when there
 * is one, and a sensible parent page for direct/deep-linked starts. */
export function BackButton({ compact = false, label, className = "" }: BackButtonProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const hasHistory = hasInAppHistory(location);
  const target = backTargetFor(location.pathname);
  // When we can really go back, the destination may be any previous tab, so
  // keep the label honest. The specific fallback text is only used when there
  // is no history and we know exactly where we are sending the user.
  const text = label ?? (hasHistory ? "بازگشت" : target.label);

  function goBack() {
    if (hasHistory) {
      navigate(-1);
    } else {
      navigate(target.to, { replace: true });
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={goBack}
        aria-label="بازگشت به صفحهٔ قبل"
        title={text}
        className={`sr-no-tap grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-base text-ink-200 active:bg-white/10 ${className}`}
      >
        <span aria-hidden="true">→</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={text}
      className={`sr-no-tap inline-flex items-center gap-1 rounded-lg py-1 text-xs font-medium text-ink-300 active:bg-white/5 ${className}`}
    >
      <span aria-hidden="true">→</span>
      <span>{text}</span>
    </button>
  );
}
