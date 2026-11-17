import { useSyncExternalStore } from "react";
import { setSystemBarsColor } from "./native";

const KEY = "sr:amoled:v1";

let enabled = false;
const listeners = new Set<() => void>();

function apply() {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-amoled", enabled ? "true" : "false");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", enabled ? "#000000" : "#070b16");
  setSystemBarsColor(enabled ? "#000000" : "#070b16");
}

export function initTheme() {
  try {
    enabled = localStorage.getItem(KEY) === "true";
  } catch {
    enabled = false;
  }
  apply();
}

export function getAmoled() {
  return enabled;
}

export function setAmoled(value: boolean) {
  enabled = value;
  try {
    localStorage.setItem(KEY, String(value));
  } catch {
    /* ignore */
  }
  apply();
  listeners.forEach((listener) => listener());
}

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAmoled() {
  return useSyncExternalStore(subscribeTheme, getAmoled, getAmoled);
}
