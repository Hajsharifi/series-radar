import { useCallback, useEffect, useState } from "react";
import {
  addFavorite,
  favoriteKey,
  favoriteSource,
  getFavorites,
  isFavorite,
  removeFavorite,
  setReminderEnabled as persistReminder,
  setReminderLead as persistLead,
  subscribeFavorites,
  toggleFavorite as persistToggle,
  type FavoriteSource,
  type StoredFavorite,
} from "../lib/favorites";
import { requestNotificationPermission } from "../lib/native";

export function useFavorites() {
  const [items, setItems] = useState<StoredFavorite[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setItems(getFavorites());
      setReady(true);
    };
    sync();
    const unsubscribe = subscribeFavorites(sync);
    return unsubscribe;
  }, []);

  const ids = new Set(items.filter((item) => item.source === "tmdb").map((item) => item.showId));
  const keys = new Set(items.map((item) => favoriteKey(item.showId, item.source)));

  const toggle = useCallback((showId: number, source: FavoriteSource = "tmdb", title?: string | Array<string | null | undefined> | null) => {
    const enabled = !isFavorite(showId, source);
    persistToggle(showId, source, enabled, title);
    if (enabled) requestNotificationPermission();
    setItems(getFavorites());
    return enabled;
  }, []);

  const add = useCallback((showId: number, source: FavoriteSource = "tmdb", title?: string | Array<string | null | undefined> | null) => {
    addFavorite(showId, source, title);
    requestNotificationPermission();
    setItems(getFavorites());
  }, []);

  const remove = useCallback((showId: number, source: FavoriteSource = "tmdb") => {
    removeFavorite(showId, source);
    setItems(getFavorites());
  }, []);

  const setReminder = useCallback((showId: number, source: FavoriteSource, enabled: boolean) => {
    persistReminder(showId, source, enabled);
    setItems(getFavorites());
  }, []);

  const setLead = useCallback((showId: number, source: FavoriteSource, hours: number) => {
    persistLead(showId, source, hours);
    setItems(getFavorites());
  }, []);

  const find = useCallback(
    (showId: number, source: FavoriteSource = "tmdb") =>
      items.find((item) => item.showId === showId && item.source === favoriteSource(source)),
    [items],
  );

  return {
    items,
    ids,
    keys,
    ready,
    toggle,
    add,
    remove,
    setReminder,
    setLead,
    find,
    isFavorite: (id: number, source: FavoriteSource = "tmdb") => keys.has(favoriteKey(id, source)),
  };
}
