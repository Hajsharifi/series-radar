import { useEffect, useState } from "react";
import {
  dismissFeatured,
  getDismissedFeatured,
  subscribeDismissedFeatured,
} from "../lib/featured-dismissed";

export function useFeaturedDismissed() {
  const [keys, setKeys] = useState<Set<string>>(() => getDismissedFeatured());

  useEffect(() => {
    const sync = () => setKeys(getDismissedFeatured());
    sync();
    return subscribeDismissedFeatured(sync);
  }, []);

  return {
    keys,
    dismiss: (key: string) => {
      dismissFeatured(key);
      setKeys(getDismissedFeatured());
    },
  };
}
