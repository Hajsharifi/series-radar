import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchDownloads, type DownloadPayload } from "../lib/downloads";

export interface DownloadsState {
  items: Record<string, DownloadPayload>;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => void;
}

/** Loads a batch of stable keys. A source/network failure is visible, but
 * never interpreted as "there is no download link". */
export function useDownloads(keys: string[], enabled = true): DownloadsState {
  const signature = useMemo(() => Array.from(new Set(keys.filter(Boolean))).join(","), [keys]);
  const [items, setItems] = useState<Record<string, DownloadPayload>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(0);

  const load = useCallback(
    async (manual: boolean) => {
      if (!enabled || !signature) {
        setItems({});
        setLoading(false);
        setError(null);
        return;
      }
      const id = ++active.current;
      if (manual) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const next = await fetchDownloads(signature.split(","), manual);
        if (id !== active.current) return;
        setItems(next);
      } catch {
        if (id === active.current) setError("بررسی منبع دانلود ممکن نشد.");
      } finally {
        if (id === active.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [enabled, signature],
  );

  useEffect(() => {
    void load(false);
    return () => {
      active.current += 1;
    };
  }, [load]);

  const refresh = useCallback(() => void load(true), [load]);
  return { items, loading, refreshing, error, refresh };
}
