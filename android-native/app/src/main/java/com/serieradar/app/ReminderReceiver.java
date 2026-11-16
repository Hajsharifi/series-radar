package com.serieradar.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class ReminderReceiver extends BroadcastReceiver {

    static final String CHANNEL_ID = "series_premieres";
    static final String CHANNEL_NAME = "یادآوری‌های زیر رادار";

    @Override
    public void onReceive(Context context, Intent intent) {
        int requestCode = intent.getIntExtra("showId", 0);
        String kind = intent.getStringExtra("kind");
        String route = intent.getStringExtra("route");
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        boolean movie = "movie".equals(kind) || "movie_track".equals(kind);
        if (title == null || title.isEmpty()) title = movie ? "یادآوری انتشار فیلم" : "یادآوری پخش";
        if (body == null || body.isEmpty()) {
            body = movie
                    ? "فیلم ستاره‌دار شما به‌زودی برای تماشای خانگی منتشر می‌شود."
                    : "سریال ستاره‌دار شما به‌زودی پخش می‌شود.";
        }
        if (route == null || route.isEmpty()) {
            route = movie ? "/movies" : (requestCode > 0 ? "/show/" + requestCode : "/");
        }

        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("یادآوری ۲۴ ساعت قبل از پخش یا انتشار، ساعت ۹ صبح به وقت تهران");
            channel.enableVibration(true);
            manager.createNotificationChannel(channel);
        }

        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        open.putExtra("route", route);
        PendingIntent contentIntent = PendingIntent.getActivity(
                context,
                requestCode > 0 ? requestCode : 1,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

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

        manager.notify(requestCode > 0 ? requestCode : 1, builder.build());
    }
}
