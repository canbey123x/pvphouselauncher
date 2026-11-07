package net.kdt.pojavlaunch.pvphouse;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.Nullable;

import net.kdt.pojavlaunch.R;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * PvPHouse Launcher: cosmetics catalog and the player's selection. Client-side only: the game
 * shows them on the local player (seen by this player only). IDs must match the mod's catalog.
 */
public final class PvPHouseCosmetics {
    private static final String PREFS = "pvphouse_cosmetics";
    public static final String TYPE_CAPE = "cape";
    public static final String TYPE_HAT = "hat";
    public static final String TYPE_WINGS = "wings";

    public static final class Item {
        public final String type;
        @Nullable public final String id; // null = none
        public final int nameRes;
        public final int previewRes;

        Item(String type, @Nullable String id, int nameRes, int previewRes) {
            this.type = type;
            this.id = id;
            this.nameRes = nameRes;
            this.previewRes = previewRes;
        }
    }

    public static Item[] catalog(String type) {
        switch (type) {
            case TYPE_CAPE: return new Item[]{
                    none(type),
                    new Item(type, "pvphouse", R.string.pvphouse_cosm_cape_pvphouse, R.drawable.cosm_cape_pvphouse),
                    new Item(type, "galaxy", R.string.pvphouse_cosm_cape_galaxy, R.drawable.cosm_cape_galaxy),
                    new Item(type, "neon", R.string.pvphouse_cosm_cape_neon, R.drawable.cosm_cape_neon)};
            case TYPE_HAT: return new Item[]{
                    none(type),
                    new Item(type, "crown", R.string.pvphouse_cosm_hat_crown, R.drawable.cosm_hat_crown),
                    new Item(type, "tophat", R.string.pvphouse_cosm_hat_tophat, R.drawable.cosm_hat_tophat),
                    new Item(type, "horns", R.string.pvphouse_cosm_hat_horns, R.drawable.cosm_hat_horns)};
            case TYPE_WINGS: return new Item[]{
                    none(type),
                    new Item(type, "angel", R.string.pvphouse_cosm_wings_angel, R.drawable.cosm_wings_angel),
                    new Item(type, "demon", R.string.pvphouse_cosm_wings_demon, R.drawable.cosm_wings_demon)};
            default: return new Item[0];
        }
    }

    private static Item none(String type) {
        return new Item(type, null, R.string.pvphouse_cosm_none, R.drawable.cosm_none);
    }

    private PvPHouseCosmetics() {}

    @Nullable
    public static String getSelected(Context context, String type) {
        return prefs(context).getString(type, null);
    }

    public static void setSelected(Context context, String type, @Nullable String id) {
        SharedPreferences.Editor editor = prefs(context).edit();
        if (id == null) editor.remove(type); else editor.putString(type, id);
        editor.commit(); // read by the game process right after a launch
    }

    /** Writes the selection for the mod (game process, right before launch). Never throws. */
    public static void writeConfig(Context context, File gameDir) {
        try {
            JSONObject json = new JSONObject();
            json.put(TYPE_CAPE, orNull(getSelected(context, TYPE_CAPE)));
            json.put(TYPE_HAT, orNull(getSelected(context, TYPE_HAT)));
            json.put(TYPE_WINGS, orNull(getSelected(context, TYPE_WINGS)));
            File file = new File(gameDir, "config/pvphouse_cosmetics.json");
            File parent = file.getParentFile();
            if (parent != null && !parent.isDirectory() && !parent.mkdirs()) return;
            try (OutputStream out = new FileOutputStream(file)) {
                out.write(json.toString().getBytes(StandardCharsets.UTF_8));
            }
        } catch (IOException | JSONException ignored) {
        }
    }

    private static Object orNull(@Nullable String value) {
        return value == null ? JSONObject.NULL : value;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
