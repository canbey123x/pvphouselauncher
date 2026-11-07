package net.kdt.pojavlaunch.pvphouse;

import android.content.Context;
import android.util.Log;

import androidx.annotation.Nullable;

import net.kdt.pojavlaunch.value.MinecraftAccount;
import net.kdt.pojavlaunch.value.launcherprofiles.MinecraftProfile;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.zip.CRC32;

/**
 * PvPHouse Launcher (game process): installs the bundled auto-login mod into the PvPHouse
 * profile and hands the saved AuthMe credentials to it through a one-time file in the app's
 * private internal storage. Only the file PATH goes on the JVM command line (JVM args end up in
 * shareable logs); the mod deletes the file as soon as it has read it.
 */
public final class PvPHouseAutoLoginBridge {
    private static final String TAG = "PvPHouseAutoLogin";
    private static final String MOD_ASSET = "pvphouse/pvphouse-autologin.jar";
    private static final String MOD_FILE_NAME = "pvphouse-autologin.jar";
    private static final String HANDOFF_FILE = "pvphouse_autologin.json";
    private static final String FILE_PROPERTY = "pvphouse.autologin.file";

    private PvPHouseAutoLoginBridge() {}

    /** Deletes a hand-off file left behind by a game that crashed before the mod could read it. */
    public static void cleanupStaleHandoff(Context context) {
        //noinspection ResultOfMethodCallIgnored
        new File(context.getFilesDir(), HANDOFF_FILE).delete();
    }

    /** Never throws; any problem just disables auto-login for this launch. */
    public static void prepare(Context context, @Nullable MinecraftAccount account, MinecraftProfile profile,
                               File gameDir, String versionId, List<String> javaArgs) {
        try {
            cleanupStaleHandoff(context);
            if (!PvPHouseConfig.PROFILE_GAME_DIR.equals(profile.gameDir)) return; // PvPHouse profile only

            File modFile = new File(gameDir, "mods/" + MOD_FILE_NAME);
            if (versionId == null || !versionId.endsWith(PvPHouseConfig.GAME_VERSION)) {
                // The mod is built for one Minecraft version; Fabric refuses to start with a mismatch
                if (modFile.delete()) Log.i(TAG, "Removed auto-login mod: profile is on " + versionId);
                return;
            }
            if (!installMod(context, modFile)) return;
            // Cosmetics selection (no secrets, always written for the PvPHouse profile)
            PvPHouseCosmetics.writeConfig(context, gameDir);

            PvPHouseCredentials.Credentials credentials = PvPHouseCredentials.load(context);
            if (credentials == null || credentials.password == null) return;
            if (account == null || account.username == null
                    || !account.username.equalsIgnoreCase(credentials.username)) {
                Log.i(TAG, "Selected account is not the saved PvPHouse account, auto-login skipped");
                return;
            }

            File handoff = new File(context.getFilesDir(), HANDOFF_FILE);
            writeHandoff(handoff, credentials);
            javaArgs.add("-D" + FILE_PROPERTY + "=" + handoff.getAbsolutePath());
            // /register is sent once; afterwards the player is registered and must /login
            if (PvPHouseCredentials.MODE_REGISTER.equals(credentials.mode)) {
                PvPHouseCredentials.markRegistered(context);
            }
            Log.i(TAG, "Auto-login prepared (" + credentials.mode + ")");
        } catch (Exception e) {
            Log.w(TAG, "Auto-login disabled for this launch", e);
        }
    }

    /** @return true if the mod is in place (copied or already up to date). */
    private static boolean installMod(Context context, File target) throws IOException {
        byte[] bundled;
        try (InputStream in = context.getAssets().open(MOD_ASSET)) {
            bundled = readAll(in);
        } catch (IOException e) {
            Log.w(TAG, "Auto-login mod not bundled in this build");
            return false;
        }
        if (target.isFile() && target.length() == bundled.length && crc(readFile(target)) == crc(bundled)) {
            return true;
        }
        File parent = target.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) throw new IOException("Cannot create " + parent);
        try (OutputStream out = new FileOutputStream(target)) {
            out.write(bundled);
        }
        Log.i(TAG, "Installed auto-login mod into " + target);
        return true;
    }

    private static void writeHandoff(File file, PvPHouseCredentials.Credentials credentials) throws IOException {
        JSONObject json = new JSONObject();
        try {
            json.put("host", PvPHouseConfig.SERVER_HOST.toLowerCase(Locale.ROOT));
            json.put("port", PvPHouseConfig.SERVER_PORT);
            json.put("mode", credentials.mode);
            json.put("password", credentials.password);
        } catch (JSONException e) {
            throw new IOException(e);
        }
        try (OutputStream out = new FileOutputStream(file)) {
            out.write(json.toString().getBytes(StandardCharsets.UTF_8));
        }
    }

    private static byte[] readFile(File file) throws IOException {
        try (InputStream in = new java.io.FileInputStream(file)) {
            return readAll(in);
        }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] buffer = new byte[16384];
        int read;
        while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
        return out.toByteArray();
    }

    private static long crc(byte[] data) {
        CRC32 crc = new CRC32();
        crc.update(data);
        return crc.getValue();
    }
}
