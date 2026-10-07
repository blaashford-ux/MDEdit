package com.blaashford.mdedit;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdatePlugin.class);
        registerPlugin(DriveAuthPlugin.class); // must be registered before super.onCreate
        super.onCreate(savedInstanceState);
    }
}
