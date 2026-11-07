package net.kdt.pojavlaunch.pvphouse;

/**
 * PvPHouse Launcher: every server/profile constant lives here.
 */
public final class PvPHouseConfig {
    private PvPHouseConfig() {}

    /** Server address players connect to. */
    public static final String SERVER_HOST = "mc.pvphouse.net";
    public static final int SERVER_PORT = 25565;
    /** Display name used in servers.dat and the UI. */
    public static final String SERVER_NAME = "PvPHouse";

    /** PvPHouse website, opened from the main menu. */
    public static final String WEBSITE_URL = "https://pvphouse.net";

    /** Minecraft version of the server (vanilla). */
    public static final String GAME_VERSION = "1.21.11";

    /**
     * Fixed key of the PvPHouse profile in launcher_profiles.json.
     * Must be a canonical lowercase UUID, otherwise LauncherProfiles.normalizeProfileIds()
     * replaces it with a random one and we could no longer find the profile.
     */
    public static final String PROFILE_KEY = "7f3c2a10-5e8b-4d6a-9c1e-505650480001";
    public static final String PROFILE_NAME = "PvPHouse";
    /** Profile icon: "default" resolves to the PvPHouse logo (R.drawable.ic_pojav_full). */
    public static final String PROFILE_ICON = "default";
    /** Separate game folder so the PvPHouse mods never leak into other profiles. Relative to Tools.DIR_GAME_HOME. */
    public static final String PROFILE_GAME_DIR = "./custom_instances/pvphouse";

    /**
     * Optional performance pack (Modrinth project slugs). Versions are never hard-coded: the
     * newest release compatible with GAME_VERSION + Fabric is resolved from the Modrinth API.
     */
    public static final String[] PERF_PACK_MODS = {"fabric-api", "lithium", "ferrite-core"};
    /**
     * Sodium crashes on purpose under Pojav/Amethyst unless Podium (disables that check) is present,
     * and needs the MobileGlues or LTW renderer. It is only installed when BOTH resolve.
     */
    public static final String PERF_PACK_SODIUM = "sodium";
    public static final String PERF_PACK_SODIUM_COMPANION = "podium";

        /**
     * Default renderer of the PvPHouse profile on devices with Vulkan hardware. The PvPHouse
     * resource pack (ItemsAdder) ships a custom core text shader that MobileGlues cannot translate
     * ("reload failed"); Zink compiles desktop GLSL natively. Devices without Vulkan keep the
     * upstream automatic choice (MobileGlues).
     */
    public static final String VULKAN_RENDERER = "opengles3_desktopgl_zink_kopper";

        /** Default RAM: ~40% of device RAM, clamped to [1 GB, 4 GB] on 64-bit devices. */
    public static final float RAM_FRACTION = 0.40f;
    public static final int RAM_MIN_MB = 1024;
    public static final int RAM_MAX_MB = 4096;

    public static String serverAddress() {
        return SERVER_HOST + ":" + SERVER_PORT;
    }
}
