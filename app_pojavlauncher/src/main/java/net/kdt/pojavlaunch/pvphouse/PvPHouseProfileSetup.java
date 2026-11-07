package net.kdt.pojavlaunch.pvphouse;

import android.util.Log;

import androidx.annotation.Nullable;

import com.kdt.mcgui.ProgressLayout;

import net.kdt.pojavlaunch.PojavApplication;
import net.kdt.pojavlaunch.R;
import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.modloaders.FabricVersion;
import net.kdt.pojavlaunch.modloaders.FabriclikeUtils;
import net.kdt.pojavlaunch.prefs.LauncherPreferences;
import net.kdt.pojavlaunch.progresskeeper.ProgressKeeper;
import net.kdt.pojavlaunch.utils.DownloadUtils;
import net.kdt.pojavlaunch.utils.FileUtils;
import net.kdt.pojavlaunch.value.launcherprofiles.LauncherProfiles;
import net.kdt.pojavlaunch.value.launcherprofiles.MinecraftProfile;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;

/**
 * PvPHouse Launcher: creates the "PvPHouse" profile (Fabric Loader + {@link PvPHouseConfig#GAME_VERSION})
 * the first time the launcher starts.
 *
 * The Fabric loader version is NOT hard-coded: the newest loader that Fabric meta marks as
 * {@code stable} for the game version is used. If Fabric meta has no stable loader for that
 * version, nothing is guessed - the setup fails with a clear message and is retried on the
 * next start.
 */
public final class PvPHouseProfileSetup {
    private static final String TAG = "PvPHouseProfileSetup";

    public interface Listener {
        /** Called on the UI thread. {@code created} is true only when the profile was created by this call. */
        void onProfileReady(String profileKey, boolean created);
        /** Called on the UI thread. */
        void onProfileFailed(int messageRes, @Nullable Throwable error);
    }

    private static volatile boolean sRunning = false;

    private PvPHouseProfileSetup() {}

    /** @return true if the PvPHouse profile exists and its Fabric version json is installed. */
    public static boolean isProfileReady() {
        LauncherProfiles.load();
        MinecraftProfile profile = LauncherProfiles.mainProfileJson.profiles.get(PvPHouseConfig.PROFILE_KEY);
        if (profile == null || profile.lastVersionId == null) return false;
        return versionJsonFile(profile.lastVersionId).isFile();
    }

    /**
     * Make sure the PvPHouse profile exists. Runs network work on the launcher executor.
     * Safe to call on every launcher start; it is a no-op when the profile is already ready.
     */
    public static void ensureProfile(Listener listener) {
        if (sRunning) return;
        sRunning = true;
        PojavApplication.sExecutorService.execute(() -> {
            boolean showedProgress = false;
            try {
                if (isProfileReady()) {
                    post(() -> listener.onProfileReady(PvPHouseConfig.PROFILE_KEY, false));
                    return;
                }
                showedProgress = true;
                ProgressKeeper.submitProgress(ProgressLayout.INSTALL_MODPACK, 0, R.string.pvphouse_profile_setup_progress);
                createProfile();
                post(() -> listener.onProfileReady(PvPHouseConfig.PROFILE_KEY, true));
            } catch (NoStableLoaderException e) {
                Log.w(TAG, e.getMessage());
                post(() -> listener.onProfileFailed(R.string.pvphouse_profile_no_fabric, e));
            } catch (Exception e) {
                Log.e(TAG, "PvPHouse profile setup failed", e);
                post(() -> listener.onProfileFailed(R.string.pvphouse_profile_setup_failed, e));
            } finally {
                // Only clear the progress bar we opened ourselves (it may belong to another install otherwise)
                if (showedProgress) ProgressLayout.clearProgress(ProgressLayout.INSTALL_MODPACK);
                sRunning = false;
            }
        });
    }

    private static void createProfile() throws IOException, NoStableLoaderException {
        String loaderVersion = findLatestStableLoader();
        Log.i(TAG, "Using Fabric loader " + loaderVersion + " for " + PvPHouseConfig.GAME_VERSION);
        ProgressKeeper.submitProgress(ProgressLayout.INSTALL_MODPACK, 50, R.string.pvphouse_profile_setup_progress);

        String fabricJson = DownloadUtils.downloadString(
                FabriclikeUtils.FABRIC_UTILS.createJsonDownloadUrl(PvPHouseConfig.GAME_VERSION, loaderVersion));
        String versionId;
        try {
            versionId = new JSONObject(fabricJson).getString("id");
        } catch (JSONException e) {
            throw new IOException("Fabric meta returned an invalid profile json", e);
        }
        File versionJson = versionJsonFile(versionId);
        FileUtils.ensureDirectory(versionJson.getParentFile());
        Tools.write(versionJson.getAbsolutePath(), fabricJson);

        LauncherProfiles.load();
        MinecraftProfile profile = LauncherProfiles.mainProfileJson.profiles.get(PvPHouseConfig.PROFILE_KEY);
        boolean isNew = profile == null;
        if (isNew) {
            profile = new MinecraftProfile();
            profile.name = PvPHouseConfig.PROFILE_NAME;
            profile.icon = PvPHouseConfig.PROFILE_ICON;
            profile.gameDir = PvPHouseConfig.PROFILE_GAME_DIR;
        }
        profile.lastVersionId = versionId;
        LauncherProfiles.mainProfileJson.profiles.put(PvPHouseConfig.PROFILE_KEY, profile);
        LauncherProfiles.write();
        FileUtils.ensureDirectory(Tools.getGameDirPath(profile));

        // Select the PvPHouse profile only when we create it, never override a later user choice.
        if (isNew) {
            LauncherPreferences.DEFAULT_PREF.edit()
                    .putString(LauncherPreferences.PREF_KEY_CURRENT_PROFILE, PvPHouseConfig.PROFILE_KEY)
                    .apply();
        }
        ProgressKeeper.submitProgress(ProgressLayout.INSTALL_MODPACK, 100, R.string.pvphouse_profile_setup_progress);
    }

    /** Newest loader flagged stable by Fabric meta (the API lists newest first). */
    private static String findLatestStableLoader() throws IOException, NoStableLoaderException {
        FabricVersion[] versions = FabriclikeUtils.FABRIC_UTILS.downloadLoaderVersions(PvPHouseConfig.GAME_VERSION);
        if (versions == null) throw new IOException("Could not read Fabric loader versions");
        for (FabricVersion version : versions) {
            if (version != null && version.stable && version.version != null) return version.version;
        }
        throw new NoStableLoaderException("Fabric meta has no stable loader for " + PvPHouseConfig.GAME_VERSION);
    }

    private static File versionJsonFile(String versionId) {
        return new File(Tools.DIR_HOME_VERSION, versionId + "/" + versionId + ".json");
    }

    private static void post(Runnable runnable) {
        Tools.runOnUiThread(runnable);
    }

    private static final class NoStableLoaderException extends Exception {
        NoStableLoaderException(String message) { super(message); }
    }
}
