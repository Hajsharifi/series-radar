import { StrictMode, Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./App.css";

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
    // Keep the most recent 20 entries only.
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(logs.slice(-20)));
  } catch {
    /* never let logging break the UI */
  }
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App crashed", error, info);
    logError(error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "sans-serif", direction: "rtl" }}>
          <h1>خطا در بارگذاری اپ</h1>
          <pre style={{ whiteSpace: "pre-wrap", direction: "ltr", textAlign: "left" }}>{this.state.error.message}</pre>
          <button
            onClick={() => {
              try { localStorage.removeItem(ERROR_LOG_KEY); } catch { /* ignore */ }
              window.location.reload();
            }}
            style={{ marginTop: 16, padding: "8px 16px", borderRadius: 8, background: "#fbbf24", color: "#0c0a04", border: "none", fontWeight: 700 }}
          >
            پاک کردن لاگ و تلاش مجدد
          </button>
          <p style={{ marginTop: 12, fontSize: 12, color: "#888" }}>
            خطا بهصورت محلی ذخیره شد تا توسعهدهنده بتواند آنرا بررسی کند.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
