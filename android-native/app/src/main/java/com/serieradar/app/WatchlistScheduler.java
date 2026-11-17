package com.serieradar.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/** Periodic background check for starred movies whose digital date was not
 * known when the app was last open. Exact alarms cover the dated films. */
public final class WatchlistScheduler {

    static final String PREFS = "sr_watchlist";
    static final String KEY_ITEMS = "items";
    static final String KEY_STAGES = "stages";
    static final String ACTION = "com.serieradar.app.WATCHLIST_CHECK";

    private static final int REQUEST_CODE = 91001;

    private WatchlistScheduler() {}

    /** Called by the WebView whenever the starred-movie list changes. */
    public static void sync(Context context, String json) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_ITEMS, json).apply();

        // The page has the freshest stage information while it is open; seed the
        // comparison map so the background job only reports changes that happen
        // while the app is closed (no duplicate "already released" notifications).
        JSONObject stages = new JSONObject();
        try {
            JSONArray items = new JSONArray(json);
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
        arm(context);
    }

    /** Called after boot / app update; only re-arms when there is a watchlist. */
    public static void armIfNeeded(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String items = prefs.getString(KEY_ITEMS, "[]");
        if (items == null || items.isEmpty() || "[]".equals(items)) return;
        arm(context);
    }

    private static void arm(Context context) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;
        Intent intent = new Intent(context, WatchlistReceiver.class);
        intent.setAction(ACTION);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pending = PendingIntent.getBroadcast(context, REQUEST_CODE, intent, flags);
        manager.cancel(pending);
        long first = System.currentTimeMillis() + 15 * 60 * 1000L;
        manager.setInexactRepeating(
                AlarmManager.RTC_WAKEUP, first, 6 * 60 * 60 * 1000L, pending);
    }
}
