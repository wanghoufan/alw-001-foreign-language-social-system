package app.socialmate.dualmic.local;

import android.content.Context;

import org.json.JSONObject;

import app.socialmate.dualmic.SecureStore;

/**
 * 手机端厂商 Key 的本地保管（方案 2：手机直连厂商）。
 *
 * 约束：
 * - Key 只经 Android Keystore（AES-256-GCM）加密后落 SharedPreferences；
 * - 不编译进 APK、不写日志、不进备份包、不回显给页面；
 * - 页面只提交一次，提交后输入框立即清空；
 * - 读取失败（换机/清 Keystore/篡改）一律按“未配置”处理。
 */
public final class CloudKeys {
    public static final String DEEPSEEK = "deepseek";
    public static final String DOUBAO = "doubao";
    public static final String TENCENT_APP_ID = "tencent_app_id";
    public static final String TENCENT_SECRET_ID = "tencent_secret_id";
    public static final String TENCENT_SECRET_KEY = "tencent_secret_key";

    private static final String PREFIX = "cloud.";
    private final SecureStore store;

    public CloudKeys(Context context) {
        this.store = new SecureStore(context);
    }

    public String get(String kind) {
        return store.get(PREFIX + normalize(kind));
    }

    public boolean put(String kind, String value) {
        String key = normalize(kind);
        if (key == null) return false;
        String trimmed = value == null ? "" : value.trim();
        // 只做长度与空白校验，不把值写日志。
        if (trimmed.length() > 400) return false;
        return store.put(PREFIX + key, trimmed);
    }

    public boolean has(String kind) {
        String value = get(kind);
        return value != null && !value.isEmpty();
    }

    public boolean hasDeepSeek() { return has(DEEPSEEK); }
    public boolean hasDoubao() { return has(DOUBAO); }
    public boolean hasTencentAsr() {
        return has(TENCENT_APP_ID) && has(TENCENT_SECRET_ID) && has(TENCENT_SECRET_KEY);
    }

    /** 只返回“是否已配置”，绝不返回值本身。 */
    public JSONObject status() {
        JSONObject out = new JSONObject();
        try {
            out.put(DEEPSEEK, hasDeepSeek());
            out.put(DOUBAO, hasDoubao());
            out.put("tencent", hasTencentAsr());
            out.put("mode", hasDeepSeek() || hasDoubao() ? "direct" : "gateway-or-unconfigured");
        } catch (Exception ignored) {}
        return out;
    }

    private static String normalize(String kind) {
        if (kind == null) return null;
        switch (kind.trim().toLowerCase(java.util.Locale.ROOT)) {
            case "deepseek": return DEEPSEEK;
            case "doubao": return DOUBAO;
            case "tencent_app_id":
            case "tencentappid": return TENCENT_APP_ID;
            case "tencent_secret_id":
            case "tencentsecretid": return TENCENT_SECRET_ID;
            case "tencent_secret_key":
            case "tencentsecretkey": return TENCENT_SECRET_KEY;
            default: return null;
        }
    }
}