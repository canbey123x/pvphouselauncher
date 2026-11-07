package net.kdt.pojavlaunch.prefs.screens;

import android.os.Bundle;
import android.text.TextUtils;

import androidx.appcompat.app.AlertDialog;
import androidx.preference.SwitchPreferenceCompat;

import net.kdt.pojavlaunch.R;
import net.kdt.pojavlaunch.pvphouse.PvPHousePerformancePack;

import java.util.List;

/** PvPHouse Launcher: PvPHouse-specific settings. */
public class LauncherPreferencePvPHouseFragment extends LauncherPreferenceFragment {

    @Override
    public void onCreatePreferences(Bundle b, String str) {
        addPreferencesFromResource(R.xml.pref_pvphouse);

        SwitchPreferenceCompat perfPack = requirePreference(PvPHousePerformancePack.PREF_ENABLED, SwitchPreferenceCompat.class);
        perfPack.setOnPreferenceChangeListener((preference, newValue) -> {
            boolean enabled = (Boolean) newValue;
            PvPHousePerformancePack.apply(enabled, new PvPHousePerformancePack.Listener() {
                @Override
                public void onPackApplied(boolean enabled, List<String> installed, List<String> unavailable, boolean sodiumInstalled) {
                    if (!isAdded()) return;
                    if (!enabled) {
                        new AlertDialog.Builder(requireContext())
                                .setTitle(R.string.pvphouse_perf_title)
                                .setMessage(R.string.pvphouse_perf_removed)
                                .setPositiveButton(android.R.string.ok, null).show();
                        return;
                    }
                    StringBuilder message = new StringBuilder(getString(R.string.pvphouse_perf_installed,
                            installed.isEmpty() ? "-" : TextUtils.join("\n", installed)));
                    if (!unavailable.isEmpty()) {
                        message.append("\n\n").append(getString(R.string.pvphouse_perf_unavailable,
                                net.kdt.pojavlaunch.pvphouse.PvPHouseConfig.GAME_VERSION, TextUtils.join("\n", unavailable)));
                    }
                    if (sodiumInstalled) message.append("\n\n").append(getString(R.string.pvphouse_perf_sodium_note));
                    new AlertDialog.Builder(requireContext())
                            .setTitle(R.string.pvphouse_perf_title)
                            .setMessage(message.toString())
                            .setPositiveButton(android.R.string.ok, null).show();
                }

                @Override
                public void onPackFailed(Throwable error) {
                    if (!isAdded()) return;
                    // Roll the switch back so it reflects what is actually installed
                    perfPack.setChecked(!enabled);
                    new AlertDialog.Builder(requireContext())
                            .setTitle(R.string.pvphouse_perf_title)
                            .setMessage(getString(R.string.pvphouse_perf_failed, String.valueOf(error.getMessage())))
                            .setPositiveButton(android.R.string.ok, null).show();
                }
            });
            return true;
        });
    }
}
