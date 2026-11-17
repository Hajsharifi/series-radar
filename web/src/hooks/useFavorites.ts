import { useCallback, useEffect, useState } from "react";
import {
  addFavorite,
  getFavorites,
  isFavorite,
  removeFavorite,
  setReminderEnabled as persistReminder,
  setReminderLead as persistLead,
  subscribeFavorites,
  toggleFavorite as persistToggle,
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

  const ids = new Set(items.map((item) => item.showId));

  const toggle = useCallback((showId: number) => {
    const enabled = !isFavorite(showId);
    persistToggle(showId, enabled);
    if (enabled) requestNotificationPermission();
    setItems(getFavorites());
    return enabled;
  }, []);

  const add = useCallback((showId: number) => {
    addFavorite(showId);
    requestNotificationPermission();
    setItems(getFavorites());
  }, []);

  const remove = useCallback((showId: number) => {
    removeFavorite(showId);
    setItems(getFavorites());
  }, []);

  const setReminder = useCallback((showId: number, enabled: boolean) => {
    persistReminder(showId, enabled);
    setItems(getFavorites());
  }, []);

  const setLead = useCallback((showId: number, hours: number) => {
    persistLead(showId, hours);
    setItems(getFavorites());
  }, []);

  return { items, ids, ready, toggle, add, remove, setReminder, setLead, isFavorite: (id: number) => ids.has(id) };
}