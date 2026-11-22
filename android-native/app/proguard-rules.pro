# Keep the JS bridge and its methods (called by name from WebView).
-keepclassmembers class com.serieradar.app.MainActivity$ReminderBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.serieradar.app.MainActivity { *; }
-keep class com.serieradar.app.ReminderScheduler { *; }
-keep class com.serieradar.app.WatchlistScheduler { *; }
-keep class com.serieradar.app.DownloadsScheduler { *; }
-keep class com.serieradar.app.WidgetProvider { *; }
# Keep AndroidX WebKit classes used via reflection/asset loader.
-keep class androidx.webkit.** { *; }
# Keep data classes serialized to JSON.
-keep class org.json.** { *; }