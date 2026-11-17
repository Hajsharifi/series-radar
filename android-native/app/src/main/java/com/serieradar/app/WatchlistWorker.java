package com.serieradar.app;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/** Reliable periodic replacement for the old AlarmManager background check. */
public class WatchlistWorker extends Worker {

    public WatchlistWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        try {
            WatchlistReceiver.checkNow(getApplicationContext());
            return Result.success();
        } catch (Exception error) {
            return Result.retry();
        }
    }
}
