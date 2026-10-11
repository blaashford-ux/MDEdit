package com.blaashford.mdedit;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;

/**
 * Installs an update from MDEdit's GitHub releases. `install()` downloads the APK, checks it against the release's
 * SHA256SUMS.txt and opens Android's package installer; the user confirms there. Android only accepts the new APK as an
 * update if it is signed with the same key as the installed app.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    private static final String DOWNLOAD_PREFIX = "https://github.com/blaashford-ux/mdedit/releases/download/";

    @PluginMethod
    public void install(PluginCall call) {
        final String url = call.getString("url");
        final String name = call.getString("name");
        final String sumsUrl = call.getString("sumsUrl");
        if (url == null || name == null || !isReleaseUrl(url) || (sumsUrl != null && !isReleaseUrl(sumsUrl)) || name.contains("/") || !name.endsWith(".apk")) {
            call.reject("Refusing to download from outside the MDEdit releases.");
            return;
        }
        // Installing from an app needs the user's one-time permission ("Install unknown apps").
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(settings);
            call.reject("Allow MDEdit to install apps in the settings screen that just opened, then come back and tap Update again.", "NEEDS_PERMISSION");
            return;
        }
        new Thread(() -> {
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("Could not create a folder for the download.");
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete();
                File apk = new File(dir, name);

                String expected = sumsUrl == null ? null : expectedHash(sumsUrl, name);
                String actual = download(url, apk);
                if (expected != null && !expected.equals(actual)) {
                    apk.delete();
                    throw new Exception("The downloaded update does not match its checksum, so it was not installed.");
                }

                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent open = new Intent(Intent.ACTION_VIEW);
                open.setDataAndType(uri, "application/vnd.android.package-archive");
                open.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(open);
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "The update failed." : e.getMessage());
            }
        }).start();
    }

    private static boolean isReleaseUrl(String url) {
        return url.toLowerCase(Locale.ROOT).startsWith(DOWNLOAD_PREFIX);
    }

    /** The hash SHA256SUMS.txt lists for `name` ("<hex>  <name>" per line), or null if it isn't listed. */
    private String expectedHash(String sumsUrl, String name) throws Exception {
        HttpURLConnection c = open(sumsUrl);
        try (InputStream in = c.getInputStream()) {
            java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) bytes.write(buf, 0, n);
            String text = bytes.toString("UTF-8");
            for (String line : text.split("\\r?\\n")) {
                String l = line.trim();
                if (l.length() > 66 && l.substring(0, 64).matches("[0-9a-fA-F]{64}")) {
                    String file = l.substring(64).trim();
                    if (file.startsWith("*")) file = file.substring(1);
                    if (file.equals(name)) return l.substring(0, 64).toLowerCase(Locale.ROOT);
                }
            }
            return null;
        } finally {
            c.disconnect();
        }
    }

    /** Saves `url` to `target`, reporting progress, and returns the file's SHA-256 (lower-case hex). */
    private String download(String url, File target) throws Exception {
        HttpURLConnection c = open(url);
        try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(target)) {
            long total = c.getContentLengthLong();
            long received = 0;
            long lastReport = 0;
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                sha.update(buf, 0, n);
                received += n;
                long now = System.currentTimeMillis();
                if (now - lastReport > 150) {
                    lastReport = now;
                    JSObject p = new JSObject();
                    p.put("received", received);
                    p.put("total", total > 0 ? total : 0);
                    notifyListeners("progress", p);
                }
            }
            JSObject done = new JSObject();
            done.put("received", received);
            done.put("total", received);
            notifyListeners("progress", done);
            StringBuilder hex = new StringBuilder();
            for (byte b : sha.digest()) hex.append(String.format("%02x", b));
            return hex.toString();
        } finally {
            c.disconnect();
        }
    }

    /** GitHub serves release files through a redirect (to another host); follow it, but only over https. */
    private HttpURLConnection open(String url) throws Exception {
        String current = url;
        for (int i = 0; i < 5; i++) {
            HttpURLConnection c = (HttpURLConnection) new URL(current).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String next = c.getHeaderField("Location");
                c.disconnect();
                if (next == null || !next.startsWith("https://")) throw new Exception("The download was redirected somewhere unsafe.");
                current = next;
                continue;
            }
            if (code != 200) {
                c.disconnect();
                throw new Exception("The download failed (" + code + ").");
            }
            return c;
        }
        throw new Exception("The download was redirected too many times.");
    }
}
