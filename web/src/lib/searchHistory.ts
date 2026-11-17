import { useState } from "react";

const KEY = "sr:search-history:v1";
const MAX = 8;

export function getSearchHistory(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length >= 2).slice(0, MAX)
      : [];
  } catch {
    return [];
  }
}

export function rememberSearch(text: string): string[] {
  const query = text.trim();
  if (query.length < 2) return getSearchHistory();
  const normalized = query.replace(/\s+/g, " ").toLowerCase();
  const next = getSearchHistory().filter((item) => item.replace(/\s+/g, " ").toLowerCase() !== normalized);
  next.unshift(query);
  const trimmed = next.slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* storage may be full */
  }
  return trimmed;
}

export function clearSearchHistory(): string[] {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return [];
}

export function useSearchHistory(): [string[], (text: string) => void, () => void] {
  const [history, setHistory] = useState<string[]>(getSearchHistory);
  return [
    history,
    (text: string) => setHistory(rememberSearch(text)),
    () => setHistory(clearSearchHistory()),
  ];
}
