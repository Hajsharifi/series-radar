package com.serieradar.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;

public class MainActivity extends Activity {

    private static final int NOTIFICATION_PERMISSION_REQUEST = 42;
    private static final String PREFS_NAME = "serieradar_prefs";
    private static final String KEY_PERMISSIONS_UPFRONT = "permissions_requested_upfront";

    private WebView webView;
    private String pendingRoute = null;
    private boolean pageLoaded = false;

    // In-app APK update state.
    private BroadcastReceiver downloadReceiver;
    private long pendingDownloadId = -1L;
    private File pendingApk;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        int background = Color.parseColor("#070B16");
        getWindow().setStatusBarColor(background);
        getWindow().setNavigationBarColor(background);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getWindow().getDecorView().setSystemUiVisibility(0);
        }

        pendingRoute = routeFrom(getIntent());

        webView = new WebView(this);
        webView.setBackgroundColor(background);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setTextZoom(100);

        // ES modules (Vite) require CORS/file access for local assets.
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);

        webView.addJavascriptInterface(new ReminderBridge(), "AndroidReminders");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                pageLoaded = true;
                openPendingRoute();
            }
        });
        webView.setWebChromeClient(new WebChromeClient());

        webView.loadUrl("file:///android_asset/web/index.html");

        // Request required permissions upfront once, on first launch.
        requestUpfrontPermissions();
    }

    /** One-time upfront permission request: notifications + exact alarms. */
    private void requestUpfrontPermissions() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        if (prefs.getBoolean(KEY_PERMISSIONS_UPFRONT, false)) return;
        prefs.edit().putBoolean(KEY_PERMISSIONS_UPFRONT, true).apply();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(
                        new String[]{Manifest.permission.POST_NOTIFICATIONS},
                        NOTIFICATION_PERMISSION_REQUEST);
            }
        }
        openExactAlarmSettingsInternal();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == NOTIFICATION_PERMISSION_REQUEST) {
            openExactAlarmSettingsInternal();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String route = routeFrom(intent);
        if (route != null && !route.isEmpty()) {
            pendingRoute = route;
            openPendingRoute();
        }
    }

    /** Notification payloads carry an in-app hash route; older ones only a show id. */
    private String routeFrom(Intent intent) {
        if (intent == null) return null;
        String route = intent.getStringExtra("route");
        if (route != null && !route.isEmpty()) return route;
        int showId = intent.getIntExtra("showId", 0);
        return showId > 0 ? "/show/" + showId : null;
    }

    private void openPendingRoute() {
        if (!pageLoaded || pendingRoute == null || pendingRoute.isEmpty() || webView == null) return;
        String route = pendingRoute;
        pendingRoute = null;
        String safe = route.replace("\\", "").replace("'", "");
        webView.evaluateJavascript("window.location.hash = '#" + safe + "';", null);
    }

    private void requestNotificationPermissionInternal() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) {
            return;
        }
        runOnUiThread(() -> requestPermissions(
                new String[]{Manifest.permission.POST_NOTIFICATIONS},
                NOTIFICATION_PERMISSION_REQUEST));
    }

    private void openExactAlarmSettingsInternal() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return;
        AlarmManager manager = (AlarmManager) getSystemService(ALARM_SERVICE);
        if (manager == null || manager.canScheduleExactAlarms()) return;
        runOnUiThread(() -> {
            try {
                Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                intent.putExtra("android.provider.extra.PACKAGE_NAME", getPackageName());
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            } catch (Exception ignored) {
                /* some ROMs hide this screen */
            }
        });
    }

    /** Opens external links (trailer, GitHub) in the proper external app. */
    private void openExternalLink(String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception ignored) {
            /* no browser installed */
        }
    }

    private void setBarsColor(String color) {
        try {
            int parsed = Color.parseColor(color);
            getWindow().setStatusBarColor(parsed);
            getWindow().setNavigationBarColor(parsed);
        } catch (Exception ignored) {
            /* keep current colors */
        }
    }

    /** Downloads the GitHub release APK via DownloadManager, then opens the installer. */
    private void downloadApk(String url, String version) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getPackageManager().canRequestPackageInstalls()) {
            try {
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                intent.setData(Uri.parse("package:" + getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            } catch (Exception ignored) {
                openExternalLink(url);
            }
            return;
        }
        try {
            File dir = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "updates");
            if (!dir.exists() && !dir.mkdirs()) return;
            File target = new File(dir, "series-radar-" + version + ".apk");
            if (target.exists() && !target.delete()) return;
            pendingApk = target;

            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setTitle("Series Radar " + version);
            request.setDescription("در حال دانلود بستهٔ به‌روزرسانی…");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationUri(Uri.fromFile(target));

            DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) return;
            pendingDownloadId = manager.enqueue(request);

            if (downloadReceiver != null) {
                try { unregisterReceiver(downloadReceiver); } catch (Exception ignored) { }
            }
            downloadReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    if (pendingDownloadId < 0 || pendingApk == null) return;
                    long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
                    if (id != pendingDownloadId) return;
                    try {
                        Uri uri;
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                            uri = FileProvider.getUriForFile(
                                    getApplicationContext(),
                                    "com.serieradar.app.fileprovider",
                                    pendingApk);
                        } else {
                            uri = Uri.fromFile(pendingApk);
                        }
                        Intent install = new Intent(Intent.ACTION_VIEW);
                        install.setDataAndType(uri, "application/vnd.android.package-archive");
                        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(install);
                    } catch (Exception ignored) {
                        openExternalLink(url);
                    }
                }
            };
            registerReceiver(downloadReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
        } catch (Exception ignored) {
            openExternalLink(url);
        }
    }

    @Override
    protected void onDestroy() {
        if (downloadReceiver != null) {
            try { unregisterReceiver(downloadReceiver); } catch (Exception ignored) { }
        }
        super.onDestroy();
    }

    private class ReminderBridge {
        @JavascriptInterface
        public void sync(String payload) {
            ReminderScheduler.sync(getApplicationContext(), payload);
        }

        @JavascriptInterface
        public void syncMovieWatchlist(String payload) {
            WatchlistScheduler.sync(getApplicationContext(), payload);
        }

        @JavascriptInterface
        public String backgroundCheckStatus() {
            return WatchlistScheduler.statusJson(getApplicationContext());
        }

        @JavascriptInterface
        public void checkMovieWatchlistNow() {
            WatchlistScheduler.triggerNow(getApplicationContext());
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            requestNotificationPermissionInternal();
        }

        @JavascriptInterface
        public void openExactAlarmSettings() {
            runOnUiThread(() -> {
                boolean opened = false;
                // Primary: dedicated exact-alarm permission screen (Android 12+).
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    try {
                        Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                        intent.putExtra("android.provider.extra.PACKAGE_NAME", getPackageName());
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                        opened = true;
                    } catch (Exception ignored) {
                        /* some ROMs hide this screen - try fallbacks */
                    }
                }
                // Fallback 1: app notification settings (works on all Android 8+).
                if (!opened && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    try {
                        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                        intent.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                        opened = true;
                    } catch (Exception ignored) {
                        /* keep trying */
                    }
                }
                // Fallback 2: generic app details screen.
                if (!opened) {
                    try {
                        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                        intent.setData(Uri.parse("package:" + getPackageName()));
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                    } catch (Exception ignored) {
                        /* nothing else we can do */
                    }
                }
            });
        }

        @JavascriptInterface
        public void openExternal(String url) {
            runOnUiThread(() -> openExternalLink(url));
        }

        @JavascriptInterface
        public void setSystemBarsColor(String color) {
            runOnUiThread(() -> setBarsColor(color));
        }

        @JavascriptInterface
        public void downloadAndInstall(String url, String version) {
            runOnUiThread(() -> downloadApk(url, version));
        }

        @JavascriptInterface
        public void updateWidgetData(String json) {
            try {
                JSONArray items = new JSONArray(json);
                WidgetProvider.saveWidgetData(getApplicationContext(), items);
            } catch (Exception e) {
                // ignore
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
