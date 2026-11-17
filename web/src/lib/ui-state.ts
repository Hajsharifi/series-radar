/** Small persisted UI state (tabs / filters) so the in-app back button returns
 * to exactly the same view the user left. Kept in sessionStorage: it survives
 * navigation inside the app but is forgotten when the browser/app tab closes. */

const PREFIX = "sr:ui:";

export function readUiState<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed === undefined || parsed === null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

export function writeUiState<T>(key: string, value: T): void {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage may be unavailable; navigation still works */
  }
}
