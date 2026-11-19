package com.serieradar.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
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
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;
import java.util.TimeZone;

/** Checks starred titles for new Film2Media download links.
 *
 * It never notifies on a source/network error, and every link has a stable id,
 * so the same link or episode is reported at most once. */
public final class DownloadsReceiver {

    private static final String API = "https://radar.hajsharifi.online:8443";
    private static final String CHANNEL_ID = "download_links";
    private static final int MAX_NOTIFICATIONS = 5;

    private DownloadsReceiver() {}

    /** Entry point for WorkManager (already on a worker thread). */
    public static void checkNow(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(
                DownloadsScheduler.PREFS, Context.MODE_PRIVATE);
        prefs.edit()
                .putLong(DownloadsScheduler.KEY_LAST_CHECK, System.currentTimeMillis())
                .putBoolean(DownloadsScheduler.KEY_LAST_OK, false)
                .apply();

        String itemsJson = prefs.getString(DownloadsScheduler.KEY_ITEMS, "[]");
        String quietJson = prefs.getString(DownloadsScheduler.KEY_QUIET, "{}");
        JSONArray items;
        JSONObject quietSettings;
        try {
            items = new JSONArray(itemsJson == null ? "[]" : itemsJson);
            quietSettings = new JSONObject(quietJson == null ? "{}" : quietJson);
        } catch (Exception ignored) {
            return;
        }
        if (items.length() == 0) return;

        StringBuilder keys = new StringBuilder();
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null) continue;
            String key = item.optString("key", "");
            if (key.isEmpty()) continue;
            if (keys.length() > 0) keys.append(',');
            keys.append(key);
        }
        if (keys.length() == 0) return;

        String url;
        try {
            url = API + "/api/downloads/match?keys=" + URLEncoder.encode(keys.toString(), "UTF-8");
        } catch (Exception ignored) {
            return;
        }
        String response = fetch(url);
        if (response == null) return;
        JSONArray results;
        try {
            results = new JSONObject(response).optJSONArray("items");
        } catch (Exception ignored) {
            return;
        }
        if (results == null) return;

        JSONObject seen;
        try {
            seen = new JSONObject(prefs.getString(DownloadsScheduler.KEY_SEEN, "{}"));
        } catch (Exception ignored) {
            seen = new JSONObject();
        }
        boolean quiet = isQuiet(quietSettings);
        int notifications = 0;
        int notifiedTotal = prefs.getInt(DownloadsScheduler.KEY_NOTIFIED, 0);

        for (int i = 0; i < results.length(); i++) {
            JSONObject result = results.optJSONObject(i);
            if (result == null) continue;
            String key = result.optString("key", "");
            if (key.isEmpty() || !"found".equals(result.optString("status"))) continue;
            JSONArray ids = collectLinks(result);
            if (ids.length() == 0) continue;
            if (quiet) continue; // leave ids unseen; the next hourly run will report them

            JSONArray old = seen.optJSONArray(key);
            JSONArray fresh = new JSONArray();
            if (old == null) {
                // A title newly added to the watchlist may already have links:
                // one summary notification, then everything is marked seen.
                for (int j = 0; j < ids.length(); j++) fresh.put(ids.optString(j));
            } else {
                for (int j = 0; j < ids.length(); j++) {
                    String id = ids.optString(j);
                    boolean known = false;
                    for (int k = 0; k < old.length(); k++) {
                        if (id.equals(old.optString(k))) {
                            known = true;
                            break;
                        }
                    }
                    if (!known) fresh.put(id);
                }
            }
            if (fresh.length() == 0) continue;
            if (notifications >= MAX_NOTIFICATIONS) continue;

            notify(context, key, titleFor(items, key), fresh.length(), old == null);
            notifiedTotal++;
            notifications++;

            JSONArray merged = old == null ? new JSONArray() : old;
            for (int j = 0; j < fresh.length(); j++) {
                String id = fresh.optString(j);
                boolean exists = false;
                for (int k = 0; k < merged.length(); k++) {
                    if (id.equals(merged.optString(k))) {
                        exists = true;
                        break;
                    }
                }
                if (!exists) merged.put(id);
            }
            try {
                seen.put(key, merged);
            } catch (Exception ignored) {
                /* keep the previous seen state for this key */
            }
        }
        prefs.edit()
                .putString(DownloadsScheduler.KEY_SEEN, seen.toString())
                .putInt(DownloadsScheduler.KEY_NOTIFIED, notifiedTotal)
                .putBoolean(DownloadsScheduler.KEY_LAST_OK, true)
                .apply();
    }

    private static String titleFor(JSONArray items, String key) {
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item != null && key.equals(item.optString("key"))) {
                return item.optString("title", "عنوان");
            }
        }
        return "عنوان";
    }

    /** Walks both payload shapes (movie groups / series seasons). */
    private static JSONArray collectLinks(JSONObject payload) {
        JSONArray out = new JSONArray();
        JSONArray groups = payload.optJSONArray("groups");
        if (groups != null) {
            for (int i = 0; i < groups.length(); i++) {
                JSONObject group = groups.optJSONObject(i);
                if (group == null) continue;
                addLinks(group.optJSONArray("links"), out);
                JSONArray variants = group.optJSONArray("items");
                if (variants != null) {
                    for (int j = 0; j < variants.length(); j++) {
                        JSONObject variant = variants.optJSONObject(j);
                        if (variant != null) addLinks(variant.optJSONArray("links"), out);
                    }
                }
            }
        }
        JSONArray seasons = payload.optJSONArray("seasons");
        if (seasons != null) {
            for (int i = 0; i < seasons.length(); i++) {
                JSONObject season = seasons.optJSONObject(i);
                if (season == null) continue;
                JSONArray seasonGroups = season.optJSONArray("groups");
                if (seasonGroups == null) continue;
                for (int j = 0; j < seasonGroups.length(); j++) {
                    JSONObject group = seasonGroups.optJSONObject(j);
                    if (group == null) continue;
                    JSONArray episodes = group.optJSONArray("episodes");
                    if (episodes == null) continue;
                    for (int k = 0; k < episodes.length(); k++) {
                        JSONObject episode = episodes.optJSONObject(k);
                        if (episode != null) addLinks(episode.optJSONArray("links"), out);
                    }
                }
            }
        }
        return out;
    }

    private static void addLinks(JSONArray links, JSONArray out) {
        if (links == null) return;
        for (int i = 0; i < links.length(); i++) {
            JSONObject link = links.optJSONObject(i);
            if (link == null) continue;
            String id = link.optString("id", "");
            if (id.isEmpty()) continue;
            boolean exists = false;
            for (int j = 0; j < out.length(); j++) {
                if (id.equals(out.optString(j))) {
                    exists = true;
                    break;
                }
            }
            if (!exists) out.put(id);
        }
    }

    private static boolean isQuiet(JSONObject quiet) {
        if (quiet == null || !quiet.optBoolean("enabled", false)) return false;
        int start = minutes(quiet.optString("start", "23:00"));
        int end = minutes(quiet.optString("end", "07:00"));
        if (start < 0 || end < 0 || start == end) return false;
        Calendar calendar = Calendar.getInstance(TimeZone.getTimeZone("Asia/Tehran"));
        int now = calendar.get(Calendar.HOUR_OF_DAY) * 60 + calendar.get(Calendar.MINUTE);
        return start > end ? (now >= start || now < end) : (now >= start && now < end);
    }

    private static int minutes(String clock) {
        String[] parts = clock.split(":");
        if (parts.length != 2) return -1;
        try {
            int hours = Integer.parseInt(parts[0]);
            int mins = Integer.parseInt(parts[1]);
            if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return -1;
            return hours * 60 + mins;
        } catch (Exception ignored) {
            return -1;
        }
    }

    private static String faDigits(int value) {
        char[] source = String.valueOf(value).toCharArray();
        char[] persian = new char[source.length];
        for (int i = 0; i < source.length; i++) {
            persian[i] = (char) ('\u06F0' + (source[i] - '0'));
        }
        return new String(persian);
    }

    private static String fetch(String urlText) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(urlText).openConnection();
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(20000);
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Accept", "application/json");
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) return null;
            BufferedReader reader = new BufferedReader(
                    new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8));
            StringBuilder body = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) body.append(line);
            reader.close();
            return body.toString();
        } catch (Exception ignored) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static void notify(Context context, String key, String title, int count, boolean first) {
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "لینک دانلود", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("اعلان لینک دانلود تازه برای سریالها و فیلمهای ستارهشده");
            manager.createNotificationChannel(channel);
        }
        String digits = faDigits(count);
        String body = first
                ? digits + " لینک دانلود آماده است — همین حالا قابل دریافت است."
                : digits + " لینک یا قسمت تازه منتشر شد.";
        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try {
            open.putExtra("route", "/downloads?focus=" + URLEncoder.encode(key, "UTF-8"));
        } catch (Exception ignored) {
            open.putExtra("route", "/downloads");
        }
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        int id = 700000 + (key.hashCode() & 0x7fffffff) % 100000;
        PendingIntent contentIntent = PendingIntent.getActivity(context, id, open, flags);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(context, CHANNEL_ID)
                : new Notification.Builder(context);
        builder.setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("لینک دانلود «" + title + "»")
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setColor(0xFFF5B301)
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_REMINDER)
                .setPriority(Notification.PRIORITY_HIGH)
                .setContentIntent(contentIntent);
        manager.notify(id, builder.build());
    }
}
