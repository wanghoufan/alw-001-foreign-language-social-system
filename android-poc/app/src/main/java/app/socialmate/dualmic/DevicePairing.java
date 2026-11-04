package app.socialmate.dualmic;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Locale;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * 设备配对 + 短期访问令牌（N04 V1.3 T1-3）。
 *
 * 设计约束：
 * - APK 里**不再有**任何长期归档令牌常量；安装包被 strings 也拿不到可用凭证。
 * - 首次使用：Mac 上生成一次性 6 位配对码 → 这里输入 → 换 deviceId + deviceSecret。
 * - deviceSecret 用 SecureStore（Android Keystore，AES-GCM）保存，明文不落盘。
 * - 之后每次用 HMAC(deviceSecret, deviceId|ts|nonce) 换 ≤24h 的短期令牌；
 *   令牌只缓存到内存，进程结束即丢弃。
 * - 未配对 / 令牌过期 / 设备被撤销 → 返回 null，调用方必须 fail closed
 *   （不上传、不把令牌注入 WebView），由用户重新配对。
 */
public final class DevicePairing {
    public interface Logger { void log(String line); }

    private static final String PREFS = "socialmate-pairing";
    private static final String KEY_DEVICE = "device_id";
    private static final String KEY_SECRET = "device_secret_ref";
    private static final String KEY_SECRET_VALUE = "device_secret";
    private static final String KEY_DEVICE_NAME = "device_name";
    private static final long REFRESH_MARGIN_MS = 5 * 60_000L;

    private final SharedPreferences prefs;
    private final SecureStore secure;
    private final SecureRandom random = new SecureRandom();

    private volatile String cachedToken;
    private volatile long cachedExpiresAt;

    public DevicePairing(Context context) {
        Context app = context.getApplicationContext();
        this.prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        this.secure = new SecureStore(app);
    }

    public String deviceId() {
        String value = prefs.getString(KEY_DEVICE, "");
        return value == null ? "" : value.trim();
    }

    private String secret() {
        return secure.get(KEY_SECRET_VALUE);
    }

    public boolean isPaired() {
        return !deviceId().isEmpty() && !secret().isEmpty();
    }

    public String deviceLabel() {
        String value = prefs.getString(KEY_DEVICE_NAME, "");
        return value == null ? "" : value.trim();
    }

    /** 只读缓存里的令牌（可能为空）。供 WebView 注入时使用，绝不发起网络。 */
    public String cachedToken() {
        String token = cachedToken;
        if (token == null || token.isEmpty()) return "";
        if (cachedExpiresAt - System.currentTimeMillis() < REFRESH_MARGIN_MS) return "";
        return token;
    }

    public void setCachedToken(String token, long expiresAtMs) {
        this.cachedToken = token == null ? "" : token;
        this.cachedExpiresAt = expiresAtMs;
    }

    public void clearToken() {
        this.cachedToken = "";
        this.cachedExpiresAt = 0L;
    }

