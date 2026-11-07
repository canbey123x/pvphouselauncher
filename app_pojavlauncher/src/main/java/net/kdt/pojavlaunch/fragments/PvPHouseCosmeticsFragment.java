package net.kdt.pojavlaunch.fragments;

import android.content.Context;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;

import net.kdt.pojavlaunch.R;
import net.kdt.pojavlaunch.pvphouse.PvPHouseCosmetics;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** PvPHouse Launcher: cosmetics wardrobe (cape, hat, wings). */
public class PvPHouseCosmeticsFragment extends Fragment {
    public static final String TAG = "PvPHouseCosmeticsFragment";

    public PvPHouseCosmeticsFragment() {
        super(R.layout.fragment_pvphouse_cosmetics);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        LinearLayout root = view.findViewById(R.id.pvphouse_cosmetics_root);
        addSection(root, R.string.pvphouse_cosm_section_cape, PvPHouseCosmetics.TYPE_CAPE);
        addSection(root, R.string.pvphouse_cosm_section_hat, PvPHouseCosmetics.TYPE_HAT);
        addSection(root, R.string.pvphouse_cosm_section_wings, PvPHouseCosmetics.TYPE_WINGS);

        TextView note = new TextView(requireContext());
        note.setText(R.string.pvphouse_cosm_note);
        note.setTextColor(ContextCompat.getColor(requireContext(), R.color.secondary_text));
        note.setTextSize(TypedValue.COMPLEX_UNIT_PX, getResources().getDimension(R.dimen._9ssp));
        note.setPadding(0, dp(12), 0, 0);
        root.addView(note);
    }

    private void addSection(LinearLayout root, int titleRes, String type) {
        Context context = requireContext();
        TextView title = new TextView(context);
        title.setText(titleRes);
        title.setAllCaps(true);
        title.setTextColor(ContextCompat.getColor(context, R.color.secondary_text));
        title.setTextSize(TypedValue.COMPLEX_UNIT_PX, getResources().getDimension(R.dimen._9ssp));
        title.setPadding(0, dp(14), 0, dp(6));
        root.addView(title);

        HorizontalScrollView scroller = new HorizontalScrollView(context);
        scroller.setHorizontalScrollBarEnabled(false);
        LinearLayout row = new LinearLayout(context);
        row.setOrientation(LinearLayout.HORIZONTAL);
        scroller.addView(row);
        root.addView(scroller);

        String selected = PvPHouseCosmetics.getSelected(context, type);
        List<View> cards = new ArrayList<>();
        for (PvPHouseCosmetics.Item item : PvPHouseCosmetics.catalog(type)) {
            View card = createCard(context, item);
            card.setSelected(Objects.equals(item.id, selected));
            card.setOnClickListener(v -> {
                PvPHouseCosmetics.setSelected(context, type, item.id);
                for (View other : cards) other.setSelected(other == v);
            });
            cards.add(card);
            row.addView(card);
        }
    }

    private View createCard(Context context, PvPHouseCosmetics.Item item) {
        LinearLayout card = new LinearLayout(context);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_HORIZONTAL);
        card.setBackgroundResource(R.drawable.pvp_cosmetic_card);
        card.setPadding(dp(8), dp(8), dp(8), dp(8));
        LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(dp(96), LinearLayout.LayoutParams.WRAP_CONTENT);
        cardParams.setMarginEnd(dp(8));
        card.setLayoutParams(cardParams);
        card.setClickable(true);
        card.setFocusable(true);

        ImageView preview = new ImageView(context);
        preview.setImageResource(item.previewRes);
        preview.setScaleType(ImageView.ScaleType.FIT_CENTER);
        card.addView(preview, new LinearLayout.LayoutParams(dp(72), dp(72)));

        TextView name = new TextView(context);
        name.setText(item.nameRes);
        name.setGravity(Gravity.CENTER);
        name.setMaxLines(2);
        name.setTextColor(ContextCompat.getColor(context, R.color.primary_text));
        name.setTextSize(TypedValue.COMPLEX_UNIT_PX, getResources().getDimension(R.dimen._10ssp));
        name.setPadding(0, dp(4), 0, 0);
        card.addView(name);
        return card;
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
    }
}
