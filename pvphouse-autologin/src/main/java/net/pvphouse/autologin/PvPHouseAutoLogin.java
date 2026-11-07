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
	/** Give the server (AuthMe) a moment after the join before sending the command. */
	private static final long SEND_DELAY_MS = 1500L;

	private static volatile String sHost;
	private static volatile int sPort = 25565;
	private static volatile String sPassword;
	private static volatile boolean sRegister;

	@Override
	public void onInitializeClient() {
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

	/** Called on the client thread after the game "login" packet was handled. */
	public static void onJoinedServer(ClientPacketListener connection) {
		if (sPassword == null || sHost == null) return;
		if (!isPvPHouse(connection.getServerData())) return;

		final String command = sRegister
				? "register " + sPassword + " " + sPassword
				: "login " + sPassword;
		final boolean wasRegister = sRegister;

		Thread sender = new Thread(() -> {
			try {
				Thread.sleep(SEND_DELAY_MS);
			} catch (InterruptedException e) {
				return;
			}
			Minecraft minecraft = Minecraft.getInstance();
			minecraft.execute(() -> {
				ClientPacketListener current = minecraft.getConnection();
				// Re-check: the player may have left or switched servers during the delay
				if (current == null || !isPvPHouse(current.getServerData())) return;
				current.sendCommand(command);
				LOGGER.info("Sent /{} to PvPHouse", wasRegister ? "register" : "login");
				if (wasRegister) sRegister = false; // later joins in this session use /login
			});
		}, "PvPHouse-AutoLogin");
		sender.setDaemon(true);
		sender.start();
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
