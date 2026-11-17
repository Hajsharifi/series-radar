/**
 * Single source of truth for the data API.
 *
 * Production is served by nginx + TLS at radar.hajsharifi.online:8443. The
 * host firewall does not expose 443 to this service yet, so the HTTPS port is
 * explicit. Local previews still talk to the loopback API.
 */
const PRODUCTION_API = "https://radar.hajsharifi.online:8443";
const LOCAL_API = "http://127.0.0.1:8090";

function isLocalHost(): boolean {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) || (isLocalHost() ? LOCAL_API : PRODUCTION_API);

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}
