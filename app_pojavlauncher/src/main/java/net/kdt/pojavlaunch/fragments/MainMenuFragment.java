package net.kdt.pojavlaunch.fragments;

import android.widget.TextView;
import androidx.core.content.res.ResourcesCompat;
import net.kdt.pojavlaunch.LauncherActivity;
import net.kdt.pojavlaunch.pvphouse.PvPHouseConfig;
import net.kdt.pojavlaunch.pvphouse.PvPHouseLaunch;
import net.kdt.pojavlaunch.pvphouse.PvPHouseProfileSetup;
import net.kdt.pojavlaunch.pvphouse.PvPHouseServerStatus;
import net.kdt.pojavlaunch.pvphouse.ServerStatusPinger;
import static net.kdt.pojavlaunch.Tools.dialogOnUiThread;
import static net.kdt.pojavlaunch.Tools.hasMods;
import static net.kdt.pojavlaunch.Tools.hasNoOnlineProfileDialog;
import static net.kdt.pojavlaunch.Tools.hasOnlineProfile;
import static net.kdt.pojavlaunch.Tools.openPath;
import static net.kdt.pojavlaunch.Tools.runOnUiThread;
import static net.kdt.pojavlaunch.Tools.shareLog;

import android.app.Dialog;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.ImageButton;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.fragment.app.Fragment;

import com.kdt.mcgui.mcVersionSpinner;

import net.kdt.pojavlaunch.CustomControlsActivity;
import net.kdt.pojavlaunch.R;
import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.extra.ExtraConstants;
import net.kdt.pojavlaunch.extra.ExtraCore;
import net.kdt.pojavlaunch.modloaders.LWJGL3ifyUtils;
import net.kdt.pojavlaunch.prefs.LauncherPreferences;
import net.kdt.pojavlaunch.progresskeeper.ProgressKeeper;
import net.kdt.pojavlaunch.value.launcherprofiles.LauncherProfiles;
import net.kdt.pojavlaunch.value.launcherprofiles.MinecraftProfile;

import java.io.File;
import java.util.List;

public class MainMenuFragment extends Fragment {
    public static final String TAG = "MainMenuFragment";

    private mcVersionSpinner mVersionSpinner;

    public MainMenuFragment(){
        super(R.layout.fragment_launcher);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        Button mNewsButton = view.findViewById(R.id.news_button);
        Button mDiscordButton = view.findViewById(R.id.discord_button);
        Button mCustomControlButton = view.findViewById(R.id.custom_control_button);
        Button mInstallJarButton = view.findViewById(R.id.install_jar_button);
        Button mShareLogsButton = view.findViewById(R.id.share_logs_button);
        Button mOpenDirectoryButton = view.findViewById(R.id.open_files_button);

        ImageButton mEditProfileButton = view.findViewById(R.id.edit_profile_button);
        Button mPlayButton = view.findViewById(R.id.play_button);
        mVersionSpinner = view.findViewById(R.id.mc_version_spinner);

        mNewsButton.setOnClickListener(v -> Tools.openURL(requireActivity(), Tools.URL_HOME));
        mDiscordButton.setOnClickListener(v -> Tools.openURL(requireActivity(), getString(R.string.discord_invite)));
        mCustomControlButton.setOnClickListener(v -> startActivity(new Intent(requireContext(), CustomControlsActivity.class)));
        if (hasOnlineProfile()) {
            mInstallJarButton.setOnClickListener(v -> runInstallerWithConfirmation(false));
            mInstallJarButton.setOnLongClickListener(v -> {
                runInstallerWithConfirmation(true);
                return true;
            });
        } else mInstallJarButton.setOnClickListener(v -> hasNoOnlineProfileDialog(requireActivity()));
        mEditProfileButton.setOnClickListener(v -> mVersionSpinner.openProfileEditor(requireActivity()));

        mPlayButton.setOnClickListener(v -> startGame(false));

        // PvPHouse: server card
        setupServerCard(view);

        mShareLogsButton.setOnClickListener((v) -> shareLog(requireContext()));

        mOpenDirectoryButton.setOnClickListener((v)-> {
            if (Tools.isDemoProfile(v.getContext())){ // Say a different message when on demo profile since they might see the hidden demo folder
                hasNoOnlineProfileDialog(getActivity(), getString(R.string.demo_unsupported), getString(R.string.change_account));
            } else if (!hasOnlineProfile()) { // Otherwise display the generic pop-up to log in
                hasNoOnlineProfileDialog(requireActivity());
            } else openPath(v.getContext(), getCurrentProfileDirectory(), false);

        });


        // PvPHouse: the wiki button is hidden, so the gamepad mapper shortcut lives on the controls tile
        mCustomControlButton.setOnLongClickListener((v)->{
            Tools.swapFragment(requireActivity(), GamepadMapperFragment.class, GamepadMapperFragment.TAG, null);
            return true;
        });
    }

    /**
     * Upstream "Play" flow (incl. the Sodium warning). PvPHouse: when {@code joinServer} is true the
     * launch joins the PvPHouse server directly; the join request is only registered right before
     * the launch is actually fired, so a dismissed dialog can never leave it pending.
     */
    private void startGame(boolean joinServer) {
        Runnable launch = () -> {
            if (joinServer) PvPHouseLaunch.requestJoin();
            ExtraCore.setValue(ExtraConstants.LAUNCH_GAME, true);
        };
        if (Tools.hasMods("sodium") && !(LauncherPreferences.DEFAULT_PREF.getBoolean("sodium_override", false))) {
            AlertDialog sodiumWarningDialog = new AlertDialog.Builder(requireContext())
                    .setTitle(R.string.sodium_warning_title)
                    .setMessage(R.string.sodium_warning_message)
                    .setNeutralButton(R.string.delete_sodium, (d,w)-> {
                        Tools.deleteSodiumMods();
                        launch.run();
                    })
                    .create();
            sodiumWarningDialog.show();
        } else launch.run();
    }

