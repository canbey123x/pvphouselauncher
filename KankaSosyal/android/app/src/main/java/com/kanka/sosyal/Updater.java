package com.kanka.sosyal;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.widget.Toast;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Uygulama içinden güncelleme.
 * GitHub Releases'teki "kanka-latest" sürümünde duran version.txt dosyasındaki numara,
 * kurulu sürümden büyükse kullanıcıya sorar; onaylarsa yeni APK'yı indirip kurulum ekranını açar.
 */
public class Updater {
    private static final String BASE = "https://github.com/canbey123x/pvphouselauncher/releases/download/kanka-latest/";
    private static final String VERSION_URL = BASE + "version.txt";
    private static final String APK_URL = BASE + "Kanka.apk";

    private final Activity act;
    private long downloadId = -1;
    private BroadcastReceiver receiver;
    private Uri pendingInstall;

    public Updater(Activity act) {
        this.act = act;
    }

    public int currentVersion() {
        try {
            PackageInfo pi = act.getPackageManager().getPackageInfo(act.getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? (int) pi.getLongVersionCode() : pi.versionCode;
        } catch (Exception e) {
            return 0;
        }
    }

    /** Arka planda yeni sürüm var mı bak. silent=false ise "güncelsin" bilgisini de göster. */
    public void check(final boolean silent) {
        new Thread(() -> {
            int latest = fetchLatest();
            int cur = currentVersion();
            act.runOnUiThread(() -> {
                if (act.isFinishing()) return;
                if (latest > cur) ask(latest);
                else if (!silent) {
                    Toast.makeText(act, latest < 0 ? "Güncelleme sunucusuna ulaşılamadı" : "Uygulama güncel (sürüm " + cur + ")", Toast.LENGTH_SHORT).show();
                }
            });
        }).start();
    }

    private int fetchLatest() {
        HttpURLConnection c = null;
        try {
            URL url = new URL(VERSION_URL + "?t=" + System.currentTimeMillis());
            for (int i = 0; i < 5; i++) {
                c = (HttpURLConnection) url.openConnection();
                c.setInstanceFollowRedirects(false);
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                c.setUseCaches(false);
                int code = c.getResponseCode();
                if (code >= 300 && code < 400) {
                    String loc = c.getHeaderField("Location");
                    c.disconnect();
                    if (loc == null) return -1;
                    url = new URL(url, loc);
                    continue;
                }
                if (code != 200) return -1;
                BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream()));
                String line = r.readLine();
                r.close();
                return line == null ? -1 : Integer.parseInt(line.trim());
            }
        } catch (Exception e) {
            return -1;
        } finally {
            if (c != null) c.disconnect();
        }
        return -1;
    }

    private void ask(int latest) {
        new AlertDialog.Builder(act)
                .setTitle("Güncelleme var")
                .setMessage("Kanka'nın yeni sürümü hazır (sürüm " + latest + "). Şimdi güncellensin mi?")
                .setPositiveButton("Güncelle", (d, w) -> download(latest))
                .setNegativeButton("Sonra", null)
                .show();
    }

    private void download(int latest) {
        try {
            DownloadManager dm = (DownloadManager) act.getSystemService(Context.DOWNLOAD_SERVICE);
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(APK_URL + "?v=" + latest));
            req.setTitle("Kanka güncelleniyor");
            req.setDescription("Sürüm " + latest);
            req.setMimeType("application/vnd.android.package-archive");
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalFilesDir(act, Environment.DIRECTORY_DOWNLOADS, "Kanka-" + latest + "-" + System.currentTimeMillis() + ".apk");
            registerReceiver();
            downloadId = dm.enqueue(req);
            Toast.makeText(act, "Güncelleme indiriliyor...", Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            openInBrowser();
        }
    }

    private void registerReceiver() {
        if (receiver != null) return;
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (id != downloadId) return;
                DownloadManager dm = (DownloadManager) act.getSystemService(Context.DOWNLOAD_SERVICE);
                Uri uri = dm.getUriForDownloadedFile(id);
                if (uri == null) {
                    Toast.makeText(act, "İndirme başarısız oldu", Toast.LENGTH_LONG).show();
                    return;
                }
                install(uri);
            }
        };
        IntentFilter f = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) act.registerReceiver(receiver, f, Context.RECEIVER_EXPORTED);
        else act.registerReceiver(receiver, f);
    }

    private void install(Uri uri) {
        if (Build.VERSION.SDK_INT >= 26 && !act.getPackageManager().canRequestPackageInstalls()) {
            // Önce "bilinmeyen uygulamaları yükle" izni; kullanıcı geri dönünce kurulum devam eder
            pendingInstall = uri;
            Toast.makeText(act, "Güncellemeyi kurmak için Kanka'ya izin ver, sonra geri dön", Toast.LENGTH_LONG).show();
            act.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + act.getPackageName())));
            return;
        }
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            act.startActivity(i);
        } catch (Exception e) {
            openInBrowser();
        }
    }

    /** İzin ekranından dönünce bekleyen kurulumu sürdür. */
    public void onResume() {
        if (pendingInstall != null && (Build.VERSION.SDK_INT < 26 || act.getPackageManager().canRequestPackageInstalls())) {
            Uri u = pendingInstall;
            pendingInstall = null;
            install(u);
        }
    }

    private void openInBrowser() {
        try {
            act.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(APK_URL)));
        } catch (Exception ignored) {
            // tarayıcı yok
        }
    }

    public void destroy() {
        if (receiver != null) {
            try {
                act.unregisterReceiver(receiver);
            } catch (Exception ignored) {
                // zaten kayıtlı değil
            }
            receiver = null;
        }
    }
}
