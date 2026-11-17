package com.serieradar.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class WidgetProvider extends AppWidgetProvider {

    private static final String PREFS = "sr_widget_data";
    private static final String KEY_ITEMS = "items_json";
    private static final String KEY_UPDATED = "updated_at";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int widgetId : appWidgetIds) {
            updateWidget(context, widgetId);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if ("com.serieradar.app.WIDGET_UPDATE".equals(intent.getAction())) {
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            int[] ids = manager.getAppWidgetIds(new android.content.ComponentName(context, WidgetProvider.class));
            for (int id : ids) {
                updateWidget(context, id);
            }
        }
    }

    public static void updateWidget(Context context, int widgetId) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_layout);

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String json = prefs.getString(KEY_ITEMS, "[]");
        long updatedAt = prefs.getLong(KEY_UPDATED, 0);

        try {
            JSONArray items = new JSONArray(json);
            if (items.length() == 0) {
                views.setViewVisibility(R.id.widget_empty, android.view.View.VISIBLE);
                views.setViewVisibility(R.id.widget_list, android.view.View.GONE);
            } else {
                views.setViewVisibility(R.id.widget_empty, android.view.View.GONE);
                views.setViewVisibility(R.id.widget_list, android.view.View.VISIBLE);
                views.removeAllViews(R.id.widget_list);

                int count = Math.min(items.length(), 3);
                for (int i = 0; i < count; i++) {
                    JSONObject item = items.getJSONObject(i);
                    RemoteViews itemView = new RemoteViews(context.getPackageName(), R.layout.widget_item);

                    String title = item.optString("title", "—");
                    String subtitle = item.optString("subtitle", "—");
                    String type = item.optString("type", "movie");
                    String posterUrl = item.optString("posterUrl", null);

                    itemView.setTextViewText(R.id.widget_item_title, title);
                    itemView.setTextViewText(R.id.widget_item_subtitle, subtitle);
                    itemView.setImageViewResource(R.id.widget_item_type_icon,
                            "series".equals(type) ? R.drawable.ic_tv : R.drawable.ic_movie);

                    // Poster loading would require a service; for now use placeholder
                    // In production, use a RemoteViewsService with ImageView.setImageViewBitmap

                    views.addView(R.id.widget_list, itemView);
                }
            }

            // Update timestamp
            String updatedText = "به‌روزرسانی: " + (updatedAt > 0
                    ? new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(updatedAt))
                    : "—");
            views.setTextViewText(R.id.widget_updated, updatedText);

            // Tapping anywhere in the widget opens the weekly calendar in-app.
            Intent open = new Intent(context, MainActivity.class);
            open.putExtra("route", "/calendar");
            open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pending = PendingIntent.getActivity(
                    context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_root, pending);

        } catch (Exception e) {
            views.setViewVisibility(R.id.widget_empty, android.view.View.VISIBLE);
            views.setTextViewText(R.id.widget_empty, "خطا در بارگذاری");
        }

        manager.updateAppWidget(widgetId, views);
    }

    /** Call this from the main app when data refreshes */
    public static void saveWidgetData(Context context, JSONArray items) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit()
                .putString(KEY_ITEMS, items.toString())
                .putLong(KEY_UPDATED, System.currentTimeMillis())
                .apply();

        // Trigger widget update
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new android.content.ComponentName(context, WidgetProvider.class));
        for (int id : ids) {
            updateWidget(context, id);
        }
    }
}