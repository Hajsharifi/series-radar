package com.serieradar.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/** Schedules Android alarms for starred premieres (09:00 Tehran, one day before). */
public final class ReminderScheduler {

    private static final String PREFS = "sr_native_reminders";
    private static final String KEY_PAYLOAD = "payload";

    private ReminderScheduler() {}

    public static void sync(Context context, String json) {
        cancelExisting(context);
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_PAYLOAD, json).apply();
        schedule(context, json);
    }

    public static void rescheduleAll(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        schedule(context, prefs.getString(KEY_PAYLOAD, "[]"));
    }

    private static void cancelExisting(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String json = prefs.getString(KEY_PAYLOAD, "[]");
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;
        try {
            JSONArray items = new JSONArray(json);
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item == null) continue;
                int requestCode = requestCode(item.optInt("id", 0), item.optString("kind", "show"));
                if (requestCode <= 0) continue;
                PendingIntent pending = pendingIntent(
                        context, requestCode, null, null, null, null,
                        PendingIntent.FLAG_NO_CREATE);
                if (pending != null) {
                    manager.cancel(pending);
                    pending.cancel();
                }
            }
        } catch (Exception ignored) {
            /* a malformed payload must not crash the app */
        }
    }

    /** Movies, shows, and tracked movies can share numeric ids; keep their alarm slots in separate ranges. */
    private static int requestCode(int id, String kind) {
        if (id <= 0) return 0;
        if ("movie_track".equals(kind)) return id + 3_000_000;
        return "movie".equals(kind) ? id + 2_000_000 : id;
    }

    private static void schedule(Context context, String json) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;
        long now = System.currentTimeMillis();

        try {
            JSONArray items = new JSONArray(json);
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item == null) continue;
                int id = item.optInt("id", 0);
                String kind = item.optString("kind", "show");
                String route = item.optString("route", "");
                long triggerAt = item.optLong("triggerAt", 0L);
                String title = item.optString("title", "");
                String body = item.optString("body", "");
                if (id <= 0 || triggerAt <= now || title.isEmpty()) continue;

                PendingIntent pending = pendingIntent(
                        context, requestCode(id, kind), kind, route, title, body,
                        PendingIntent.FLAG_UPDATE_CURRENT);
                if (pending == null) continue;

                boolean exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S
                        || manager.canScheduleExactAlarms();
                if (exact) {
                    manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending);
                } else {
                    manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending);
                }
            }
        } catch (Exception ignored) {
            /* ignore broken payload */
        }
    }

    private static PendingIntent pendingIntent(
            Context context, int requestCode, String kind, String route,
            String title, String body, int baseFlags) {
        Intent intent = new Intent(context, ReminderReceiver.class);
        intent.setAction("com.serieradar.app.REMINDER");
        intent.putExtra("showId", requestCode);
        if (kind != null) intent.putExtra("kind", kind);
        if (route != null) intent.putExtra("route", route);
        if (title != null) intent.putExtra("title", title);
        if (body != null) intent.putExtra("body", body);
        int flags = baseFlags | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(context, requestCode, intent, flags);
    }
}
