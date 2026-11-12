package com.kanka.sosyal;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/** Bildirim kanalları, kayıtlı oturum bilgisi ve arama bildirimleri için ortak yardımcılar. */
final class Push {
    static final String PREFS = "kanka";
    static final String CH_GENERAL = "kanka_genel";
    static final String CH_MSG = "kanka_mesaj";
    static final String CH_CALL = "kanka_arama";
    static final int CALL_NOTIF = 7001;

    private Push() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel g = new NotificationChannel(CH_GENERAL, "Bildirimler", NotificationManager.IMPORTANCE_HIGH);
        g.setDescription("Beğeni, yorum, takip, etiket");
        nm.createNotificationChannel(g);
        NotificationChannel m = new NotificationChannel(CH_MSG, "Mesajlar", NotificationManager.IMPORTANCE_HIGH);
        m.setDescription("Özel ve grup mesajları");
        nm.createNotificationChannel(m);
        NotificationChannel call = new NotificationChannel(CH_CALL, "Gelen aramalar", NotificationManager.IMPORTANCE_HIGH);
        call.setDescription("Sesli arama: telefon kilitliyken de tam ekran");
        call.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        call.enableVibration(true);
        call.setVibrationPattern(new long[]{0, 800, 600, 800, 600});
        call.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        call.setBypassDnd(false);
        nm.createNotificationChannel(call);
    }

    /** Uygulamayı açan bildirim tıklaması (web tarafı JSON'u okuyup ilgili sayfaya gider). */
    static PendingIntent openApp(Context c, JSONObject payload, int req) {
        Intent i = new Intent(c, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        i.putExtra("kanka_payload", payload.toString());
        return PendingIntent.getActivity(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static JSONObject json(Map<String, String> data) {
        JSONObject o = new JSONObject();
        try {
            for (Map.Entry<String, String> e : data.entrySet()) o.put(e.getKey(), e.getValue());
        } catch (Exception ignored) {
            // olmaz
        }
        return o;
    }

    /** Normal bildirim (beğeni, mesaj, cevapsız arama...). */
    static void simple(Context c, Map<String, String> data) {
        channels(c);
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        String type = data.containsKey("type") ? data.get("type") : "notif";
        String tag = data.containsKey("tag") ? data.get("tag") : type;
        String ch = "message".equals(type) ? CH_MSG : CH_GENERAL;
        int id = tag.hashCode();
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, ch) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat_kanka)
                .setColor(0xFFEE2A7B)
                .setContentTitle(val(data, "title", "Kanka"))
                .setContentText(val(data, "body", ""))
                .setStyle(new Notification.BigTextStyle().bigText(val(data, "body", "")))
                .setAutoCancel(true)
                .setCategory("message".equals(type) ? Notification.CATEGORY_MESSAGE : Notification.CATEGORY_SOCIAL)
                .setContentIntent(openApp(c, json(data), id));
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        nm.notify(tag, 1, b.build());
    }

    static String val(Map<String, String> d, String k, String def) {
        String v = d.get(k);
        return v == null || v.isEmpty() ? def : v;
    }

    /** Gelen arama: kilit ekranında tam ekran açılan, çalan bildirim. */
    static void incomingCall(Context c, Map<String, String> data) {
        channels(c);
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        String callId = val(data, "call_id", "");
        String name = val(data, "name", "Kanka");
        Intent full = new Intent(c, IncomingCallActivity.class);
        full.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
        for (Map.Entry<String, String> e : data.entrySet()) full.putExtra(e.getKey(), e.getValue());
        PendingIntent fullPi = PendingIntent.getActivity(c, 1, full, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        JSONObject ans = json(data);
        try {
            ans.put("action", "answer");
        } catch (Exception ignored) {
            // olmaz
        }
        PendingIntent answerPi = openApp(c, ans, 2);
        Intent dec = new Intent(c, CallActionReceiver.class);
        dec.putExtra("call_id", callId);
        PendingIntent declinePi = PendingIntent.getBroadcast(c, 3, dec, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CH_CALL) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat_kanka)
                .setColor(0xFF34C759)
                .setContentTitle(name)
                .setContentText(val(data, "group_call_id", "").isEmpty() ? ("video".equals(data.get("kind")) ? "Kanka görüntülü arama" : "Kanka sesli arama") : "Grup araması")
                .setCategory(Notification.CATEGORY_CALL)
                .setOngoing(true)
                .setAutoCancel(false)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setFullScreenIntent(fullPi, true)
                .setContentIntent(fullPi)
                .addAction(new Notification.Action.Builder(null, "Reddet", declinePi).build())
                .addAction(new Notification.Action.Builder(null, "Cevapla", answerPi).build());
        if (Build.VERSION.SDK_INT >= 26) b.setTimeoutAfter(40000);
        else b.setPriority(Notification.PRIORITY_MAX).setDefaults(Notification.DEFAULT_ALL);
        Notification n = b.build();
        n.flags |= Notification.FLAG_INSISTENT;
        nm.notify(CALL_NOTIF, n);
        prefs(c).edit().putString("ringing_call", callId).apply();
    }

    static void cancelCall(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(CALL_NOTIF);
        prefs(c).edit().remove("ringing_call").apply();
        c.sendBroadcast(new Intent(IncomingCallActivity.ACTION_CLOSE).setPackage(c.getPackageName()));
    }

    /** Uygulamayı açmadan aramayı reddet (sunucudaki decline_call fonksiyonu). */
    static void decline(Context c, String callId) {
        final SharedPreferences p = prefs(c);
        final String url = p.getString("sb_url", "");
        final String key = p.getString("sb_key", "");
        cancelCall(c);
        if (url.isEmpty() || key.isEmpty() || callId == null || callId.isEmpty()) return;
        new Thread(() -> {
            try {
                HttpURLConnection h = (HttpURLConnection) new URL(url + "/rest/v1/rpc/decline_call").openConnection();
                h.setRequestMethod("POST");
                h.setConnectTimeout(10000);
                h.setReadTimeout(10000);
                h.setDoOutput(true);
                h.setRequestProperty("apikey", key);
                h.setRequestProperty("Authorization", "Bearer " + key);
                h.setRequestProperty("Content-Type", "application/json");
                try (OutputStream o = h.getOutputStream()) {
                    o.write(("{\"cid\":\"" + callId.replaceAll("[^0-9a-fA-F-]", "") + "\"}").getBytes(StandardCharsets.UTF_8));
                }
                h.getResponseCode();
                h.disconnect();
            } catch (Exception ignored) {
                // ağ yoksa arayan tarafta zaman aşımıyla düşer
            }
        }).start();
    }
}
