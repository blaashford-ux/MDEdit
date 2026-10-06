package com.blaashford.mdedit;

import android.app.Activity;
import android.content.Intent;
import android.content.IntentSender;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;
import java.util.Collections;

/**
 * Google sign-in for Drive on Android, using Play Services' Authorization API (no passwords or client secrets in the
 * app: Google identifies the app by its package name and signing certificate). `authorize()` resolves with a fresh
 * access token for the narrow `drive.file` scope; the first call shows Google's account and consent screens.
 */
@CapacitorPlugin(name = "DriveAuth", requestCodes = { DriveAuthPlugin.REQUEST_AUTHORIZE })
public class DriveAuthPlugin extends Plugin {

    static final int REQUEST_AUTHORIZE = 9201;
    private static final String DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

    @PluginMethod
    public void authorize(PluginCall call) {
        AuthorizationRequest request = AuthorizationRequest.builder()
            .setRequestedScopes(Collections.singletonList(new Scope(DRIVE_FILE_SCOPE)))
            .build();
        Identity.getAuthorizationClient(getActivity())
            .authorize(request)
            .addOnSuccessListener(result -> {
                if (result.hasResolution()) {
                    // The user has to pick an account and/or grant access first.
                    try {
                        saveCall(call);
                        getActivity().startIntentSenderForResult(result.getPendingIntent().getIntentSender(), REQUEST_AUTHORIZE, null, 0, 0, 0, null);
                    } catch (IntentSender.SendIntentException e) {
                        call.reject("Could not open the Google consent screen: " + e.getMessage());
                    }
                } else {
                    resolveWith(call, result);
                }
            })
            .addOnFailureListener(e -> call.reject("Google authorization failed: " + e.getMessage()));
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_AUTHORIZE) return;
        PluginCall call = getSavedCall();
        if (call == null) return;
        if (resultCode != Activity.RESULT_OK || data == null) {
            call.reject("Google sign-in was cancelled.");
            return;
        }
        try {
            AuthorizationResult result = Identity.getAuthorizationClient(getActivity()).getAuthorizationResultFromIntent(data);
            resolveWith(call, result);
        } catch (ApiException e) {
            call.reject("Google authorization failed: " + e.getMessage());
        }
    }

    private void resolveWith(PluginCall call, AuthorizationResult result) {
        String token = result.getAccessToken();
        if (token == null || token.isEmpty()) {
            call.reject("Google did not return an access token.");
            return;
        }
        JSObject out = new JSObject();
        out.put("accessToken", token);
        call.resolve(out);
    }
}
