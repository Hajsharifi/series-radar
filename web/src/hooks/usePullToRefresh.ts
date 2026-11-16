import { useEffect, useRef, useCallback } from "react";

type PullState = false | true | "ready";

export function usePullToRefresh(
  onRefresh: () => Promise<void> | void,
  options: { threshold?: number; maxPull?: number } = {}
) {
  const { threshold = 80, maxPull = 120 } = options;
  const startY = useRef<number | null>(null);
  const pulling = useRef<PullState>(false);
  const refreshing = useRef(false);
  const elementRef = useRef<HTMLElement | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (refreshing.current) return;
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    if (scrollTop === 0) {
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!pulling.current || refreshing.current || startY.current === null) return;
    const deltaY = e.touches[0].clientY - startY.current;
    if (deltaY > 0) {
      e.preventDefault();
      const pull = Math.min(deltaY * 0.5, maxPull);
      if (elementRef.current) {
        elementRef.current.style.transform = `translateY(${pull}px)`;
        elementRef.current.style.transition = "none";
      }
      if (pull >= threshold) {
        pulling.current = "ready";
      }
    }
  }, [threshold, maxPull]);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current || refreshing.current) return;
    const wasReady = pulling.current === "ready";
    pulling.current = false;
    startY.current = null;

    if (elementRef.current) {
      elementRef.current.style.transition = "transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)";
      elementRef.current.style.transform = "translateY(0)";
    }

    if (wasReady) {
      refreshing.current = true;
      try {
        await onRefresh();
      } finally {
        refreshing.current = false;
      }
    }
  }, [onRefresh]);

  useEffect(() => {
    const el = document.documentElement;
    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { elementRef, isRefreshing: refreshing.current };
}