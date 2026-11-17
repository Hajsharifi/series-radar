package com.serieradar.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Checks the movie lists in the background and reports only the transitions
 * that the app could not schedule an exact alarm for (unknown digital dates
 * and theatrical releases). */
public class WatchlistReceiver extends BroadcastReceiver {

    private static final String API = "http://31.56.229.237:8090";
    private static final String CHANNEL_ID = "movie_releases";
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !WatchlistScheduler.ACTION.equals(intent.getAction())) return;
        final PendingResult result = goAsync();
        final Context app = context.getApplicationContext();
        EXECUTOR.execute(() -> {
            try {
                check(app);
            } catch (Exception ignored) {
                /* a failed check must never disturb the user */
            } finally {
                result.finish();
            }
        });
    }

    private static void check(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(
                WatchlistScheduler.PREFS, Context.MODE_PRIVATE);
        // Record the attempt before fetching so Settings can show an honest
        // "last check" even when the network is unavailable.
        prefs.edit()
                .putLong(WatchlistScheduler.KEY_LAST_CHECK, System.currentTimeMillis())
                .putBoolean(WatchlistScheduler.KEY_LAST_OK, false)
                .apply();

        String qualityJson = fetch(API + "/api/movies/quality");
        String upcomingJson = fetch(API + "/api/movies/upcoming");
        if (qualityJson == null && upcomingJson == null) return;

        String today = tehranDay("yyyy-MM-dd");
        String archiveFrom = shiftDay(today, -90);
        Map<Integer, String> stages = new HashMap<>();
        collect(qualityJson, stages, today, archiveFrom);
        collect(upcomingJson, stages, today, archiveFrom);
        if (stages.isEmpty()) return;

        JSONArray items;
        JSONObject oldStages;
        try {
            items = new JSONArray(prefs.getString(WatchlistScheduler.KEY_ITEMS, "[]"));
            oldStages = new JSONObject(prefs.getString(WatchlistScheduler.KEY_STAGES, "{}"));
        } catch (Exception e) {
            return;
        }

        JSONObject newStages = new JSONObject();
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null) continue;
            int id = item.optInt("id", 0);
            if (id <= 0) continue;
            String key = String.valueOf(id);
            String prev = oldStages.optString(key, "unknown");
            String next = stages.containsKey(id) ? stages.get(id) : prev;
            String title = item.optString("title", "فیلم");
            String storedDigital = item.optString("digitalDate", "");

            if ("available".equals(next) && !"available".equals(prev) && storedDigital.isEmpty()) {
                notifyMovie(context, id, "نسخهٔ دیجیتال «" + title + "» منتشر شد",
                        "کیفیت خوبش در دسترس است؛ از فهرست انتظار خارج میشود.");
            } else if ("upcoming".equals(prev) && "quality".equals(next)) {
                notifyMovie(context, id, "«" + title + "» اکران شد",
                        "از حالا منتظر نسخهٔ دیجیتال باکیفیتش هستیم.");
            }
            try {
                newStages.put(key, next);
            } catch (Exception ignored) {
                /* keep the previous stage for this id */
            }
        }
        prefs.edit()
                .putString(WatchlistScheduler.KEY_ITEMS, items.toString())
                .putString(WatchlistScheduler.KEY_STAGES, newStages.toString())
                .putBoolean(WatchlistScheduler.KEY_LAST_OK, true)
                .apply();
    }

    private static void collect(String json, Map<Integer, String> out, String today, String archiveFrom) {
        if (json == null) return;
        try {
            JSONObject payload = new JSONObject(json);
            JSONArray items = payload.optJSONArray("items");
            if (items == null) return;
            for (int i = 0; i < items.length(); i++) {
                JSONObject movie = items.optJSONObject(i);
                if (movie == null) continue;
                int id = movie.optInt("id", 0);
                if (id > 0) out.put(id, stageOf(movie, today, archiveFrom));
            }
        } catch (Exception ignored) {
            /* malformed response: other endpoint may still be usable */
        }
    }

    private static String stageOf(JSONObject movie, String today, String archiveFrom) {
        String digital = day(movie.optString("digitalDate"));
        String theatrical = day(movie.optString("theatricalDate"));
        if (theatrical.isEmpty()) theatrical = day(movie.optString("releaseDate"));
        if ((!digital.isEmpty() && digital.compareTo(today) <= 0)
                || movie.optBoolean("availableNow", false)) return "available";
        // A future digital date is "quality" even when no cinema date is known.
        if (theatrical.isEmpty()) return digital.isEmpty() ? "unknown" : "quality";
        if (theatrical.compareTo(today) > 0) return "upcoming";
        if (digital.isEmpty() && theatrical.compareTo(archiveFrom) <= 0) return "expired";
        return "quality";
    }

    private static String day(String value) {
        if (value == null) return "";
        String text = value.trim();
        return text.length() >= 10 ? text.substring(0, 10) : text;
    }

    private static String tehranDay(String pattern) {
        SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("Asia/Tehran"));
        return format.format(new Date());
    }

    private static String shiftDay(String iso, int days) {
        try {
            SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            format.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date date = format.parse(iso);
            if (date == null) return iso;
            date.setTime(date.getTime() + days * 86_400_000L);
            return format.format(date);
        } catch (Exception e) {
            return iso;
        }
    }

    private static String fetch(String urlText) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(urlText).openConnection();
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(15000);
            connection.setRequestMethod("GET");
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) return null;
            BufferedReader reader = new BufferedReader(
                    new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8));
            StringBuilder body = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) body.append(line);
            reader.close();
            return body.toString();
        } catch (Exception e) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static void notifyMovie(Context context, int id, String title, String body) {
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "یادآوری انتشار فیلم", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("اطلاعیهٔ انتشار کیفیت خوب فیلمهای ستارهدار");
            channel.enableVibration(true);
            manager.createNotificationChannel(channel);
        }
        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        open.putExtra("route", "/movie/" + id);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentIntent = PendingIntent.getActivity(context, 500000 + id, open, flags);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(context, CHANNEL_ID)
                : new Notification.Builder(context);
        builder.setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setColor(0xFFF5B301)
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_REMINDER)
                .setPriority(Notification.PRIORITY_HIGH)
                .setContentIntent(contentIntent);
        manager.notify(500000 + id, builder.build());
    }
}