    // ---------------------------------------------------------------- PvPHouse server card

    private View mStatusDot;
    private TextView mStatusText;
    private TextView mMotdText;

    private final PvPHouseServerStatus.Listener mServerStatusListener = this::showServerStatus;

    private void setupServerCard(View root) {
        mStatusDot = root.findViewById(R.id.pvphouse_status_dot);
        mStatusText = root.findViewById(R.id.pvphouse_status_text);
        mMotdText = root.findViewById(R.id.pvphouse_motd);
        TextView address = root.findViewById(R.id.pvphouse_server_address);
        address.setText(getString(R.string.pvphouse_server_subtitle, PvPHouseConfig.GAME_VERSION, PvPHouseConfig.SERVER_HOST));

        Button joinButton = root.findViewById(R.id.pvphouse_join_button);
        // MineButton forces its own background in its constructor, so set ours afterwards
        joinButton.setBackground(ResourcesCompat.getDrawable(getResources(), R.drawable.pvp_join_button_background, null));
        joinButton.setOnClickListener(v -> joinPvPHouse());
        root.findViewById(R.id.pvphouse_cosmetics_button).setOnClickListener(v ->
                Tools.swapFragment(requireActivity(), PvPHouseCosmeticsFragment.class, PvPHouseCosmeticsFragment.TAG, null));
        root.findViewById(R.id.pvphouse_site_button)
                .setOnClickListener(v -> Tools.openURL(requireActivity(), PvPHouseConfig.WEBSITE_URL));
        mStatusText.setOnClickListener(v -> PvPHouseServerStatus.refreshNow());
    }

    /** "Join PvPHouse": select the PvPHouse profile and launch straight into the server. */
    private void joinPvPHouse() {
        if (!PvPHouseProfileSetup.isProfileReady()) {
            Toast.makeText(requireContext(), R.string.pvphouse_profile_not_ready, Toast.LENGTH_LONG).show();
            if (requireActivity() instanceof LauncherActivity) ((LauncherActivity) requireActivity()).ensurePvPHouseProfile();
            return;
        }
        mVersionSpinner.reloadAndSelectProfile(PvPHouseConfig.PROFILE_KEY);
        startGame(true);
    }

    private void showServerStatus(@Nullable ServerStatusPinger.Result result) {
        if (mStatusText == null || !isAdded()) return;
        if (result == null) {
            mStatusDot.setBackgroundResource(R.drawable.pvp_status_dot_unknown);
            mStatusText.setText(R.string.pvphouse_status_checking);
            mMotdText.setVisibility(View.GONE);
            return;
        }
        if (!result.online) {
            mStatusDot.setBackgroundResource(R.drawable.pvp_status_dot_offline);
            mStatusText.setText(R.string.pvphouse_status_offline);
            mMotdText.setVisibility(View.GONE);
            return;
        }
        mStatusDot.setBackgroundResource(R.drawable.pvp_status_dot_online);
        String players = getString(R.string.pvphouse_status_players, result.playersOnline, result.playersMax);
        String text = getString(R.string.pvphouse_status_online) + " \u00B7 " + players;
        if (result.pingMs >= 0) text += " \u00B7 " + getString(R.string.pvphouse_status_ping, result.pingMs);
        mStatusText.setText(text);
        if (result.motd.isEmpty()) {
            mMotdText.setVisibility(View.GONE);
        } else {
            mMotdText.setText(result.motd);
            mMotdText.setVisibility(View.VISIBLE);
        }
    }

    private File getCurrentProfileDirectory() {
        String currentProfile = LauncherPreferences.DEFAULT_PREF.getString(LauncherPreferences.PREF_KEY_CURRENT_PROFILE, null);
        if(!Tools.isValidString(currentProfile)) return new File(Tools.DIR_GAME_NEW);
        LauncherProfiles.load();
        MinecraftProfile profileObject = LauncherProfiles.mainProfileJson.profiles.get(currentProfile);
        if(profileObject == null) return new File(Tools.DIR_GAME_NEW);
        return Tools.getGameDirPath(profileObject);
    }

    @Override
    public void onResume() {
        super.onResume();
        mVersionSpinner.reloadProfiles();
        PvPHouseServerStatus.addListener(mServerStatusListener);
    }

    @Override
    public void onPause() {
        PvPHouseServerStatus.removeListener(mServerStatusListener);
        super.onPause();
    }

    /** PvPHouse: called by LauncherActivity when the PvPHouse profile has just been created. */
    public void onProfileCreated(String profileKey) {
        if (mVersionSpinner != null) mVersionSpinner.reloadAndSelectProfile(profileKey);
    }

    private void runInstallerWithConfirmation(boolean isCustomArgs) {
        if (ProgressKeeper.getTaskCount() == 0)
            Tools.installMod(requireActivity(), isCustomArgs);
        else
            Toast.makeText(requireContext(), R.string.tasks_ongoing, Toast.LENGTH_LONG).show();
    }
}
