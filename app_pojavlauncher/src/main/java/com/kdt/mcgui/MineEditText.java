package com.kdt.mcgui;

import android.content.*;
import android.util.*;
import android.graphics.*;
import android.widget.EditText;

public class MineEditText extends androidx.appcompat.widget.AppCompatEditText {
	public MineEditText(Context ctx) {
		super(ctx);
		init();
	}

	public MineEditText(Context ctx, AttributeSet attrs) {
		super(ctx, attrs);
		init();
	}

	public void init() {
		setBackgroundColor(androidx.core.content.ContextCompat.getColor(getContext(), net.kdt.pojavlaunch.R.color.pvp_bg_darkest));
		setPadding(5, 5, 5, 5);
	}
}
