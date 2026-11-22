package com.serieradar.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.ContentValues;
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
import android.provider.MediaStore;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebChromeClient.FileChooserParams;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {

    private static final int NOTIFICATION_PERMISSION_REQUEST = 42;
    private static final String PREFS_NAME = "serieradar_prefs";
    private static final String KEY_PERMISSIONS_UPFRONT = "permissions_requested_upfront";

    private WebView webView;
    private String pendingRoute = null;
    private boolean pageLoaded = false;
    private ValueCallback<Uri[]> fileChooserCallback = null;
    private static final int FILE_CHOOSER_REQUEST = 9001;

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
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setTextZoom(100);

        // Local assets are served through WebViewAssetLoader (no file:// access).
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.addJavascriptInterface(new ReminderBridge(), "AndroidReminders");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("https".equals(scheme) && "appassets.androidplatform.net".equals(uri.getHost())) {
                    return false; // let the asset loader handle it
                }
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    openExternalLink(uri.toString());
                    return true;
                }
                return true; // block everything else
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageLoaded = true;
                openPendingRoute();
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                fileChooserCallback = callback;
                Intent intent = params.createIntent();
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception ignored) {
                    if (fileChooserCallback != null) {
                        fileChooserCallback.onReceiveValue(null);
                        fileChooserCallback = null;
                    }
                    return false;
                }
            }
        });

        webView.loadUrl("https://appassets.androidplatform.net/assets/web/index.html");

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
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && fileChooserCallback != null) {
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getData() != null) {
                    results = new Uri[] { data.getData() };
                } else if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                }
            }
            fileChooserCallback.onReceiveValue(results);
            fileChooserCallback = null;
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
        if (url == null) return;
        Uri uri;
        try {
            uri = Uri.parse(url);
        } catch (Exception ignored) {
            return;
        }
        String scheme = uri.getScheme();
        if (!"http".equals(scheme) && !"https".equals(scheme)) return;
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
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
        // Only allow APK downloads from trusted hosts over HTTPS.
        Uri apkUri;
        try {
            apkUri = Uri.parse(url);
        } catch (Exception ignored) {
            return;
        }
        if (!"https".equals(apkUri.getScheme())) {
            openExternalLink(url);
            return;
        }
        String host = apkUri.getHost();
        boolean trustedHost = host != null && (
                host.equals("github.com") ||
                host.equals("objects.githubusercontent.com") ||
                host.equals("release-assets.githubusercontent.com") ||
                host.equals("radar.hajsharifi.online"));
        if (!trustedHost) {
            openExternalLink(url);
            return;
        }
        if (version == null || !version.matches("[0-9A-Za-z._-]+")) {
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
        public void syncDownloadWatchlist(String payload) {
            DownloadsScheduler.sync(getApplicationContext(), payload);
            // Check right away when the starred list changes, so a newly
            // starred title does not wait up to an hour for its first notice.
            // triggerNow is internally throttled to one run per 30 seconds.
            DownloadsScheduler.triggerNow(getApplicationContext());
        }

        @JavascriptInterface
        public String downloadLinksStatus() {
            return DownloadsScheduler.statusJson(getApplicationContext());
        }

        @JavascriptInterface
        public void checkDownloadLinksNow() {
            DownloadsScheduler.triggerNow(getApplicationContext());
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

        @JavascriptInterface
        public boolean saveCalendarFile(String filename, String content) {
            return saveCalendar(filename, content);
        }

        public boolean saveBackupFile(String filename, String content) {
            return saveFile(filename, content, "application/json", "فایل پشتیبان در Downloads ذخیره شد");
        }
    }

    /** Saves an .ics file where the user can find it without extra permissions. */
    private boolean saveCalendar(String filename, String content) {
        return saveFile(filename, content, "text/calendar", "فایل تقویم در Downloads ذخیره شد");
    }

    /** Generic file saver used by calendar, backup export, etc. */
    private boolean saveFile(String filename, String content, String mime, String toastMessage) {
        try {
            byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                values.put(MediaStore.Downloads.MIME_TYPE, mime);
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) return false;
                try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                    if (out == null) return false;
                    out.write(bytes);
                }
                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                getContentResolver().update(uri, values, null, null);
                runOnUiThread(() -> Toast.makeText(this, toastMessage, Toast.LENGTH_LONG).show());
                return true;
            }
            File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) dir = new File(getFilesDir(), "downloads");
            if (!dir.exists() && !dir.mkdirs()) return false;
            File target = new File(dir, filename);
            try (FileOutputStream out = new FileOutputStream(target)) {
                out.write(bytes);
            }
            final String path = target.getAbsolutePath();
            runOnUiThread(() -> Toast.makeText(this, toastMessage + ": " + path, Toast.LENGTH_LONG).show());
            return true;
        } catch (Exception error) {
            runOnUiThread(() -> Toast.makeText(this, "ذخیرهٔ فایل ممکن نشد", Toast.LENGTH_SHORT).show());
            return false;
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
