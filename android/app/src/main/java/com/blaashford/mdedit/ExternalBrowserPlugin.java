package com.blaashford.mdedit;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Opens MDEdit's invitation page in the phone's browser. Google's file picker stays blank when it runs inside the app's web
 * view, so the app hands over to the browser; the page returns the result through an mdedit://picked link (see the manifest).
 */
@CapacitorPlugin(name = "ExternalBrowser")
public class ExternalBrowserPlugin extends Plugin {

    private static final String JOIN_PAGE = "https://blaashford-ux.github.io/MDEdit/join/";

    @PluginMethod
    public void open(PluginCall call) {
        final String url = call.getString("url");
        if (url == null || !url.startsWith(JOIN_PAGE)) {
            call.reject("Refusing to open a page outside MDEdit's invitation page.");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't open your browser: " + e.getMessage());
        }
    }
}
