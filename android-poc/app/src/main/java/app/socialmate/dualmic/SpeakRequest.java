package app.socialmate.dualmic;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;

/**
 * 朗读请求（N05 内部协议，非任何厂商 API）。
 *
 * 字段固定为：requestId / recordId / blockId / revision / segmentType / text /
 * locale / accent / providerId / voiceProfileId / rate / style。
 *
 * 两条硬约束：
 * 1. text 原样保存，绝不 trim、绝不补标点、绝不改字；只做「空」与长度校验。
 * 2. locale/accent 缺省时按 segmentType 推导；providerId 缺省由上层（设置项）给出。
 */
public final class SpeakRequest {
    public static final String SEG_CN = "cn";
    public static final String SEG_EN_A = "enA";
    public static final String SEG_EN_B = "enB";
    public static final String SEG_PHRASE = "phrase";
    public static final String[] SEGMENT_TYPES = {SEG_CN, SEG_EN_A, SEG_EN_B, SEG_PHRASE};

    public static final int MAX_TEXT_CHARS = 2000;

    public final String requestId;
    public final String recordId;
    public final String blockId;
    public final int revision;
    public final String segmentType;
    public final String text;
    public final String locale;
    public final String accent;
    public final String providerId;
    public final String voiceProfileId;
    public final double rate;
    public final String style;

    public SpeakRequest(String requestId, String recordId, String blockId, int revision,
                        String segmentType, String text, String locale, String accent,
                        String providerId, String voiceProfileId, double rate, String style) {
        this.requestId = safe(requestId);
        this.recordId = safe(recordId);
        this.blockId = safe(blockId);
        this.revision = Math.max(0, revision);
        this.segmentType = segmentType;
        this.text = text == null ? "" : text; // 原文不改写
        this.locale = locale == null ? "" : locale;
        this.accent = safe(accent);
        this.providerId = safe(providerId);
        this.voiceProfileId = safe(voiceProfileId);
        this.rate = rate;
        this.style = safe(style);
    }

    /** 便捷构造：provider/rate 由调用方（设置项）给出。 */
    public static SpeakRequest of(String segmentType, String text, String providerId, double rate) {
        return new SpeakRequest("req-" + System.currentTimeMillis(), "", "", 1,
                normalizeSegment(segmentType), text, defaultLocale(segmentType), "",
                providerId, "", rate, "");
    }

    public SpeakRequest withIds(String recordId, String blockId, int revision) {
        return new SpeakRequest(requestId, recordId, blockId, revision, segmentType, text,
                locale, accent, providerId, voiceProfileId, rate, style);
    }

    public SpeakRequest withProvider(String providerId, double rate) {
        return new SpeakRequest(requestId, recordId, blockId, revision, segmentType, text,
                locale, accent, providerId, voiceProfileId, rate, style);
    }

    /** 只换声线（远端 provider 专用）；其余字段原样保留，字段顺序与协议不变。 */
    public SpeakRequest withVoice(String voiceProfileId) {
        return new SpeakRequest(requestId, recordId, blockId, revision, segmentType, text,
                locale, accent, providerId, voiceProfileId, rate, style);
    }

    /** 请求体：字段顺序固定，text 原样带出；不包含任何厂商 Key 或服务端路径。 */
    public JSONObject toJson() {
        JSONObject body = new JSONObject();
        try {
            body.put("requestId", requestId.isEmpty() ? "req-" + System.currentTimeMillis() : requestId);
            body.put("recordId", recordId);
            body.put("blockId", blockId);
            body.put("revision", revision);
            body.put("segmentType", normalizeSegment(segmentType));
            body.put("text", text);
            body.put("locale", locale.isEmpty() ? defaultLocale(segmentType) : locale);
            body.put("accent", accent);
            body.put("providerId", providerId);
            body.put("voiceProfileId", voiceProfileId);
            body.put("rate", rate);
            body.put("style", style);
        } catch (Exception ignored) {
        }
        return body;
    }

    public String textSha256() {
        return sha256Hex(text);
    }

    /** 本地缓存键：换 provider/voice/locale/rate/原文或业务来源都必须重新取音频。 */
    public String cacheKey() {
        return sha256Hex(String.join("|", new String[]{
                providerId, voiceProfileId, locale.isEmpty() ? defaultLocale(segmentType) : locale,
                String.format(Locale.US, "%.2f", rate), textSha256(),
                recordId, blockId, String.valueOf(revision)
        }));
    }

    /** 语言标签 → segmentType（系统朗读适配器用不到 rate/style）。 */
    public static String segmentOfLang(String lang) {
        String value = lang == null ? "" : lang.trim().toLowerCase(Locale.US);
        if (value.equals("enb") || value.equals("en-b") || value.startsWith("en-gb")) return SEG_EN_B;
        if (value.equals("ena") || value.equals("en-a") || value.equals("en")) return SEG_EN_A;
        if (value.startsWith("zh")) return SEG_CN;
        if (value.equals("phrase") || value.equals("phrases")) return SEG_PHRASE;
        if (value.startsWith("en")) return SEG_EN_A;
        return SEG_PHRASE;
    }

    public static String defaultLocale(String segmentType) {
        if (SEG_CN.equals(segmentType)) return "zh-CN";
        if (SEG_EN_B.equals(segmentType)) return "en-GB";
        return "en-US";
    }

    public static String normalizeSegment(String segmentType) {
        for (String candidate : SEGMENT_TYPES) {
            if (candidate.equals(segmentType)) return candidate;
        }
        return SEG_PHRASE;
    }

    /** 系统 TTS 只认语言族，不认 segmentType 的粗细。 */
    public static String langFamily(String locale) {
        String value = locale == null ? "" : locale.trim().toLowerCase(Locale.US);
        return value.startsWith("zh") ? "zh" : "en";
    }

    static String sha256Hex(String text) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] raw = digest.digest((text == null ? "" : text).getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(raw.length * 2);
            for (byte b : raw) sb.append(String.format(Locale.US, "%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }
}
