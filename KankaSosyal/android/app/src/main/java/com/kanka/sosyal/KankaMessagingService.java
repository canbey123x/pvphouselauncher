package com.kanka.sosyal;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Firebase'den gelen bildirimler. Sunucu sadece "data" mesajı gönderir; bildirimi burada
 * kendimiz çizeriz. Gelen arama, telefon kilitli olsa bile tam ekran arama ekranını açar.
 */
public class KankaMessagingService extends FirebaseMessagingService {

    @Override
    public void onNewToken(String token) {
        Push.prefs(this).edit().putString("push_token", token).apply();
    }

    @Override
    public void onMessageReceived(RemoteMessage msg) {
        Map<String, String> d = msg.getData();
        if (d == null || d.isEmpty()) return;
        String type = d.get("type");
        if ("call".equals(type)) {
            // 40 saniyeden eski arama artık çalmaz
            try {
                long t = java.time.Instant.parse(d.get("created_at")).toEpochMilli();
                if (System.currentTimeMillis() - t > 40000) return;
            } catch (Exception ignored) {
                // tarih yoksa yine göster
            }
            // uygulama zaten açıksa arama ekranını uygulama gösterir
            if (MainActivity.visible) return;
            Push.incomingCall(this, d);
        } else if ("call_end".equals(type)) {
            String ringing = Push.prefs(this).getString("ringing_call", "");
            if (ringing.equals(d.get("call_id"))) Push.cancelCall(this);
        } else {
            if ("message".equals(type) && MainActivity.visible) return; // uygulama açıkken mesaj zaten görünür
            Push.simple(this, d);
        }
    }
}
