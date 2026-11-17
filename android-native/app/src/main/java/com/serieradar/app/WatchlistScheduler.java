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

/** Periodic background check for starred movies. WorkManager survives reboots
 * and honors network constraints; exact alarms remain only for user reminders. */
public final class WatchlistScheduler {

    static final String PREFS = "sr_watchlist";
    static final String KEY_ITEMS = "items";
    static final String KEY_STAGES = "stages";
    static final String KEY_LAST_CHECK = "lastCheck";
    static final String KEY_LAST_OK = "lastOk";
    static final String KEY_LAST_TRIGGER = "lastTrigger";
    static final String ACTION = "com.serieradar.app.WATCHLIST_CHECK";

    private static final String WORK_NAME = "series_radar_watchlist";
    private static final long INTERVAL_HOURS = 6;

    private WatchlistScheduler() {}

    /** Called by the WebView whenever the starred-movie list changes. */
    public static void sync(Context context, String json) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_ITEMS, json).apply();

        JSONObject stages = new JSONObject();
        boolean hasItems = false;
        try {
            JSONArray items = new JSONArray(json);
            hasItems = items.length() > 0;
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item == null) continue;
                int id = item.optInt("id", 0);
                if (id <= 0) continue;
                String stage = item.optString("stage", "unknown");
                stages.put(String.valueOf(id), stage.isEmpty() ? "unknown" : stage);
            }
        } catch (Exception ignored) {
            /* keep an empty map */
        }
        prefs.edit().putString(KEY_STAGES, stages.toString()).apply();
        setPeriodic(context, hasItems);
    }

    /** Manual check from Settings. Throttled so repeated taps cannot spam the API. */
    public static void triggerNow(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        if (now - prefs.getLong(KEY_LAST_TRIGGER, 0L) < 30_000L) return;
        prefs.edit().putLong(KEY_LAST_TRIGGER, now).apply();
        try {
            Constraints constraints = new Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build();
            OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(WatchlistWorker.class)
                    .setConstraints(constraints)
                    .build();
            WorkManager.getInstance(context).enqueue(request);
        } catch (Exception ignored) {
            /* background scheduling must never crash the settings screen */
        }
    }

    /** Status read synchronously by the Settings page through the JS bridge. */
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
            status.put("scheduler", "workmanager");
        } catch (Exception ignored) {
            /* return an empty status rather than breaking the WebView */
        }
        return status.toString();
    }

    /** Called after boot / app update. WorkManager persists by itself; this is
     * a cheap safety net for devices that cleared work during an upgrade. */
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
                    WatchlistWorker.class, INTERVAL_HOURS, TimeUnit.HOURS)
                    .setConstraints(constraints)
                    .setInitialDelay(15, TimeUnit.MINUTES)
                    .build();
            manager.enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request);
        } catch (Exception ignored) {
            /* if WorkManager is unavailable, the app still works in the foreground */
        }
    }
}
