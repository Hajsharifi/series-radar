import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { discoverUpcomingShows, getShowDetails } from "./tmdb";

initializeApp();
const db = getFirestore();

function tehranHour(): number {
  return Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    hour12: false,
  }).format(new Date()));
}

function daysUntil(value?: string | null): number | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  const target = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

async function writeShows(shows: Awaited<ReturnType<typeof discoverUpcomingShows>>) {
  const batch = db.batch();
  for (const show of shows) {
    batch.set(db.collection("shows").doc(String(show.id)), show, { merge: true });
  }
  await batch.commit();
}

export const syncUpcomingShows = onSchedule(
  { schedule: "0 */6 * * *", timeZone: "Asia/Tehran" },
  async () => {
    logger.info("Starting TMDB sync");
    const shows = await discoverUpcomingShows(2);
    await writeShows(shows);
    logger.info(`Synced ${shows.length} shows`);
  },
);

export const syncFavoriteShows = onSchedule(
  { schedule: "30 */6 * * *", timeZone: "Asia/Tehran" },
  async () => {
    const favorites = await db.collectionGroup("favorites").get();
    const showIds = new Set<number>();
    favorites.docs.forEach((doc) => {
      const showId = Number(doc.data().showId ?? doc.id);
      if (Number.isFinite(showId)) showIds.add(showId);
    });

    const shows = [];
    for (const showId of showIds) {
      try {
        shows.push(await getShowDetails(showId));
      } catch (error) {
        logger.error(`Failed to sync favorite show ${showId}`, error);
      }
    }
    await writeShows(shows);
    logger.info(`Synced ${shows.length} favorite shows`);
  },
);

export const sendReminderNotifications = onSchedule(
  { schedule: "0 * * * *", timeZone: "Asia/Tehran" },
  async () => {
    if (tehranHour() !== 9) return;

    const shows = await db.collection("shows").get();
    const upcoming = shows.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }) as { id: string; nextSeasonAirDate?: string | null; nextEpisodeAirDate?: string | null; title?: string; nextSeasonNumber?: number | null })
      .filter((show) => {
        const date = show.nextSeasonAirDate ?? show.nextEpisodeAirDate;
        return daysUntil(date) === 1;
      });

    if (upcoming.length === 0) return;

    const favorites = await db.collectionGroup("favorites").get();
    const messaging = getMessaging();

    for (const show of upcoming) {
      const showId = Number(show.id);
      const date = show.nextSeasonAirDate ?? show.nextEpisodeAirDate;
      const seasonNumber = show.nextSeasonNumber ?? 0;
      const deliveryId = `${showId}_${seasonNumber}`;

      const interested = favorites.docs.filter((doc) => {
        const data = doc.data();
        return Number(data.showId ?? doc.id) === showId && data.enabled === true && data.reminderEnabled === true;
      });

      for (const favorite of interested) {
        const userId = favorite.ref.parent.parent?.id;
        if (!userId) continue;

        const deliveryRef = db.doc(`notificationDeliveries/${userId}_${deliveryId}`);
        const delivery = await deliveryRef.get();
        if (delivery.exists) continue;

        const devices = await db.collection(`users/${userId}/devices`).get();
        const tokens = devices.docs.map((doc) => doc.data().fcmToken).filter(Boolean);
        if (tokens.length === 0) continue;

        await messaging.sendEachForMulticast({
          tokens,
          notification: {
            title: `${show.title ?? "سریال"} — فصل جدید`,
            body: `پخش فصل جدید فردا شروع می‌شود.`,
          },
          data: {
            showId: String(showId),
            url: `/show/${showId}`,
          },
        });

        await deliveryRef.set({
          scheduledFor: date,
          sentAt: FieldValue.serverTimestamp(),
          state: "sent",
        });
      }
    }
  },
);
