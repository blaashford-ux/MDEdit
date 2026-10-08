package com.blaashford.mdedit;

import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdatePlugin.class);
        registerPlugin(DriveAuthPlugin.class); // must be registered before super.onCreate
        super.onCreate(savedInstanceState);
        // Google's file picker (docs.google.com) runs in an iframe inside the invitation page (github.io), inside this page: a
        // third-party context. Android's WebView blocks third-party cookies by default, which leaves the picker blank.
        WebView web = getBridge().getWebView();
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
    }
}
