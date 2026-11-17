import { useSyncExternalStore } from "react";

/**
 * Network wrapper with an offline snapshot. We intentionally do NOT use a
 * Service Worker: it caused stale-cache bugs inside the WebView previously.
 * Every successful response is stored locally and reused only when the network
 * fails, with a visible "offline" banner and the snapshot timestamp.
 */

const PREFIX = "sr:net:v1:";
const TIMEOUT_MS = 8000;
const MAX_ENTRIES = 60;

export interface NetworkState {
  offline: boolean;
  savedAt?: number;
}

let state: NetworkState = { offline: false };
const listeners = new Set<() => void>();

export function subscribeNetwork(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getNetworkState(): NetworkState {
  return state;
}

export function useNetworkState(): NetworkState {
  return useSyncExternalStore(subscribeNetwork, getNetworkState, getNetworkState);
}

function setState(next: NetworkState) {
  if (state.offline === next.offline && state.savedAt === next.savedAt) return;
  state = next;
  listeners.forEach((listener) => listener());
}

function prune() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    if (keys.length <= MAX_ENTRIES) return;
    const dated = keys
      .map((key) => {
        try {
          return { key, at: JSON.parse(localStorage.getItem(key) || "{}").at || 0 };
        } catch {
          return { key, at: 0 };
        }
      })
      .sort((a, b) => a.at - b.at);
    dated.slice(0, keys.length - MAX_ENTRIES).forEach((item) => localStorage.removeItem(item.key));
  } catch {
    /* ignore storage errors */
  }
}

export async function cachedFetchJson<T>(url: string, timeoutMs = TIMEOUT_MS): Promise<T> {
  const key = PREFIX + url;
  let cached: { at: number; data: T } | null = null;
  try {
    const raw = localStorage.getItem(key);
    if (raw) cached = JSON.parse(raw) as { at: number; data: T };
  } catch {
    cached = null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) {
      const failure = new Error(`HTTP ${response.status}`) as Error & { status?: number };
      failure.status = response.status;
      throw failure;
    }
    const data = (await response.json()) as T;
    try {
      localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
      prune();
    } catch {
      /* storage may be full */
    }
    setState({ offline: false });
    return data;
  } catch (error) {
    if (cached) {
      setState({ offline: true, savedAt: cached.at });
      return cached.data;
    }
    setState({ offline: true });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function retryNetwork() {
  setState({ offline: false });
}

/** Lightweight exponential backoff for non-React-Query calls. */
export async function retryAsync<T>(
  operation: () => Promise<T>,
  attempts = 2,
  baseDelayMs = 700,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)));
      }
    }
  }
  throw lastError;
}
