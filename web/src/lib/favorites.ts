import { getSettings } from "./settings";

const STORAGE_KEY = "sr:favorites:v1";

export interface StoredFavorite {
  showId: number;
  reminderEnabled: boolean;
  reminderLeadHours: number;
  addedAt: string;
}

function read(): StoredFavorite[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredFavorite[];
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.showId === "number") : [];
  } catch {
    return [];
  }
}

function write(items: StoredFavorite[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("sr-favorites-changed"));
}

export function getFavorites(): StoredFavorite[] {
  return read();
}

export function isFavorite(showId: number): boolean {
  return read().some((item) => item.showId === showId);
}

export function addFavorite(showId: number): void {
  const items = read();
  if (items.some((item) => item.showId === showId)) return;
  items.push({
    showId,
    reminderEnabled: true,
    reminderLeadHours: getSettings().defaultLeadHours,
    addedAt: new Date().toISOString(),
  });
  write(items);
}

export function removeFavorite(showId: number): void {
  write(read().filter((item) => item.showId !== showId));
}

export function toggleFavorite(showId: number, enabled: boolean): void {
  if (enabled) addFavorite(showId);
  else removeFavorite(showId);
}

export function setReminderEnabled(showId: number, enabled: boolean): void {
  write(read().map((item) => (item.showId === showId ? { ...item, reminderEnabled: enabled } : item)));
}

export function setReminderLead(showId: number, hours: number): void {
  write(read().map((item) => (item.showId === showId ? { ...item, reminderLeadHours: hours } : item)));
}

export function favoriteIds(): Set<number> {
  return new Set(read().map((item) => item.showId));
}

export function subscribeFavorites(listener: () => void): () => void {
  window.addEventListener("sr-favorites-changed", listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener("sr-favorites-changed", listener);
    window.removeEventListener("storage", listener);
  };
}