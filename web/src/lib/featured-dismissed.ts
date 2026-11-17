const STORAGE_KEY = "sr:featured-dismissed:v1";
const MAX_ITEMS = 200;

function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function write(items: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-MAX_ITEMS)));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("sr-featured-dismissed-changed"));
}

export function getDismissedFeatured(): Set<string> {
  return new Set(read());
}

export function dismissFeatured(key: string): void {
  const items = read().filter((item) => item !== key);
  items.push(key);
  write(items);
}

export function subscribeDismissedFeatured(listener: () => void): () => void {
  window.addEventListener("sr-featured-dismissed-changed", listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener("sr-featured-dismissed-changed", listener);
    window.removeEventListener("storage", listener);
  };
}
