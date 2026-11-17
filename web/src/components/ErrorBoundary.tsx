import { Component, type ErrorInfo, type ReactNode } from "react";

const ERROR_LOG_KEY = "sr:error-log:v1";

function logError(error: Error, info: ErrorInfo) {
  try {
    const raw = localStorage.getItem(ERROR_LOG_KEY);
    const logs = raw ? (JSON.parse(raw) as unknown[]) : [];
    logs.push({
      message: error.message,
      stack: (error.stack || "").slice(0, 800),
      component: info.componentStack?.slice(0, 400) ?? "",
      at: new Date().toISOString(),
    });
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(logs.slice(-20)));
  } catch {
    /* never let logging break the UI */
  }
}

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Change this on navigation so a crashed page recovers by itself. */
  resetKey?: string;
  /** Compact fallback for an inline section. */
  compact?: boolean;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Series Radar render error", error, info);
    logError(error, info);
  }

  componentDidUpdate(previous: ErrorBoundaryProps) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        role="alert"
        className={`rounded-2xl border border-rose-400/25 bg-rose-500/8 text-center ${
          this.props.compact ? "px-4 py-8" : "px-4 py-12"
        }`}
      >
        <p className="text-sm font-bold text-white">این بخش بارگذاری نشد</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-ink-300">
          خطا به‌صورت محلی ثبت شد. می‌توانی همین بخش را دوباره بارگذاری کنی یا به رادار برگردی.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="rounded-lg bg-amber-400 px-3.5 py-2 text-xs font-semibold text-ink-950"
          >
            تلاش دوباره
          </button>
          <a
            href="#/"
            className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 text-xs text-ink-200"
          >
            رفتن به رادار
          </a>
        </div>
      </div>
    );
  }
}
