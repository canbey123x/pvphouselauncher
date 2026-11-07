package net.kdt.pojavlaunch.pvphouse;

import android.util.Log;

import androidx.annotation.Nullable;

import com.kdt.mcgui.ProgressLayout;

import net.kdt.pojavlaunch.PojavApplication;
import net.kdt.pojavlaunch.R;
import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.prefs.LauncherPreferences;
import net.kdt.pojavlaunch.progresskeeper.ProgressKeeper;
import net.kdt.pojavlaunch.utils.DownloadUtils;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLEncoder;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * PvPHouse Launcher: optional performance pack for the PvPHouse profile.
 *
 * For every mod the newest Modrinth version compatible with Fabric + {@link PvPHouseConfig#GAME_VERSION}
 * is resolved (release preferred, beta as fallback), its required dependencies are resolved the same
 * way, files are downloaded and checked against Modrinth's SHA-512. Mods without a compatible
 * version are skipped and reported - nothing is guessed. Only files listed in the pack manifest
 * are ever replaced or removed, so the player's own mods are never touched.
 */
public final class PvPHousePerformancePack {
    private static final String TAG = "PvPHousePerfPack";
    private static final String API = "https://api.modrinth.com/v2";
    private static final String MANIFEST = ".pvphouse-perfpack.json";

    public static final String PREF_ENABLED = "pvphouse_perf_pack";
    private static final String PREF_LAST_CHECK = "pvphouse_perf_pack_last_check";
    /** Set when WE turned Amethyst's Sodium warning off, so we only undo our own change. */
    private static final String PREF_WE_SET_SODIUM_OVERRIDE = "pvphouse_perf_pack_sodium_override";
    private static final String UPSTREAM_SODIUM_OVERRIDE = "sodium_override";
    private static final long RECHECK_INTERVAL_MS = 24L * 60 * 60 * 1000;

    public interface Listener {
        /** UI thread. {@code unavailable}: human readable entries for mods that could not be installed. */
        void onPackApplied(boolean enabled, List<String> installed, List<String> unavailable, boolean sodiumInstalled);
        /** UI thread. */
        void onPackFailed(Throwable error);
    }

    private static volatile boolean sRunning = false;

    private PvPHousePerformancePack() {}

    public static boolean isEnabled() {
        return LauncherPreferences.DEFAULT_PREF.getBoolean(PREF_ENABLED, false);
    }

    /** Re-resolves the pack at most once a day while it is enabled (new mod versions, fixes). */
    public static void refreshIfDue(@Nullable Listener listener) {
        if (!isEnabled()) return;
        long last = LauncherPreferences.DEFAULT_PREF.getLong(PREF_LAST_CHECK, 0);
        if (System.currentTimeMillis() - last < RECHECK_INTERVAL_MS) return;
        apply(true, listener);
    }

    /** Install/update ({@code enabled}) or remove the pack, in the background. */
    public static void apply(boolean enabled, @Nullable Listener listener) {
        if (sRunning) return;
        sRunning = true;
        PojavApplication.sExecutorService.execute(() -> {
            try {
                if (enabled) install(listener);
                else uninstall(listener);
            } catch (Exception e) {
                Log.e(TAG, "Performance pack failed", e);
                if (listener != null) Tools.runOnUiThread(() -> listener.onPackFailed(e));
            } finally {
                ProgressLayout.clearProgress(ProgressLayout.INSTALL_MODPACK);
                sRunning = false;
            }
        });
    }

    // ---------------------------------------------------------------- install

    private static final class Resolved {
        String projectId;
        String title;
        String versionNumber;
        String url;
        String fileName;
        String sha512;
        final List<String> requiredDependencies = new ArrayList<>();
    }

    private static void install(@Nullable Listener listener) throws IOException, JSONException {
        File modsDir = modsDir();
        ProgressKeeper.submitProgress(ProgressLayout.INSTALL_MODPACK, 0, R.string.pvphouse_perf_resolving);

        Map<String, Resolved> wanted = new LinkedHashMap<>(); // projectId -> version
        List<String> unavailable = new ArrayList<>();

        for (String slug : PvPHouseConfig.PERF_PACK_MODS) {
            Resolved mod = resolve(slug);
            if (mod == null) unavailable.add(slug);
            else wanted.put(mod.projectId, mod);
        }

        Resolved sodium = resolve(PvPHouseConfig.PERF_PACK_SODIUM);
        Resolved podium = resolve(PvPHouseConfig.PERF_PACK_SODIUM_COMPANION);
        if (sodium != null && podium != null) {
            wanted.put(sodium.projectId, sodium);
            wanted.put(podium.projectId, podium);
        } else if (sodium == null) {
            unavailable.add(PvPHouseConfig.PERF_PACK_SODIUM);
        } else {
            unavailable.add(PvPHouseConfig.PERF_PACK_SODIUM + " (" + PvPHouseConfig.PERF_PACK_SODIUM_COMPANION + ")");
        }

        resolveDependencies(wanted, unavailable);
        // Podium is useless (and only depends on Sodium) if Sodium itself had to be dropped
        if (sodium != null && podium != null && !wanted.containsKey(sodium.projectId)) {
            wanted.remove(podium.projectId);
        }

        // Download (skipping files that are already there with the right hash)
        List<String> previous = readManifest(modsDir);
        List<String> installedFiles = new ArrayList<>();
        List<String> installedNames = new ArrayList<>();
        int index = 0;
        for (Resolved mod : wanted.values()) {
            index++;
            ProgressKeeper.submitProgress(ProgressLayout.INSTALL_MODPACK, index * 100 / Math.max(1, wanted.size()),
                    R.string.pvphouse_perf_downloading, mod.title);
            File target = new File(modsDir, mod.fileName);
            if (!(target.isFile() && mod.sha512.equalsIgnoreCase(sha512(target)))) {
                downloadVerified(mod, target);
            }
            installedFiles.add(mod.fileName);
            installedNames.add(mod.title + " " + mod.versionNumber);
        }

        // Remove pack files from an earlier run that are no longer part of the pack (old versions)
        for (String oldFile : previous) {
            if (!installedFiles.contains(oldFile)) {
                //noinspection ResultOfMethodCallIgnored
                new File(modsDir, oldFile).delete();
            }
        }
        boolean sodiumInstalled = sodium != null && wanted.containsKey(sodium.projectId);
        writeManifest(modsDir, installedFiles);
        updateSodiumOverride(sodiumInstalled);

        LauncherPreferences.DEFAULT_PREF.edit().putLong(PREF_LAST_CHECK, System.currentTimeMillis()).apply();

        if (listener != null) {
            Tools.runOnUiThread(() -> listener.onPackApplied(true, installedNames, unavailable, sodiumInstalled));
        }
    }

    /** Adds missing required dependencies; drops a mod whose required dependency is unavailable. */
    private static void resolveDependencies(Map<String, Resolved> wanted, List<String> unavailable)
            throws IOException, JSONException {
        boolean changed = true;
        int rounds = 0;
        while (changed && rounds++ < 5) {
            changed = false;
            for (Resolved mod : new ArrayList<>(wanted.values())) {
                for (String dependencyId : mod.requiredDependencies) {
                    if (wanted.containsKey(dependencyId)) continue;
                    Resolved dependency = resolve(dependencyId);
                    if (dependency != null) {
                        wanted.put(dependency.projectId, dependency);
                    } else {
                        wanted.remove(mod.projectId);
                        unavailable.add(mod.title + " (" + dependencyId + ")");
                    }
                    changed = true;
                }
            }
        }
    }

    /** @return the newest compatible version (release preferred), or null if there is none. */
    @Nullable
    private static Resolved resolve(String slugOrId) throws IOException, JSONException {
        String url = API + "/project/" + URLEncoder.encode(slugOrId, "UTF-8") + "/version"
                + "?loaders=" + URLEncoder.encode("[\"fabric\"]", "UTF-8")
                + "&game_versions=" + URLEncoder.encode("[\"" + PvPHouseConfig.GAME_VERSION + "\"]", "UTF-8");
        String body;
        try {
            body = DownloadUtils.downloadString(url);
        } catch (IOException e) {
            // 404 = project does not exist; anything else is a real network problem
            if (isHttpNotFound(e)) return null;
            throw e;
        }
        JSONArray versions = new JSONArray(body);
        JSONObject chosen = null;
        for (int i = 0; i < versions.length() && chosen == null; i++) {
            if ("release".equals(versions.getJSONObject(i).optString("version_type"))) chosen = versions.getJSONObject(i);
        }
        for (int i = 0; i < versions.length() && chosen == null; i++) {
            if ("beta".equals(versions.getJSONObject(i).optString("version_type"))) chosen = versions.getJSONObject(i);
        }
        if (chosen == null) return null;

        JSONArray files = chosen.getJSONArray("files");
        JSONObject file = null;
        for (int i = 0; i < files.length(); i++) {
            if (files.getJSONObject(i).optBoolean("primary")) file = files.getJSONObject(i);
        }
        if (file == null && files.length() > 0) file = files.getJSONObject(0);
        if (file == null) return null;

        Resolved resolved = new Resolved();
        resolved.projectId = chosen.getString("project_id");
        resolved.title = slugOrId;
        resolved.versionNumber = chosen.optString("version_number", "?");
        resolved.url = file.getString("url");
        resolved.fileName = new File(file.getString("filename")).getName(); // no path components
        resolved.sha512 = file.getJSONObject("hashes").getString("sha512");
        JSONArray dependencies = chosen.optJSONArray("dependencies");
        if (dependencies != null) {
            for (int i = 0; i < dependencies.length(); i++) {
                JSONObject dependency = dependencies.getJSONObject(i);
                String projectId = dependency.optString("project_id", null);
                if ("required".equals(dependency.optString("dependency_type")) && projectId != null && !projectId.isEmpty()) {
                    resolved.requiredDependencies.add(projectId);
                }
            }
        }
        if (!resolved.fileName.endsWith(".jar")) return null;
        return resolved;
    }

    /** DownloadUtils wraps "Server returned HTTP 404" in another IOException, so walk the cause chain. */
    private static boolean isHttpNotFound(Throwable error) {
        for (Throwable t = error; t != null; t = t.getCause()) {
            String message = t.getMessage();
            if (message != null && message.contains("HTTP 404")) return true;
        }
        return false;
    }

    private static void downloadVerified(Resolved mod, File target) throws IOException {
        File parent = target.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) throw new IOException("Cannot create " + parent);
        File tmp = new File(parent, target.getName() + ".pvphouse_part");
        DownloadUtils.downloadFile(mod.url, tmp);
        String actual = sha512(tmp);
        if (!mod.sha512.equalsIgnoreCase(actual)) {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            throw new IOException("Checksum mismatch for " + mod.fileName);
        }
        if (target.exists() && !target.delete()) throw new IOException("Cannot replace " + target);
        if (!tmp.renameTo(target)) throw new IOException("Cannot move " + tmp + " to " + target);
    }

    // -------------------------------------------------------------- uninstall

    private static void uninstall(@Nullable Listener listener) throws IOException {
        File modsDir = modsDir();
        for (String file : readManifest(modsDir)) {
            //noinspection ResultOfMethodCallIgnored
            new File(modsDir, file).delete();
        }
        //noinspection ResultOfMethodCallIgnored
        new File(modsDir, MANIFEST).delete();
        updateSodiumOverride(false);
        if (listener != null) {
            Tools.runOnUiThread(() -> listener.onPackApplied(false, new ArrayList<>(), new ArrayList<>(), false));
        }
    }

    // ---------------------------------------------------------------- helpers


    private static File modsDir() {
        return new File(Tools.DIR_GAME_HOME, PvPHouseConfig.PROFILE_GAME_DIR + "/mods");
    }

    /**
     * Amethyst shows a blocking "Sodium is unsupported" dialog on Play. The pack installs Sodium
     * together with Podium and expects MobileGlues/LTW, so we turn that dialog off while the pack
     * provides Sodium - and only restore it if it was us who turned it off.
     */
    private static void updateSodiumOverride(boolean packProvidesSodium) {
        android.content.SharedPreferences prefs = LauncherPreferences.DEFAULT_PREF;
        if (packProvidesSodium) {
            if (!prefs.getBoolean(UPSTREAM_SODIUM_OVERRIDE, false)) {
                prefs.edit().putBoolean(UPSTREAM_SODIUM_OVERRIDE, true)
                        .putBoolean(PREF_WE_SET_SODIUM_OVERRIDE, true).apply();
            }
        } else if (prefs.getBoolean(PREF_WE_SET_SODIUM_OVERRIDE, false)) {
            prefs.edit().putBoolean(UPSTREAM_SODIUM_OVERRIDE, false)
                    .remove(PREF_WE_SET_SODIUM_OVERRIDE).apply();
        }
    }

    private static List<String> readManifest(File modsDir) {
        List<String> files = new ArrayList<>();
        File manifest = new File(modsDir, MANIFEST);
        if (!manifest.isFile()) return files;
        try {
            JSONArray array = new JSONObject(Tools.read(manifest.getAbsolutePath())).getJSONArray("files");
            for (int i = 0; i < array.length(); i++) {
                String name = new File(array.getString(i)).getName();
                if (name.endsWith(".jar")) files.add(name);
            }
        } catch (Exception e) {
            Log.w(TAG, "Unreadable pack manifest, ignoring it", e);
        }
        return files;
    }

    private static void writeManifest(File modsDir, List<String> files) throws IOException, JSONException {
        JSONObject json = new JSONObject();
        json.put("gameVersion", PvPHouseConfig.GAME_VERSION);
        json.put("files", new JSONArray(files));
        Tools.write(new File(modsDir, MANIFEST).getAbsolutePath(), json.toString(2));
    }

    private static String sha512(File file) throws IOException {
        try (InputStream in = new FileInputStream(file)) {
            MessageDigest digest = MessageDigest.getInstance("SHA-512");
            byte[] buffer = new byte[65536];
            int read;
            while ((read = in.read(buffer)) != -1) digest.update(buffer, 0, read);
            StringBuilder hex = new StringBuilder();
            for (byte b : digest.digest()) hex.append(String.format(Locale.ROOT, "%02x", b));
            return hex.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IOException(e);
        }
    }
}
