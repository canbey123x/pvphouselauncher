package net.pvphouse.autologin.cosmetics;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.blaze3d.platform.NativeImage;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

/**
 * PvPHouse cosmetics (client-side only: shown on the local player, visible to this player only).
 * The selection is written by PvPHouse Launcher to config/pvphouse_cosmetics.json.
 */
public final class Cosmetics {
	private static final Logger LOGGER = LoggerFactory.getLogger("PvPHouseCosmetics");
	public static final Set<String> CAPES = Set.of("pvphouse", "galaxy", "neon");
	public static final Set<String> HATS = Set.of("crown", "tophat", "horns");
	public static final Set<String> WINGS = Set.of("angel", "demon");

	private static String sCape;
	private static String sHat;
	private static String sWings;
	private static final Map<String, Identifier> TEXTURES = new HashMap<>();

	private Cosmetics() {}

	public static void load() {
		Path file = FabricLoader.getInstance().getConfigDir().resolve("pvphouse_cosmetics.json");
		if (!Files.isRegularFile(file)) return;
		try {
			JsonObject json = JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8)).getAsJsonObject();
			sCape = pick(json, "cape", CAPES);
			sHat = pick(json, "hat", HATS);
			sWings = pick(json, "wings", WINGS);
			LOGGER.info("Cosmetics: cape={}, hat={}, wings={}", sCape, sHat, sWings);
		} catch (Exception e) {
			LOGGER.warn("Could not read cosmetics config: {}", e.toString());
		}
	}

	private static String pick(JsonObject json, String key, Set<String> allowed) {
		JsonElement element = json.get(key);
		if (element == null || element.isJsonNull()) return null;
		String value = element.getAsString();
		return allowed.contains(value) ? value : null;
	}

	public static String cape() { return sCape; }
	public static String hat() { return sHat; }
	public static String wings() { return sWings; }

	/** True for the player this client controls (also in the inventory preview). */
	public static boolean isLocalPlayer(int entityId) {
		Minecraft minecraft = Minecraft.getInstance();
		return minecraft.player != null && minecraft.player.getId() == entityId;
	}

	/**
	 * Lazily uploads the bundled PNG as a dynamic texture. Must be called on the render thread.
	 * Mod assets are not part of the resource manager without Fabric API, so they are read from
	 * the mod jar directly.
	 */
	public static Identifier texture(String type, String id) {
		String key = type + "/" + id;
		Identifier cached = TEXTURES.get(key);
		if (cached != null) return cached;
		Identifier location = Identifier.fromNamespaceAndPath("pvphouse", "cosmetics/" + key);
		try (InputStream in = Cosmetics.class.getResourceAsStream("/assets/pvphouse/cosmetics/" + key + ".png")) {
			if (in == null) throw new IllegalStateException("missing " + key);
			NativeImage image = NativeImage.read(in);
			DynamicTexture texture = new DynamicTexture(() -> "pvphouse/" + key, image);
			texture.upload();
			Minecraft.getInstance().getTextureManager().register(location, texture);
		} catch (Exception e) {
			LOGGER.warn("Could not load cosmetic texture {}: {}", key, e.toString());
		}
		TEXTURES.put(key, location);
		return location;
	}
}
