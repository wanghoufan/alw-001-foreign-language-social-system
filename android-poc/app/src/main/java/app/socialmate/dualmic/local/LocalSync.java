package app.socialmate.dualmic.local;

import android.content.Context;
import android.content.SharedPreferences;
import android.provider.Settings;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * 手机 ↔ Mac 局域网同步（MVP）。
 *
 * - push：手机把本机 SQLite 的完整 JSON 快照写到 Mac 的 SocialMate-Data/Backups/，
 *   不改 Mac 的 People/PrivateCards 等真源；
 * - pull：从 Mac 拉取同结构快照，按“本机已有就不覆盖”的方式合并；
 * - 鉴权沿用配对短期令牌（x-archive-token），不新增长期密钥；
 * - 不传输厂商 Key、会话原文、录音文件。
 *
 * 地址来自手机已配对的 Mac 私有服务（ui_url），只走局域网/Tailscale。
 */
public final class LocalSync {
    private static final int CONNECT_TIMEOUT = 8000;
    private static final int READ_TIMEOUT = 60000;
    private static final String DEVICE_PREFS = "socialmate-device";

    private LocalSync() {}

    public static JSONObject push(Context context, LocalStore store, String baseUrl, String token) throws Exception {
        String base = normalizeBase(baseUrl);
        String deviceId = deviceId(context);
        JSONObject backup = store.exportBackup();
        JSONObject body = new JSONObject()
                .put("deviceId", deviceId)
                .put("exportedAt", backup.optString("exportedAt"))
                .put("backup", backup);
        JSONObject response = request("POST", base + "/v12/api/local/sync/push",
                body.toString().getBytes(StandardCharsets.UTF_8), token);
        return new JSONObject()
                .put("ok", true)
                .put("deviceId", deviceId)
                .put("stored", response.optBoolean("stored", false))
                .put("file", response.optString("file", ""))
                .put("bytes", response.optLong("bytes", 0))
                .put("at", response.optString("at", ""))
                .put("counts", backup.optJSONObject("counts"));
    }

    public static JSONObject pull(Context context, LocalStore store, String baseUrl, String token) throws Exception {
        String base = normalizeBase(baseUrl);
        JSONObject response = request("GET", base + "/v12/api/local/sync/pull", null, token);
        JSONObject backup = response.optJSONObject("backup");
        if (backup == null) {
            throw new LocalHttpException(502, "SYNC_EMPTY", "Mac 没有返回可导入的备份");
        }
        JSONObject imported = store.importBackup(backup, false);
        return new JSONObject()
                .put("ok", true)
                .put("imported", imported.optInt("imported", 0))
                .put("at", response.optString("at", backup.optString("exportedAt", "")))
                .put("counts", backup.optJSONObject("counts"));
    }

    public static JSONObject status(String baseUrl) throws Exception {
        JSONObject response = request("GET", normalizeBase(baseUrl) + "/v12/api/local/sync/status", null, "");
        response.put("ok", true);
        return response;
    }

    private static JSONObject request(String method, String url, byte[] body, String token) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setRequestMethod(method);
        conn.setConnectTimeout(CONNECT_TIMEOUT);
        conn.setReadTimeout(READ_TIMEOUT);
        conn.setRequestProperty("Accept", "application/json");
        if (token != null && !token.isEmpty()) conn.setRequestProperty("x-archive-token", token);
        if (body != null) {
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setDoOutput(true);
            try (OutputStream out = conn.getOutputStream()) {
                out.write(body);
                out.flush();
            }
        }
        int status = conn.getResponseCode();
        InputStream in = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
        byte[] payload = in == null ? new byte[0] : readAll(in);
        String text = new String(payload, StandardCharsets.UTF_8);
        if (status >= 400) {
            String message = text;
            try {
                JSONObject error = new JSONObject(text);
                message = error.optString("error", error.optString("code", text));
            } catch (Exception ignored) {}
            throw new LocalHttpException(status, "SYNC_HTTP_" + status,
                    message.isEmpty() ? "Mac 同步服务返回 HTTP " + status : message);
        }
        try {
            return text.isEmpty() ? new JSONObject() : new JSONObject(text);
        } catch (Exception e) {
            throw new LocalHttpException(502, "SYNC_BAD_JSON", "Mac 返回不是合法 JSON");
        }
    }

    private static String deviceId(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(DEVICE_PREFS, Context.MODE_PRIVATE);
        String saved = prefs.getString("device_id", "");
        if (saved != null && saved.matches("^[A-Za-z0-9._-]{1,64}$")) return saved;
        String androidId = "";
        try {
            androidId = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ANDROID_ID);
        } catch (Exception ignored) {}
        String id = androidId == null ? "" : androidId.replaceAll("[^A-Za-z0-9._-]", "");
        if (id.isEmpty()) id = "device-" + Long.toHexString(System.currentTimeMillis());
        if (id.length() > 64) id = id.substring(0, 64);
        prefs.edit().putString("device_id", id).apply();
        return id;
    }

    private static String normalizeBase(String baseUrl) throws LocalHttpException {
        String base = baseUrl == null ? "" : baseUrl.trim().replaceAll("/+$", "");
        if (base.isEmpty()) {
            throw new LocalHttpException(400, "SYNC_NO_MAC", "未配置 Mac 私有服务地址；请先在录音设置里配对");
        }
        if (!base.startsWith("http://") && !base.startsWith("https://")) {
            throw new LocalHttpException(400, "SYNC_BAD_BASE", "Mac 地址必须以 http:// 或 https:// 开头");
        }
        return base;
    }

    private static byte[] readAll(InputStream in) throws Exception {
        try (InputStream input = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = input.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }
}