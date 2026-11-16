package com.serieradar.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlarmManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;

public class MainActivity extends Activity {

    private static final int NOTIFICATION_PERMISSION_REQUEST = 42;
    private static final String PREFS_NAME = "serieradar_prefs";
    private static final String KEY_PERMISSIONS_UPFRONT = "permissions_requested_upfront";

    private WebView webView;
    private String pendingRoute = null;
    private boolean pageLoaded = false;

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
                startActivity(new Intent(
                        Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                        Uri.parse("package:" + getPackageName())));
            } catch (Exception ignored) {
                /* some ROMs hide this screen */
            }
        });
    }

    private class ReminderBridge {
        @JavascriptInterface
        public void sync(String payload) {
            ReminderScheduler.sync(getApplicationContext(), payload);
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            requestNotificationPermissionInternal();
        }

        @JavascriptInterface
        public void openExactAlarmSettings() {
            openExactAlarmSettingsInternal();
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
