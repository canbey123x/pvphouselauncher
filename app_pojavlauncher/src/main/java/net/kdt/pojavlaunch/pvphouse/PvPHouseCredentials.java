package net.kdt.pojavlaunch.pvphouse;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.annotation.RequiresApi;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * PvPHouse Launcher: the player's PvPHouse (AuthMe) username and password.
 *
 * The password is encrypted with an AES-256-GCM key that lives in the Android Keystore
 * (never leaves secure hardware where available) and is only decrypted right before a launch.
 * On Android 5.x (no Keystore AES) the password is NOT stored and auto-login is disabled.
 */
public final class PvPHouseCredentials {
    private static final String TAG = "PvPHouseCredentials";
    private static final String PREFS = "pvphouse_auth";
    private static final String KEY_ALIAS = "pvphouse_autologin_key";
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;

    private static final String PREF_USERNAME = "username";
    private static final String PREF_PASSWORD = "password_enc";
    private static final String PREF_MODE = "mode";

    /** Next join sends /register (first time) or /login. */
    public static final String MODE_REGISTER = "register";
    public static final String MODE_LOGIN = "login";

    /** AuthMe defaults: 5..30 characters; spaces would break the chat command. */
    public static final int PASSWORD_MIN = 5;
    public static final int PASSWORD_MAX = 30;

    public static final class Credentials {
        public final String username;
        @Nullable public final String password;
        public final String mode;

        Credentials(String username, @Nullable String password, String mode) {
            this.username = username;
            this.password = password;
            this.mode = mode;
        }
    }

    private PvPHouseCredentials() {}

    public static boolean isPasswordStorageSupported() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M;
    }

    public static boolean isValidUsername(String username) {
        return username != null && username.matches("^[A-Za-z0-9_]{3,16}$");
    }

    public static boolean isValidPassword(String password) {
        if (password == null || password.length() < PASSWORD_MIN || password.length() > PASSWORD_MAX) return false;
        for (int i = 0; i < password.length(); i++) {
            if (Character.isWhitespace(password.charAt(i))) return false;
        }
        return true;
    }

    public static void save(Context context, String username, String password, String mode) {
        SharedPreferences.Editor editor = prefs(context).edit()
                .putString(PREF_USERNAME, username)
                .putString(PREF_MODE, mode)
                .remove(PREF_PASSWORD);
        if (isPasswordStorageSupported()) {
            try {
                editor.putString(PREF_PASSWORD, encrypt(password));
            } catch (Exception e) {
                Log.e(TAG, "Could not encrypt the password, auto-login disabled", e);
            }
        }
        editor.commit(); // read by the game process right after, so write synchronously
    }

    /** @return saved credentials (password may be null if not stored/decryptable), or null if none. */
    @Nullable
    public static Credentials load(Context context) {
        SharedPreferences prefs = prefs(context);
        String username = prefs.getString(PREF_USERNAME, null);
        if (username == null) return null;
        String mode = prefs.getString(PREF_MODE, MODE_LOGIN);
        String password = null;
        String encrypted = prefs.getString(PREF_PASSWORD, null);
        if (encrypted != null && isPasswordStorageSupported()) {
            try {
                password = decrypt(encrypted);
            } catch (Exception e) {
                Log.e(TAG, "Could not decrypt the saved password", e);
            }
        }
        return new Credentials(username, password, MODE_REGISTER.equals(mode) ? MODE_REGISTER : MODE_LOGIN);
    }

    /** After /register has been handed to the game, later joins use /login. */
    public static void markRegistered(Context context) {
        prefs(context).edit().putString(PREF_MODE, MODE_LOGIN).commit();
    }

    public static void clear(Context context) {
        prefs(context).edit().clear().commit();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ------------------------------------------------------------------ crypto

    @RequiresApi(Build.VERSION_CODES.M)
    private static SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);
        KeyStore.Entry entry = keyStore.getEntry(KEY_ALIAS, null);
        if (entry instanceof KeyStore.SecretKeyEntry) return ((KeyStore.SecretKeyEntry) entry).getSecretKey();

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return generator.generateKey();
    }

    @RequiresApi(Build.VERSION_CODES.M)
    private static String encrypt(@NonNull String plain) throws Exception {
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] iv = cipher.getIV();
        byte[] encrypted = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
        ByteBuffer buffer = ByteBuffer.allocate(1 + iv.length + encrypted.length);
        buffer.put((byte) iv.length).put(iv).put(encrypted);
        return Base64.encodeToString(buffer.array(), Base64.NO_WRAP);
    }

    @RequiresApi(Build.VERSION_CODES.M)
    private static String decrypt(String stored) throws Exception {
        ByteBuffer buffer = ByteBuffer.wrap(Base64.decode(stored, Base64.NO_WRAP));
        int ivLength = buffer.get() & 0xFF;
        if (ivLength < 12 || ivLength > 32) throw new IllegalStateException("Bad IV length");
        byte[] iv = new byte[ivLength];
        buffer.get(iv);
        byte[] encrypted = new byte[buffer.remaining()];
        buffer.get(encrypted);
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
        return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
    }
}
