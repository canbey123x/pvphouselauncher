package com.kanka.sosyal;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.Intent;
import android.media.AudioManager;
import android.content.pm.PackageManager;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.widget.FrameLayout;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

/**
 * Kanka web uygulamasını bir WebView içinde çalıştırır.
 * Dosyalar APK'nın assets/www klasöründen https://appassets.androidplatform.net
 * adresiyle sunulur. Foto/video/GIF seçmek için dosya seçici desteklenir.
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/assets/www/index.html";
    private static final int PICK = 41;
    private static final int CAM = 42;
    private static final int MIC = 43;
    private static final int STARTUP = 44;
    private PermissionRequest pendingCam;
    private PermissionRequest pendingMic;
    /** Uygulama ekranda mı (açıkken gelen aramayı web tarafı gösterir). */
    static volatile boolean visible = false;
    private volatile boolean inCall = false;
    private volatile String pendingPayload = null;
    private FrameLayout rootView;

    private WebView web;
    private ValueCallback<Uri[]> pending;
    private Updater updater;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setBackgroundColor(0xFF000000);
        // WebView kendi iç boşluğunu (padding) dikkate almaz; bu yüzden onu siyah bir kapsayıcıya
        // koyup boşluğu kapsayıcıya veriyoruz.
        FrameLayout root = new FrameLayout(this);
        rootView = root;
        root.setBackgroundColor(0xFF000000);
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        // Android 15+ uygulamayı kenardan kenara çizer: durum çubuğu, gezinme çubuğu ve klavye
        // kadar boşluk bırak ki içerik (alt menü dahil) sistem çubuklarının altında kalmasın.
        if (Build.VERSION.SDK_INT >= 30) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                Insets ime = insets.getInsets(WindowInsets.Type.ime());
                v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
                return WindowInsets.CONSUMED;
            });
            root.requestApplyInsets();
            // Siyah zemin üstünde açık renkli sistem simgeleri
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) c.setSystemBarsAppearance(0, WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        }
        if (Build.VERSION.SDK_INT >= 29) {
            // Gezinme çubuğundaki yarı saydam gri katmanı kapat
            getWindow().setNavigationBarContrastEnforced(false);
            getWindow().setStatusBarContrastEnforced(false);
        }

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setSupportZoom(false);
        s.setTextZoom(100);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (HOST.equals(uri.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                    // açacak uygulama yok
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            /** Kamera: sadece mavi tik selfie'si için, kullanıcı "Kamerayla çek"e basınca. */
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                if (!HOST.equals(request.getOrigin().getHost())) {
                    request.deny();
                    return;
                }
                boolean wantsCam = false, wantsMic = false;
                for (String r : request.getResources()) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) wantsCam = true;
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) wantsMic = true;
                }
                if (wantsMic && !wantsCam) {
                    // sesli arama / sesli mesaj
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                    } else {
                        pendingMic = request;
                        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MIC);
                    }
                    return;
                }
                if (!wantsCam) {
                    request.deny();
                    return;
                }
                // kamera: sadece mavi tik selfie'si için
                if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                } else {
                    pendingCam = request;
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, CAM);
                }
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pending != null) pending.onReceiveValue(null);
                pending = callback;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                String[] types = params.getAcceptTypes();
                String accept = types != null && types.length > 0 ? String.join(",", types) : "";
                if (accept.contains("video") && accept.contains("image")) {
                    i.setType("*/*");
                    i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/*", "video/*"});
                } else if (accept.contains("video")) {
                    i.setType("video/*");
                } else if (accept.contains("gif")) {
                    i.setType("image/gif");
                } else {
                    i.setType("image/*");
                }
                try {
                    startActivityForResult(Intent.createChooser(i, "Seç"), PICK);
                } catch (Exception e) {
                    pending = null;
                    return false;
                }
                return true;
            }
        });

        // Uygulama içinden güncelleme: açılışta sessizce kontrol et, web tarafına da aç
        updater = new Updater(this);
        web.addJavascriptInterface(new Bridge(), "KankaAndroid");

        Push.channels(this);
        readIntent(getIntent());
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START_URL);
        updater.check(true);
        fetchPushToken();
    }

    /** Firebase anahtarını al (google-services.json ile derlendiyse). */
    private void fetchPushToken() {
        if (!BuildConfig.HAS_FIREBASE) return;
        try {
            com.google.firebase.messaging.FirebaseMessaging.getInstance().getToken()
                    .addOnSuccessListener(t -> Push.prefs(this).edit().putString("push_token", t).apply());
        } catch (Exception ignored) {
            // Firebase kurulmamış
        }
    }

    /** Bildirim / bağlantı ile açıldıysa web tarafına iletilecek bilgiyi hazırla. */
    private void readIntent(Intent i) {
        if (i == null) return;
        String p = i.getStringExtra("kanka_payload");
        if (p == null && i.getData() != null) {
            Uri u = i.getData();
            String path = u.getPath() == null ? "" : u.getPath();
            String user = null;
            String hash = null;
            if (path.startsWith("/@")) user = path.substring(2).replace("/", "");
            else if ("kanka".equals(u.getScheme()) && "u".equals(u.getHost())) user = path.replace("/", "");
            else if ("kanka".equals(u.getScheme()) && "open".equals(u.getHost())) hash = u.getQueryParameter("h");
            else if (u.getFragment() != null) hash = "#" + u.getFragment();
            try {
                if (user != null && user.matches("[A-Za-z0-9_.]{2,30}")) p = new JSONObject().put("username", user.toLowerCase()).toString();
                else if (hash != null && hash.startsWith("#/") && hash.length() < 200) p = new JSONObject().put("hash", hash).toString();
            } catch (Exception ignored) {
                // olmaz
            }
        }
        if (p == null) return;
        i.removeExtra("kanka_payload");
        pendingPayload = p;
        try {
            if (new JSONObject(p).has("call_id")) Push.cancelCall(this);
        } catch (Exception ignored) {
            // bozuk
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        readIntent(intent);
        if (pendingPayload != null && web != null) {
            // sayfa açıksa hemen ilet (yoksa sayfa açılınca takeIntent ile alır)
            web.evaluateJavascript("window.__kankaIntent && window.__kankaIntent(KankaAndroid.takeIntent())", null);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == MIC && pendingMic != null) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) pendingMic.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            else pendingMic.deny();
            pendingMic = null;
            return;
        }
        if (requestCode == STARTUP) {
            askFullScreen();
            return;
        }
        if (requestCode != CAM || pendingCam == null) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) pendingCam.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
        else pendingCam.deny();
        pendingCam = null;
    }

    /** Web tarafından çağrılabilen küçük köprü (Ayarlar > Güncellemeleri denetle). */
    private class Bridge {
        @JavascriptInterface
        public boolean selfUpdate() {
            return BuildConfig.SELF_UPDATE;
        }

        @JavascriptInterface
        public int version() {
            return updater.currentVersion();
        }

        @JavascriptInterface
        public void checkUpdate() {
            runOnUiThread(() -> updater.check(false));
        }

        /** Android paylaş menüsü. */
        @JavascriptInterface
        public void share(String text) {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, text);
                try {
                    startActivity(Intent.createChooser(i, "Paylaş"));
                } catch (Exception ignored) {
                    // paylaşacak uygulama yok
                }
            });
        }

        /** Arama sırasında hoparlör aç/kapa. */
        @JavascriptInterface
        public void setSpeaker(boolean on) {
            AudioManager am = getSystemService(AudioManager.class);
            if (am == null) return;
            am.setMode(on || inCall ? AudioManager.MODE_IN_COMMUNICATION : AudioManager.MODE_NORMAL);
            am.setSpeakerphoneOn(on);
        }

        /** Arama başladı / bitti: arka plana geçince ses kesilmesin. */
        @JavascriptInterface
        public void setInCall(boolean on) {
            inCall = on;
            AudioManager am = getSystemService(AudioManager.class);
            if (am != null) {
                am.setMode(on ? AudioManager.MODE_IN_COMMUNICATION : AudioManager.MODE_NORMAL);
                if (!on) am.setSpeakerphoneOn(false);
            }
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        /** Mikrofon izni var mı? Yoksa bir kez sor ve false dön. */
        @JavascriptInterface
        public boolean ensureMic() {
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) return true;
            runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MIC));
            return false;
        }

        @JavascriptInterface
        public String pushToken() {
            return Push.prefs(MainActivity.this).getString("push_token", "");
        }

        /** Sunucu adresi (kilit ekranından aramayı reddetmek için). */
        @JavascriptInterface
        public void setSession(String url, String key, String token, String uid) {
            Push.prefs(MainActivity.this).edit().putString("sb_url", url).putString("sb_key", key).putString("uid", uid).apply();
        }

        /** Bildirimden gelinen bilgiyi (bir kez) ver. */
        @JavascriptInterface
        public String takeIntent() {
            String p = pendingPayload;
            pendingPayload = null;
            return p == null ? "" : p;
        }

        /** Açık tema: sistem çubuğu simgeleri koyu olsun. */
        @JavascriptInterface
        public void setLightBars(boolean light) {
            runOnUiThread(() -> applyBars(light));
        }

        /** İlk açılışta tek seferlik: bildirim + mikrofon izni (arama ve sesli mesaj için). */
        @JavascriptInterface
        public void requestStartupPermissions() {
            runOnUiThread(() -> {
                java.util.ArrayList<String> ask = new java.util.ArrayList<>();
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) ask.add(Manifest.permission.POST_NOTIFICATIONS);
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) ask.add(Manifest.permission.RECORD_AUDIO);
                if (ask.isEmpty()) askFullScreen();
                else requestPermissions(ask.toArray(new String[0]), STARTUP);
            });
        }
    }

    private void applyBars(boolean light) {
        int c = light ? 0xFFFFFFFF : 0xFF000000;
        if (rootView != null) rootView.setBackgroundColor(c);
        if (web != null) web.setBackgroundColor(c);
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController ic = getWindow().getInsetsController();
            int m = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            if (ic != null) ic.setSystemBarsAppearance(light ? m : 0, m);
        }
    }

    /** Android 14+: kilit ekranında tam ekran arama izni kapalıysa ayar sayfasını aç (genelde açıktır). */
    private void askFullScreen() {
        if (Build.VERSION.SDK_INT < 34) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null || nm.canUseFullScreenIntent()) return;
        try {
            startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + getPackageName())));
        } catch (Exception ignored) {
            // ayar sayfası yok
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK || pending == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null && data.getData() != null) result = new Uri[]{data.getData()};
        pending.onReceiveValue(result);
        pending = null;
    }

    /** Geri tuşu: uygulama içinde geri git; ana sayfadaysa çık. */
    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript("(window.__androidBack ? window.__androidBack() : false)", value -> {
            if (!"true".equals(value)) finish();
        });
    }

    @Override
    protected void onPause() {
        super.onPause();
        visible = false;
        if (web != null && !inCall) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        visible = true;
        if (web != null) web.onResume();
        if (updater != null) updater.onResume();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (updater != null) updater.destroy();
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
