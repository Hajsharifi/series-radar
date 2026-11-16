"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendReminderNotifications = exports.syncFavoriteShows = exports.syncUpcomingShows = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const firebase_functions_1 = require("firebase-functions");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const tmdb_1 = require("./tmdb");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
function tehranHour() {
    return Number(new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Tehran",
        hour: "2-digit",
        hour12: false,
    }).format(new Date()));
}
function daysUntil(value) {
    if (!value)
        return null;
    const [year, month, day] = value.split("-").map(Number);
    const target = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}
async function writeShows(shows) {
    const batch = db.batch();
    for (const show of shows) {
        batch.set(db.collection("shows").doc(String(show.id)), show, { merge: true });
    }
    await batch.commit();
}
exports.syncUpcomingShows = (0, scheduler_1.onSchedule)({ schedule: "0 */6 * * *", timeZone: "Asia/Tehran" }, async () => {
    firebase_functions_1.logger.info("Starting TMDB sync");
    const shows = await (0, tmdb_1.discoverUpcomingShows)(2);
    await writeShows(shows);
    firebase_functions_1.logger.info(`Synced ${shows.length} shows`);
});
exports.syncFavoriteShows = (0, scheduler_1.onSchedule)({ schedule: "30 */6 * * *", timeZone: "Asia/Tehran" }, async () => {
    const favorites = await db.collectionGroup("favorites").get();
    const showIds = new Set();
    favorites.docs.forEach((doc) => {
        const showId = Number(doc.data().showId ?? doc.id);
        if (Number.isFinite(showId))
            showIds.add(showId);
    });
    const shows = [];
    for (const showId of showIds) {
        try {
            shows.push(await (0, tmdb_1.getShowDetails)(showId));
        }
        catch (error) {
            firebase_functions_1.logger.error(`Failed to sync favorite show ${showId}`, error);
        }
    }
    await writeShows(shows);
    firebase_functions_1.logger.info(`Synced ${shows.length} favorite shows`);
});
exports.sendReminderNotifications = (0, scheduler_1.onSchedule)({ schedule: "0 * * * *", timeZone: "Asia/Tehran" }, async () => {
    if (tehranHour() !== 9)
        return;
    const shows = await db.collection("shows").get();
    const upcoming = shows.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((show) => {
        const date = show.nextSeasonAirDate ?? show.nextEpisodeAirDate;
        return daysUntil(date) === 1;
    });
    if (upcoming.length === 0)
        return;
    const favorites = await db.collectionGroup("favorites").get();
    const messaging = (0, messaging_1.getMessaging)();
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
            if (!userId)
                continue;
            const deliveryRef = db.doc(`notificationDeliveries/${userId}_${deliveryId}`);
            const delivery = await deliveryRef.get();
            if (delivery.exists)
                continue;
            const devices = await db.collection(`users/${userId}/devices`).get();
            const tokens = devices.docs.map((doc) => doc.data().fcmToken).filter(Boolean);
            if (tokens.length === 0)
                continue;
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
                sentAt: firestore_1.FieldValue.serverTimestamp(),
                state: "sent",
            });
        }
    }
});
