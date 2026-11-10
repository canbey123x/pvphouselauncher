package com.kanka.sosyal;

import android.app.Activity;
import android.content.pm.PackageInfo;
import android.os.Build;

/**
 * Google Play sürümü: güncellemeleri Play yapar, uygulama kendini güncellemez.
 * GitHub sürümündeki Updater ile aynı arayüz, işlevler boş.
 */
public class Updater {
    private final Activity act;

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

    public void check(boolean silent) {
        // Play sürümünde güncellemeyi Google Play yapar
    }

    public void onResume() {
    }

    public void destroy() {
    }
}