    /** 配对：用一次性配对码换设备凭证。返回空串表示成功，否则返回可展示的错误。 */
    public String pair(String baseUrl, String code) {
        String base = trimBase(baseUrl);
        if (base.isEmpty()) return "缺少服务地址";
        String clean = code == null ? "" : code.replaceAll("[^0-9]", "");
        if (clean.length() < 6) return "配对码是 6 位数字";
        HttpURLConnection connection = null;
        try {
            JSONObject payload = new JSONObject();
            payload.put("code", clean);
            payload.put("deviceName", deviceName());
            connection = open(base + "/v12/api/pair/claim", "POST");
            writeBody(connection, payload.toString());
            int status = connection.getResponseCode();
            String body = readAll(status >= 200 && status < 300
                    ? connection.getInputStream() : connection.getErrorStream());
            JSONObject parsed = new JSONObject(body.isEmpty() ? "{}" : body);
            if (status != 200 || !parsed.optBoolean("ok")) {
                return errorText(status, parsed);
            }
            String deviceId = parsed.optString("deviceId", "");
            String deviceSecret = parsed.optString("deviceSecret", "");
            if (deviceId.isEmpty() || deviceSecret.isEmpty()) return "服务返回的配对结果不完整";
            if (!secure.put(KEY_SECRET_VALUE, deviceSecret)) return "本机 Keystore 写入失败，无法安全保存配对密钥";
            prefs.edit().putString(KEY_DEVICE, deviceId)
                    .putString(KEY_DEVICE_NAME, deviceName()).apply();
            applyToken(parsed);
            return "";
        } catch (Exception e) {
            return "配对失败：" + e.getClass().getSimpleName();
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    /**
     * 取一个可用令牌：优先缓存，其次用设备证明换新的。
     * 未配对或服务断开时返回空串（fail closed），不做任何降级。
     */
    public String refreshToken(String baseUrl, Logger logger) {
        if (!isPaired()) return "";
        String base = trimBase(baseUrl);
        if (base.isEmpty()) return "";
        HttpURLConnection connection = null;
        try {
            long ts = System.currentTimeMillis();
            String nonce = hex(12);
            String proof = proof(deviceId(), ts, nonce);
            if (proof.isEmpty()) return "";
            JSONObject payload = new JSONObject();
            payload.put("deviceId", deviceId());
            payload.put("ts", ts);
            payload.put("nonce", nonce);
            payload.put("proof", proof);
            connection = open(base + "/v12/api/pair/token", "POST");
            writeBody(connection, payload.toString());
            int status = connection.getResponseCode();
            String body = readAll(status >= 200 && status < 300
                    ? connection.getInputStream() : connection.getErrorStream());
            if (status != 200) {
                clearToken();
                if (logger != null) logger.log("pairing: token refresh HTTP " + status);
                return "";
            }
            JSONObject parsed = new JSONObject(body.isEmpty() ? "{}" : body);
            if (!parsed.optBoolean("ok")) return "";
            applyToken(parsed);
            return cachedToken();
        } catch (Exception e) {
            if (logger != null) logger.log("pairing: token refresh " + e.getClass().getSimpleName());
            return "";
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    /** 撤销本机配对记录（服务端撤销需在 Mac 上执行 /v12/api/pair/revoke）。 */
    public void unpair() {
        prefs.edit().remove(KEY_DEVICE).remove(KEY_DEVICE_NAME).apply();
        secure.remove(KEY_SECRET_VALUE);
        clearToken();
    }

    private void applyToken(JSONObject parsed) {
        String token = parsed.optString("token", "");
        if (token.isEmpty()) return;
        long expMs = 0L;
        String expiresAt = parsed.optString("expiresAt", "");
        if (!expiresAt.isEmpty()) {
            try {
                expMs = java.time.Instant.parse(expiresAt).toEpochMilli();
            } catch (Exception ignored) {
                expMs = 0L;
            }
        }
        if (expMs == 0L) expMs = System.currentTimeMillis() + 3600_000L;
        setCachedToken(token, expMs);
    }

    private String deviceName() {
        String model = android.os.Build.MODEL == null ? "Android" : android.os.Build.MODEL;
        return ("SocialMate " + model).trim();
    }

    /** 与服务端一致的证明格式：base64url(no padding) 的 HMAC-SHA256。 */
    private String proof(String deviceId, long ts, String nonce) {
        String secret = secret();
        if (secret.isEmpty()) return "";
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] raw = mac.doFinal(("pair|" + deviceId + "|" + ts + "|" + nonce)
                    .getBytes(StandardCharsets.UTF_8));
            return android.util.Base64.encodeToString(raw,
                    android.util.Base64.URL_SAFE | android.util.Base64.NO_WRAP | android.util.Base64.NO_PADDING);
        } catch (Exception e) {
            return "";
        }
    }

    private static String hex(int bytes) {
        SecureRandom r = new SecureRandom();
        byte[] raw = new byte[bytes];
        r.nextBytes(raw);
        StringBuilder sb = new StringBuilder();
        for (byte b : raw) sb.append(String.format(Locale.US, "%02x", b));
        return sb.toString();
    }

    private static String trimBase(String value) {
        String base = value == null ? "" : value.trim();
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        if (base.endsWith("/v12")) base = base.substring(0, base.length() - 4);
        return base;
    }

    private static HttpURLConnection open(String url, String method) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(6000);
        connection.setReadTimeout(8000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        return connection;
    }

    private static void writeBody(HttpURLConnection connection, String body) throws Exception {
        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
        connection.setFixedLengthStreamingMode(payload.length);
        try (OutputStream os = connection.getOutputStream()) {
            os.write(payload);
        }
    }

    private static String readAll(InputStream input) throws Exception {
        if (input == null) return "";
        StringBuilder sb = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
        }
        return sb.toString();
    }

    private static String errorText(int status, JSONObject parsed) {
        String code = parsed.optString("code", "");
        String message = parsed.optString("error", "");
        if (!message.isEmpty()) return message;
        return "配对失败（HTTP " + status + (code.isEmpty() ? "" : " " + code) + "）";
    }
}
