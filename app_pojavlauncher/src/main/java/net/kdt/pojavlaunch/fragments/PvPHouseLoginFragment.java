package net.kdt.pojavlaunch.fragments;

import static net.kdt.pojavlaunch.Tools.hasOnlineProfile;

import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.res.ResourcesCompat;
import androidx.fragment.app.Fragment;

import net.kdt.pojavlaunch.R;
import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.extra.ExtraConstants;
import net.kdt.pojavlaunch.extra.ExtraCore;
import net.kdt.pojavlaunch.pvphouse.PvPHouseCredentials;

/**
 * PvPHouse Launcher: account screen. Creates an offline (cracked) Minecraft account with the
 * chosen username and remembers the AuthMe password so the game can send /register or /login
 * automatically when it joins PvPHouse.
 *
 * Like upstream's local login, it is only reachable once a Microsoft account that owns
 * Minecraft has been added (game ownership check is kept on purpose).
 */
public class PvPHouseLoginFragment extends Fragment {
    public static final String TAG = "PvPHouseLoginFragment";
    private static final String STATE_REGISTER = "register_mode";

    private boolean mRegisterMode = false;

    private TextView mTitle;
    private TextView mSubtitle;
    private EditText mUsername;
    private EditText mPassword;
    private EditText mPasswordConfirm;
    private View mConfirmGroup;
    private Button mSubmit;
    private TextView mSwitchMode;

    public PvPHouseLoginFragment() {
        super(R.layout.fragment_pvphouse_login);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        if (!hasOnlineProfile()) {
            // Same rule as upstream LocalLoginFragment: a Microsoft account must be added first
            Tools.swapFragment(requireActivity(), MainMenuFragment.class, MainMenuFragment.TAG, null);
            return;
        }
        mTitle = view.findViewById(R.id.pvphouse_login_title);
        mSubtitle = view.findViewById(R.id.pvphouse_login_subtitle);
        mUsername = view.findViewById(R.id.pvphouse_login_username);
        mPassword = view.findViewById(R.id.pvphouse_login_password);
        mPasswordConfirm = view.findViewById(R.id.pvphouse_login_password_confirm);
        mConfirmGroup = view.findViewById(R.id.pvphouse_login_confirm_group);
        mSubmit = view.findViewById(R.id.pvphouse_login_submit);
        mSwitchMode = view.findViewById(R.id.pvphouse_login_switch_mode);

        mSubmit.setBackground(ResourcesCompat.getDrawable(getResources(), R.drawable.pvp_join_button_background, null));
        mSubmit.setOnClickListener(v -> submit());
        mSwitchMode.setOnClickListener(v -> setRegisterMode(!mRegisterMode));

        if (!PvPHouseCredentials.isPasswordStorageSupported()) {
            ((TextView) view.findViewById(R.id.pvphouse_login_note)).setText(R.string.pvphouse_login_no_secure_storage);
        }

        // Pre-fill the last used username
        PvPHouseCredentials.Credentials saved = PvPHouseCredentials.load(requireContext());
        if (saved != null) mUsername.setText(saved.username);

        setRegisterMode(savedInstanceState != null && savedInstanceState.getBoolean(STATE_REGISTER, false));
    }

    @Override
    public void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putBoolean(STATE_REGISTER, mRegisterMode);
    }

    private void setRegisterMode(boolean register) {
        mRegisterMode = register;
        mTitle.setText(register ? R.string.pvphouse_register_title : R.string.pvphouse_login_title);
        mSubtitle.setText(register ? R.string.pvphouse_register_subtitle : R.string.pvphouse_login_subtitle);
        mConfirmGroup.setVisibility(register ? View.VISIBLE : View.GONE);
        mSubmit.setText(register ? R.string.pvphouse_login_action_register : R.string.pvphouse_login_action_login);
        mSwitchMode.setText(register ? R.string.pvphouse_login_switch_to_login : R.string.pvphouse_login_switch_to_register);
        mPassword.setError(null);
        mPasswordConfirm.setError(null);
    }

    private void submit() {
        String username = mUsername.getText().toString().trim();
        String password = mPassword.getText().toString();

        if (!PvPHouseCredentials.isValidUsername(username)) {
            mUsername.setError(getString(R.string.local_login_bad_username_text));
            mUsername.requestFocus();
            return;
        }
        if (!PvPHouseCredentials.isValidPassword(password)) {
            mPassword.setError(getString(R.string.pvphouse_login_bad_password,
                    PvPHouseCredentials.PASSWORD_MIN, PvPHouseCredentials.PASSWORD_MAX));
            mPassword.requestFocus();
            return;
        }
        if (mRegisterMode && !password.equals(mPasswordConfirm.getText().toString())) {
            mPasswordConfirm.setError(getString(R.string.pvphouse_login_password_mismatch));
            mPasswordConfirm.requestFocus();
            return;
        }

        PvPHouseCredentials.save(requireContext(), username, password,
                mRegisterMode ? PvPHouseCredentials.MODE_REGISTER : PvPHouseCredentials.MODE_LOGIN);

        // Create (or overwrite) and select the offline account with this username
        ExtraCore.setValue(ExtraConstants.MOJANG_LOGIN_TODO, new String[]{username, ""});
        Tools.swapFragment(requireActivity(), MainMenuFragment.class, MainMenuFragment.TAG, null);
    }
}
