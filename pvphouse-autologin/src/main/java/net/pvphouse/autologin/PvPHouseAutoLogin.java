package net.pvphouse.autologin;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.fabricmc.api.ClientModInitializer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.client.multiplayer.ServerData;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;

/**
 * Reads the one-time credentials file written by PvPHouse Launcher (path in the system property
 * {@code pvphouse.autologin.file}), deletes it immediately and keeps the values in memory for this
 * game session. When the player joins PvPHouse, sends /register (first time) or /login.
 * Never sends anything to any other server. Never logs the password.
 */
public final class PvPHouseAutoLogin implements ClientModInitializer {
	private static final Logger LOGGER = LoggerFactory.getLogger("PvPHouseAutoLogin");
	private static final String FILE_PROPERTY = "pvphouse.autologin.file";

	private static volatile String sHost;
	private static volatile int sPort = 25565;
	private static volatile String sPassword;
	private static volatile boolean sRegister;

	@Override
	public void onInitializeClient() {
		net.pvphouse.autologin.cosmetics.Cosmetics.load();
		String file = System.getProperty(FILE_PROPERTY);
		if (file == null || file.isEmpty()) {
			LOGGER.info("Not started by PvPHouse Launcher with saved credentials, auto-login inactive");
			return;
		}
		Path path = Path.of(file);
		try {
			JsonObject json = JsonParser.parseString(Files.readString(path, StandardCharsets.UTF_8)).getAsJsonObject();
			sHost = json.get("host").getAsString().toLowerCase(Locale.ROOT);
			if (json.has("port")) sPort = json.get("port").getAsInt();
			sPassword = json.get("password").getAsString();
			sRegister = "register".equals(json.get("mode").getAsString());
			LOGGER.info("Auto-login ready for {}:{} ({})", sHost, sPort, sRegister ? "register" : "login");
		} catch (Exception e) {
			LOGGER.warn("Could not read the auto-login file, auto-login inactive: {}", e.toString());
		} finally {
			try {
				Files.deleteIfExists(path); // one-time hand-over: never leave the password on disk
			} catch (Exception e) {
				LOGGER.warn("Could not delete the auto-login file: {}", e.toString());
			}
		}
	}

	// ---- per-join state (client thread only) ----
	private static final long FALLBACK_DELAY_MS = 4000L;
	private static final long MIN_RESEND_INTERVAL_MS = 4000L;
	private static final int MAX_ATTEMPTS_PER_JOIN = 3;
	private static int sJoinId = 0;
	private static int sAttempts = 0;
	private static long sLastSentAt = 0;
	private static boolean sRegisterSentThisJoin = false;

	/**
	 * Called on the client thread after the game "login" packet was handled.
	 * We mainly react to AuthMe's own prompts (see {@link #onSystemMessage}); this only schedules a
	 * single fallback in case no prompt arrives (e.g. custom AuthMe messages without the command).
	 */
	public static void onJoinedServer(ClientPacketListener connection) {
		if (!isPvPHouseHost(connection.getServerData())) return;
		if (sPassword == null || sHost == null) {
			LOGGER.info("Joined PvPHouse but auto-login is inactive (no saved credentials for this account)");
			return;
		}
		if (!isPvPHouse(connection.getServerData())) return;
		final int joinId = ++sJoinId;
		sAttempts = 0;
		sLastSentAt = 0;
		sRegisterSentThisJoin = false;

		Thread fallback = new Thread(() -> {
			try {
				Thread.sleep(FALLBACK_DELAY_MS);
			} catch (InterruptedException e) {
				return;
			}
			Minecraft minecraft = Minecraft.getInstance();
			minecraft.execute(() -> {
				if (joinId != sJoinId || sAttempts > 0) return; // a prompt already handled it
				send(minecraft.getConnection(), sRegister);
			});
		}, "PvPHouse-AutoLogin");
		fallback.setDaemon(true);
		fallback.start();
	}

	/**
	 * Called on the client thread for every server system message. AuthMe's prompts always contain
	 * the command itself ("/login <password>", "/register <password> <ConfirmPassword>"), whatever
	 * language its messages are in, so we answer exactly what the server asks for.
	 */
	public static void onSystemMessage(ClientPacketListener connection, String message) {
		if (sPassword == null || sHost == null || message == null) return;
		if (!isPvPHouse(connection.getServerData())) return;
		String lower = message.toLowerCase(Locale.ROOT);
		boolean asksRegister = lower.contains("/register");
		boolean asksLogin = lower.contains("/login");
		if (!asksRegister && !asksLogin) return;
		if (asksRegister && !sRegisterSentThisJoin) {
			send(connection, true);
		} else if (asksLogin) {
			send(connection, false);
		}
	}

	private static void send(ClientPacketListener connection, boolean register) {
		if (connection == null || !isPvPHouse(connection.getServerData())) return;
		long now = System.currentTimeMillis();
		if (sAttempts >= MAX_ATTEMPTS_PER_JOIN || now - sLastSentAt < MIN_RESEND_INTERVAL_MS) return;
		sAttempts++;
		sLastSentAt = now;
		if (register) {
			sRegisterSentThisJoin = true;
			sRegister = false; // after registering, later joins log in
			connection.sendCommand("register " + sPassword + " " + sPassword);
		} else {
			connection.sendCommand("login " + sPassword);
		}
		LOGGER.info("Sent /{} to PvPHouse (attempt {})", register ? "register" : "login", sAttempts);
	}

	/** Host check that also works when no credentials were handed over (diagnostics only). */
	private static boolean isPvPHouseHost(ServerData server) {
		return server != null && server.ip != null && server.ip.toLowerCase(Locale.ROOT).contains("pvphouse");
	}

	private static boolean isPvPHouse(ServerData server) {
		if (server == null || server.ip == null) return false;
		String ip = server.ip.trim().toLowerCase(Locale.ROOT);
		int port = 25565;
		int colon = ip.lastIndexOf(':');
		if (colon > 0 && ip.indexOf(':') == colon) {
			try {
				port = Integer.parseInt(ip.substring(colon + 1));
				ip = ip.substring(0, colon);
			} catch (NumberFormatException ignored) {
			}
		}
		if (ip.endsWith(".")) ip = ip.substring(0, ip.length() - 1);
		return ip.equals(sHost) && port == sPort;
	}
}
