package com.serieradar.app;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/** Periodic replacement for polling Film2Media from the WebView. */
public class DownloadsWorker extends Worker {

    public DownloadsWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        try {
            DownloadsReceiver.checkNow(getApplicationContext());
            return Result.success();
        } catch (Exception error) {
            return Result.retry();
        }
    }
}
