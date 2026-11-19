package com.serieradar.app;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

/** Hourly WorkManager schedule for Film2Media download links. It is separate
 * from the 6-hour movie watchlist so reminders keep their existing cadence. */
public final class DownloadsScheduler {

    static final String PREFS = "sr_downloads";
    static final String KEY_ITEMS = "items";
    static final String KEY_QUIET = "quiet";
    static final String KEY_SEEN = "seen";
    static final String KEY_LAST_CHECK = "lastCheck";
    static final String KEY_LAST_OK = "lastOk";
    static final String KEY_LAST_TRIGGER = "lastTrigger";
    static final String KEY_NOTIFIED = "notified";

    private static final String WORK_NAME = "series_radar_download_links";
    private static final long INTERVAL_HOURS = 1;

    private DownloadsScheduler() {}

    /** Called by the WebView when starred titles or settings change. */
    public static void sync(Context context, String payload) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String items = "[]";
        String quiet = "{}";
        try {
            JSONObject root = new JSONObject(payload);
            items = root.optJSONArray("items").toString();
            quiet = root.optJSONObject("quiet").toString();
        } catch (Exception ignored) {
            try {
                items = new JSONArray(payload).toString();
            } catch (Exception alsoIgnored) {
                items = "[]";
            }
        }
        boolean hasItems = false;
        try {
            hasItems = new JSONArray(items).length() > 0;
        } catch (Exception ignored) {
            /* keep the work disabled */
        }
        prefs.edit()
                .putString(KEY_ITEMS, items)
                .putString(KEY_QUIET, quiet)
                .apply();
        setPeriodic(context, hasItems);
    }

    /** Manual check from Settings, throttled like the movie watchlist. */
    public static void triggerNow(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        if (now - prefs.getLong(KEY_LAST_TRIGGER, 0L) < 30_000L) return;
        prefs.edit().putLong(KEY_LAST_TRIGGER, now).apply();
        try {
            Constraints constraints = new Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build();
            OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(DownloadsWorker.class)
                    .setConstraints(constraints)
                    .build();
            WorkManager.getInstance(context).enqueue(request);
        } catch (Exception ignored) {
            /* background scheduling must never crash the WebView */
        }
    }

    /** Synchronous status for the Settings page. */
    public static String statusJson(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONObject status = new JSONObject();
        try {
            String items = prefs.getString(KEY_ITEMS, "[]");
            if (items == null) items = "[]";
            status.put("lastCheck", prefs.getLong(KEY_LAST_CHECK, 0L));
            status.put("lastOk", prefs.getBoolean(KEY_LAST_OK, false));
            status.put("watched", new JSONArray(items).length());
            status.put("armed", !items.isEmpty() && !"[]".equals(items));
            status.put("notified", prefs.getInt(KEY_NOTIFIED, 0));
            status.put("scheduler", "workmanager");
        } catch (Exception ignored) {
            /* return an empty status rather than breaking the WebView */
        }
        return status.toString();
    }

    /** Safety net after reboot / app update; WorkManager usually persists. */
    public static void armIfNeeded(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String items = prefs.getString(KEY_ITEMS, "[]");
        if (items == null || items.isEmpty() || "[]".equals(items)) return;
        setPeriodic(context, true);
    }

    private static void setPeriodic(Context context, boolean enabled) {
        try {
            WorkManager manager = WorkManager.getInstance(context);
            if (!enabled) {
                manager.cancelUniqueWork(WORK_NAME);
                return;
            }
            Constraints constraints = new Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build();
            PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                    DownloadsWorker.class, INTERVAL_HOURS, TimeUnit.HOURS)
                    .setConstraints(constraints)
                    .setInitialDelay(5, TimeUnit.MINUTES)
                    .build();
            manager.enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request);
        } catch (Exception ignored) {
            /* the app still works in the foreground */
        }
    }
}
