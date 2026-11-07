package net.kdt.pojavlaunch.pvphouse;

import androidx.annotation.Nullable;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

/**
 * PvPHouse Launcher: Minecraft "Server List Ping" (Java Edition, 1.7+ protocol).
 * Blocking - call it from a background thread.
 */
public final class ServerStatusPinger {
    private static final int TIMEOUT_MS = 5000;
    /** Any value works for a status request; -1 is the conventional "unknown" version. */
    private static final int STATUS_PROTOCOL_VERSION = -1;
    private static final int MAX_PACKET_LENGTH = 2 * 1024 * 1024;

    private ServerStatusPinger() {}

    public static final class Result {
        public final boolean online;
        public final int playersOnline;
        public final int playersMax;
        /** Round-trip time of the ping packet, -1 if unknown. */
        public final long pingMs;
        /** MOTD as plain text (formatting codes removed), may be empty. */
        public final String motd;
        @Nullable public final String versionName;
        public final long timestamp;

        private Result(boolean online, int playersOnline, int playersMax, long pingMs, String motd, @Nullable String versionName) {
            this.online = online;
            this.playersOnline = playersOnline;
            this.playersMax = playersMax;
            this.pingMs = pingMs;
            this.motd = motd;
            this.versionName = versionName;
            this.timestamp = System.currentTimeMillis();
        }

        static Result offline() {
            return new Result(false, 0, 0, -1, "", null);
        }
    }

    /** Never throws: any failure is reported as an offline result. */
    public static Result ping(String host, int port) {
        try {
            return pingOrThrow(host, port);
        } catch (Exception e) {
            return Result.offline();
        }
    }

    static Result pingOrThrow(String host, int port) throws IOException, JSONException {
        try (Socket socket = new Socket()) {
            socket.setSoTimeout(TIMEOUT_MS);
            socket.setTcpNoDelay(true);
            socket.connect(new InetSocketAddress(host, port), TIMEOUT_MS);
            OutputStream out = socket.getOutputStream();
            DataInputStream in = new DataInputStream(socket.getInputStream());

            // Handshake (id 0x00) with next state = 1 (status)
            ByteArrayOutputStream handshake = new ByteArrayOutputStream();
            writeVarInt(handshake, 0x00);
            writeVarInt(handshake, STATUS_PROTOCOL_VERSION);
            writeString(handshake, host);
            handshake.write((port >> 8) & 0xFF);
            handshake.write(port & 0xFF);
            writeVarInt(handshake, 1);
            writePacket(out, handshake.toByteArray());

            // Status request (id 0x00, empty)
            writePacket(out, new byte[]{0x00});

            // Status response (id 0x00, JSON string)
            readVarInt(in); // packet length
            int id = readVarInt(in);
            if (id != 0x00) throw new IOException("Unexpected status packet id " + id);
            int jsonLength = readVarInt(in);
            if (jsonLength < 0 || jsonLength > MAX_PACKET_LENGTH) throw new IOException("Bad status length");
            byte[] jsonBytes = new byte[jsonLength];
            in.readFully(jsonBytes);
            JSONObject status = new JSONObject(new String(jsonBytes, StandardCharsets.UTF_8));

            // Ping (id 0x01, long payload) -> pong
            long pingMs = -1;
            try {
                long payload = System.currentTimeMillis();
                ByteArrayOutputStream ping = new ByteArrayOutputStream();
                writeVarInt(ping, 0x01);
                new DataOutputStream(ping).writeLong(payload);
                long start = System.nanoTime();
                writePacket(out, ping.toByteArray());
                readVarInt(in);
                int pongId = readVarInt(in);
                long echoed = in.readLong();
                if (pongId == 0x01 && echoed == payload) pingMs = (System.nanoTime() - start) / 1_000_000L;
            } catch (IOException ignored) {
                // Some proxies close after the status response; status itself is still valid
            }

            JSONObject players = status.optJSONObject("players");
            int online = players == null ? 0 : players.optInt("online", 0);
            int max = players == null ? 0 : players.optInt("max", 0);
            JSONObject version = status.optJSONObject("version");
            String versionName = version == null ? null : version.optString("name", null);
            String motd = stripFormatting(componentToText(status.opt("description"))).trim();
            return new Result(true, online, max, pingMs, motd, versionName);
        }
    }

    // ---------------------------------------------------------------- helpers

    /** Flattens a chat component (string, object with text/extra, or array) to plain text. */
    static String componentToText(Object component) {
        StringBuilder builder = new StringBuilder();
        appendComponent(builder, component, 0);
        return builder.toString();
    }

    private static void appendComponent(StringBuilder builder, Object component, int depth) {
        if (component == null || depth > 32) return;
        if (component instanceof String) {
            builder.append((String) component);
        } else if (component instanceof JSONObject) {
            JSONObject object = (JSONObject) component;
            builder.append(object.optString("text", ""));
            JSONArray extra = object.optJSONArray("extra");
            if (extra != null) for (int i = 0; i < extra.length(); i++) appendComponent(builder, extra.opt(i), depth + 1);
        } else if (component instanceof JSONArray) {
            JSONArray array = (JSONArray) component;
            for (int i = 0; i < array.length(); i++) appendComponent(builder, array.opt(i), depth + 1);
        }
    }

    /** Removes legacy section-sign formatting codes such as "§c" or "§l". */
    static String stripFormatting(String text) {
        StringBuilder builder = new StringBuilder(text.length());
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '§' && i + 1 < text.length()) { i++; continue; }
            builder.append(c);
        }
        return builder.toString();
    }

    private static void writePacket(OutputStream out, byte[] data) throws IOException {
        ByteArrayOutputStream packet = new ByteArrayOutputStream(data.length + 5);
        writeVarInt(packet, data.length);
        packet.write(data);
        out.write(packet.toByteArray());
        out.flush();
    }

    private static void writeString(ByteArrayOutputStream out, String value) throws IOException {
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        writeVarInt(out, bytes.length);
        out.write(bytes);
    }

    static void writeVarInt(ByteArrayOutputStream out, int value) {
        while (true) {
            if ((value & ~0x7F) == 0) {
                out.write(value);
                return;
            }
            out.write((value & 0x7F) | 0x80);
            value >>>= 7;
        }
    }

    static int readVarInt(InputStream in) throws IOException {
        int value = 0;
        for (int position = 0; position < 35; position += 7) {
            int b = in.read();
            if (b == -1) throw new IOException("Stream closed while reading VarInt");
            value |= (b & 0x7F) << position;
            if ((b & 0x80) == 0) return value;
        }
        throw new IOException("VarInt too big");
    }
}
