package net.kdt.pojavlaunch.prefs.screens;

import android.os.Bundle;

import androidx.preference.Preference;

import net.kdt.pojavlaunch.BuildConfig;
import net.kdt.pojavlaunch.R;

/** PvPHouse Launcher: "About" screen with upstream attribution, source link and license. */
public class LauncherPreferenceAboutFragment extends LauncherPreferenceFragment {

    @Override
    public void onCreatePreferences(Bundle b, String str) {
        addPreferencesFromResource(R.xml.pref_about);
        Preference version = findPreference("about_version");
        if (version != null) version.setSummary(BuildConfig.VERSION_NAME);
    }
}
