package net.kdt.pojavlaunch.pvphouse;

import android.util.Log;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.LinkedHashMap;
import java.util.Locale;

/**
 * PvPHouse Launcher: makes sure the PvPHouse server is in the game's multiplayer list (servers.dat).
 * Existing entries are preserved untouched; the server is added at the top only when no entry
 * points to it yet, so calling this repeatedly never creates duplicates.
 */
public final class ServersDat {
    private static final String TAG = "PvPHouseServersDat";

    private ServersDat() {}

    /** @return true if the file was changed. */
    public static synchronized boolean ensureServer(File gameDir, String name, String host, int port) throws IOException {
        File file = new File(gameDir, "servers.dat");
        Nbt.Root root = readOrCreate(file);

        Object serversTag = root.compound.get("servers");
        Nbt.TagList servers;
        if (serversTag instanceof Nbt.TagList) {
            servers = (Nbt.TagList) serversTag;
        } else {
            servers = new Nbt.TagList(Nbt.COMPOUND);
            root.compound.put("servers", servers);
        }

        for (Object entry : servers.items) {
            if (!(entry instanceof java.util.Map)) continue;
            Object ip = ((java.util.Map<?, ?>) entry).get("ip");
            if (ip instanceof String && sameServer((String) ip, host, port)) return false;
        }

        LinkedHashMap<String, Object> server = new LinkedHashMap<>();
        server.put("name", name);
        server.put("ip", port == 25565 ? host : host + ":" + port);
        servers.elementType = Nbt.COMPOUND;
        servers.items.add(0, server);

        writeAtomically(file, root);
        Log.i(TAG, "Added " + host + " to " + file);
        return true;
    }

    private static Nbt.Root readOrCreate(File file) {
        if (file.isFile() && file.length() > 0) {
            try (InputStream in = new BufferedInputStream(new FileInputStream(file))) {
                return Nbt.read(in);
            } catch (IOException e) {
                // Keep the unreadable file for the user instead of silently destroying it
                File backup = new File(file.getParentFile(), "servers.dat.corrupt");
                Log.w(TAG, "servers.dat unreadable, moving it to " + backup, e);
                //noinspection ResultOfMethodCallIgnored
                file.renameTo(backup);
            }
        }
        return new Nbt.Root("", new LinkedHashMap<>());
    }

    private static void writeAtomically(File file, Nbt.Root root) throws IOException {
        File parent = file.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
            throw new IOException("Cannot create " + parent);
        }
        File tmp = new File(parent, "servers.dat.pvphouse_tmp");
        try (OutputStream out = new BufferedOutputStream(new FileOutputStream(tmp))) {
            Nbt.write(root, out);
        }
        if (!tmp.renameTo(file)) {
            // renameTo does not replace on every filesystem
            if (file.exists() && !file.delete()) throw new IOException("Cannot replace " + file);
            if (!tmp.renameTo(file)) throw new IOException("Cannot write " + file);
        }
    }

    /** "mc.pvphouse.net", "MC.PVPHOUSE.NET:25565" and "mc.pvphouse.net." all count as the same server. */
    static boolean sameServer(String entryIp, String host, int port) {
        String ip = entryIp.trim().toLowerCase(Locale.ROOT);
        int entryPort = 25565;
        int colon = ip.lastIndexOf(':');
        if (colon > 0 && ip.indexOf(':') == colon) { // ignore IPv6 literals
            try {
                entryPort = Integer.parseInt(ip.substring(colon + 1));
                ip = ip.substring(0, colon);
            } catch (NumberFormatException ignored) {}
        }
        if (ip.endsWith(".")) ip = ip.substring(0, ip.length() - 1);
        return ip.equals(host.toLowerCase(Locale.ROOT)) && entryPort == port;
    }
}
