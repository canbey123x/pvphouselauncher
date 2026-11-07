package net.kdt.pojavlaunch.pvphouse;

import android.os.Handler;
import android.os.Looper;

import androidx.annotation.MainThread;
import androidx.annotation.Nullable;

import net.kdt.pojavlaunch.PojavApplication;

import java.util.ArrayList;
import java.util.List;

/**
 * PvPHouse Launcher: polls the server status every {@link #REFRESH_INTERVAL_MS} while at least one
 * listener is registered (i.e. while the main screen is visible). Pings run on the launcher's
 * background executor; listeners are always called on the main thread.
 */
public final class PvPHouseServerStatus {
    public static final long REFRESH_INTERVAL_MS = 30_000L;

    public interface Listener {
        /** @param result null while the first ping is still running */
        void onServerStatus(@Nullable ServerStatusPinger.Result result);
    }

    private static final Handler sHandler = new Handler(Looper.getMainLooper());
    private static final List<Listener> sListeners = new ArrayList<>();
    @Nullable private static volatile ServerStatusPinger.Result sLastResult;
    private static boolean sPingInFlight = false;

    private static final Runnable sTick = new Runnable() {
        @Override
        public void run() {
            refreshNow();
            sHandler.postDelayed(this, REFRESH_INTERVAL_MS);
        }
    };

    private PvPHouseServerStatus() {}

    @Nullable
    public static ServerStatusPinger.Result getLastResult() {
        return sLastResult;
    }

    @MainThread
    public static void addListener(Listener listener) {
        if (sListeners.contains(listener)) return;
        sListeners.add(listener);
        listener.onServerStatus(sLastResult);
        if (sListeners.size() == 1) {
            sHandler.removeCallbacks(sTick);
            sHandler.post(sTick);
        }
    }

    @MainThread
    public static void removeListener(Listener listener) {
        sListeners.remove(listener);
        if (sListeners.isEmpty()) sHandler.removeCallbacks(sTick);
    }

    /** Ping right away (e.g. on a manual refresh). Coalesces with an in-flight ping. */
    @MainThread
    public static void refreshNow() {
        if (sPingInFlight) return;
        sPingInFlight = true;
        PojavApplication.sExecutorService.execute(() -> {
            ServerStatusPinger.Result result =
                    ServerStatusPinger.ping(PvPHouseConfig.SERVER_HOST, PvPHouseConfig.SERVER_PORT);
            sHandler.post(() -> {
                sPingInFlight = false;
                sLastResult = result;
                for (Listener listener : new ArrayList<>(sListeners)) listener.onServerStatus(result);
            });
        });
    }

    /**
     * Blocking one-shot check for callers that need a fresh answer (auto-start decision).
     * Must NOT be called on the main thread.
     */
    public static ServerStatusPinger.Result pingBlocking() {
        ServerStatusPinger.Result result =
                ServerStatusPinger.ping(PvPHouseConfig.SERVER_HOST, PvPHouseConfig.SERVER_PORT);
        sLastResult = result;
        return result;
    }
}
