package net.kdt.pojavlaunch.pvphouse;

import android.util.Log;

import androidx.annotation.Nullable;

import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.value.launcherprofiles.MinecraftProfile;

import java.io.IOException;

/**
 * PvPHouse Launcher: decides whether a game launch should join the PvPHouse server directly
 * (Quick Play) and prepares the game folder for it. Lives in the launcher process.
 */
public final class PvPHouseLaunch {
    private static final String TAG = "PvPHouseLaunch";

    /** Set by the "Join PvPHouse" button, consumed by the next launch attempt. */
    private static volatile boolean sJoinRequested = false;

    private PvPHouseLaunch() {}

    public static void requestJoin() {
        sJoinRequested = true;
    }

    /**
     * Must be called once at the very start of every launch attempt (even ones that end up being
     * refused), so a stale join request can never leak into a later normal launch.
     *
     * @return "host:port" to pass as --quickPlayMultiplayer, or null for a normal launch.
     */
    @Nullable
    public static String consumeQuickPlayTarget(@Nullable String selectedProfileKey) {
        boolean joinRequested = sJoinRequested;
        sJoinRequested = false;
        if (!PvPHouseConfig.PROFILE_KEY.equals(selectedProfileKey)) return null;
        return joinRequested ? PvPHouseConfig.serverAddress() : null;
    }

    /** Adds PvPHouse to the multiplayer list of the PvPHouse profile. Never throws. */
    public static void prepareGameDir(String profileKey, @Nullable MinecraftProfile profile) {
        if (profile == null || !PvPHouseConfig.PROFILE_KEY.equals(profileKey)) return;
        try {
            ServersDat.ensureServer(Tools.getGameDirPath(profile),
                    PvPHouseConfig.SERVER_NAME, PvPHouseConfig.SERVER_HOST, PvPHouseConfig.SERVER_PORT);
        } catch (IOException | RuntimeException e) {
            Log.w(TAG, "Could not update servers.dat", e);
        }
    }
}
