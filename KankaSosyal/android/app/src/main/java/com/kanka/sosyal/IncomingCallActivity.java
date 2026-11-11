package com.kanka.sosyal;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

/** Kilit ekranında da açılan tam ekran "Gelen arama" ekranı (uygulama kapalıyken). */
public class IncomingCallActivity extends Activity {
    static final String ACTION_CLOSE = "com.kanka.sosyal.CALL_CLOSE";

    private Ringtone ringtone;
    private Vibrator vibrator;
    private final Handler h = new Handler(Looper.getMainLooper());
    private String callId = "";
    private final BroadcastReceiver closer = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            stopRing();
            finish();
        }
    };

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);

        Intent in = getIntent();
        callId = str(in, "call_id");
        String name = str(in, "name");
        String user = str(in, "username");
        if (name.isEmpty()) name = user.isEmpty() ? "Kanka" : user;

        FrameLayout root = new FrameLayout(this);
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0xFF3A2A6E, 0xFF120A26, 0xFF05030C});
        root.setBackground(bg);

        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        col.setPadding(dp(24), dp(90), dp(24), dp(60));
        root.addView(col, new FrameLayout.LayoutParams(-1, -1));

        TextView av = new TextView(this);
        av.setText(name.substring(0, 1).toUpperCase());
        av.setTextColor(Color.WHITE);
        av.setTextSize(52);
        av.setTypeface(Typeface.DEFAULT_BOLD);
        av.setGravity(Gravity.CENTER);
        GradientDrawable avBg = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{0xFFF9CE34, 0xFFEE2A7B, 0xFF6228D7});
        avBg.setShape(GradientDrawable.OVAL);
        av.setBackground(avBg);
        col.addView(av, new LinearLayout.LayoutParams(dp(130), dp(130)));

        TextView nm = text(name, 28, true);
        nm.setPadding(0, dp(22), 0, 0);
        col.addView(nm);
        if (!user.isEmpty()) col.addView(text("@" + user, 15, false));
        TextView st = text("Kanka sesli arama...", 16, false);
        st.setPadding(0, dp(10), 0, 0);
        col.addView(st);

        View spacer = new View(this);
        col.addView(spacer, new LinearLayout.LayoutParams(1, 0, 1f));

        LinearLayout btns = new LinearLayout(this);
        btns.setOrientation(LinearLayout.HORIZONTAL);
        btns.setGravity(Gravity.CENTER);
        btns.addView(button("Reddet", 0xFFFF3B30, v -> decline()), new LinearLayout.LayoutParams(0, -2, 1f));
        btns.addView(button("Cevapla", 0xFF34C759, v -> answer()), new LinearLayout.LayoutParams(0, -2, 1f));
        col.addView(btns, new LinearLayout.LayoutParams(-1, -2));
        setContentView(root);

        IntentFilter f = new IntentFilter(ACTION_CLOSE);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(closer, f, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(closer, f);

        startRing();
        // 40 sn sonra cevapsız
        h.postDelayed(() -> {
            stopRing();
            Push.cancelCall(this);
            finish();
        }, 40000);
    }

    private void answer() {
        stopRing();
        Push.cancelCall(this);
        JSONObject o = new JSONObject();
        try {
            o.put("call_id", callId);
            o.put("action", "answer");
        } catch (Exception ignored) {
            // olmaz
        }
        Intent i = new Intent(this, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        i.putExtra("kanka_payload", o.toString());
        KeyguardManager km = getSystemService(KeyguardManager.class);
        if (km != null && km.isKeyguardLocked() && Build.VERSION.SDK_INT >= 26) {
            // kilidi açınca uygulamaya geç (açık arama ekranı orada devam eder)
            km.requestDismissKeyguard(this, new KeyguardManager.KeyguardDismissCallback() {
                @Override
                public void onDismissSucceeded() {
                    startActivity(i);
                    finish();
                }

                @Override
                public void onDismissCancelled() {
                    startActivity(i);
                    finish();
                }
            });
        } else {
            startActivity(i);
            finish();
        }
    }

    private void decline() {
        stopRing();
        Push.decline(this, callId);
        finish();
    }

    private void startRing() {
        try {
            ringtone = RingtoneManager.getRingtone(this, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE));
            if (ringtone != null) {
                ringtone.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build());
                if (Build.VERSION.SDK_INT >= 28) ringtone.setLooping(true);
                ringtone.play();
            }
        } catch (Exception ignored) {
            // zil sesi yok
        }
        try {
            vibrator = getSystemService(Vibrator.class);
            if (vibrator != null) vibrator.vibrate(VibrationEffect.createWaveform(new long[]{0, 800, 700}, 0));
        } catch (Exception ignored) {
            // titreşim yok
        }
    }

    private void stopRing() {
        try {
            if (ringtone != null) ringtone.stop();
            if (vibrator != null) vibrator.cancel();
        } catch (Exception ignored) {
            // zaten durdu
        }
        ringtone = null;
        vibrator = null;
    }

    @Override
    protected void onDestroy() {
        stopRing();
        h.removeCallbacksAndMessages(null);
        try {
            unregisterReceiver(closer);
        } catch (Exception ignored) {
            // kayıtlı değil
        }
        super.onDestroy();
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        // geri tuşu aramayı kapatmasın; sadece zili sustur
        stopRing();
    }

    private String str(Intent i, String k) {
        String v = i.getStringExtra(k);
        return v == null ? "" : v;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private TextView text(String s, int size, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextColor(bold ? Color.WHITE : 0xB3FFFFFF);
        t.setTextSize(size);
        t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private View button(String label, int color, View.OnClickListener on) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER_HORIZONTAL);
        android.widget.ImageView c = new android.widget.ImageView(this);
        GradientDrawable d = new GradientDrawable();
        d.setShape(GradientDrawable.OVAL);
        d.setColor(color);
        c.setBackground(d);
        c.setOnClickListener(on);
        c.setContentDescription(label);
        c.setImageResource(label.equals("Cevapla") ? R.drawable.ic_call_answer : R.drawable.ic_call_end);
        c.setScaleType(android.widget.ImageView.ScaleType.CENTER);
        box.addView(c, new LinearLayout.LayoutParams(dp(74), dp(74)));
        TextView l = text(label, 14, false);
        l.setPadding(0, dp(8), 0, 0);
        box.addView(l);
        return box;
    }
}
