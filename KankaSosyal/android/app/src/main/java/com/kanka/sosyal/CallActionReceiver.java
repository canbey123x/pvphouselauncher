package com.kanka.sosyal;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Bildirimdeki "Reddet" düğmesi. */
public class CallActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Push.decline(context, intent.getStringExtra("call_id"));
    }
}
