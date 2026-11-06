package app.socialmate.dualmic;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.TreeMap;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import android.util.Base64;

/**
 * 腾讯云实时语音识别 WebSocket v2 鉴权签名（HMAC-SHA1）。
 *
 * 与 asr-bridge/src/tencent-sign.js 保持同一协议：
 * - host: asr.cloud.tencent.com
 * - path: /asr/v2/<appId>
 * - 除 signature 外参数按字典序拼接 "host + path + ? + key=value&..."
 * - 用 SecretKey 做 HMAC-SHA1 后 Base64
 * - 最终 query 的 key/value/signature 都做 RFC3986 编码
 *
 * 只生成 URL，不发起连接、不打印密钥。
 */
final class TencentAsrSign {
    private static final String HOST = "asr.cloud.tencent.com";
    private static final String PATH_PREFIX = "/asr/v2";

    private TencentAsrSign() {}

    static String createUrl(String appId, String secretId, String secretKey,
                            String engineModelType, String track, String voiceId) throws Exception {
        String id = appId == null ? "" : appId.trim();
        if (!id.matches("^\\d+$")) throw new IllegalArgumentException("腾讯 AppId 必须是数字");
        String sid = require(secretId, "SecretId");
        String skey = require(secretKey, "SecretKey");
        String engine = require(engineModelType, "engineModelType");
        String voice = require(voiceId, "voiceId");
        if (voice.length() < 16 || voice.length() > 128) {
            throw new IllegalArgumentException("voiceId 长度必须在 16..128 之间");
        }
        long now = System.currentTimeMillis() / 1000L;
        long expired = now + 3600L;
        int nonce = 1 + new SecureRandom().nextInt(999_999_999);

        TreeMap<String, String> params = new TreeMap<>();
        params.put("secretid", sid);
        params.put("timestamp", String.valueOf(now));
        params.put("expired", String.valueOf(expired));
        params.put("nonce", String.valueOf(nonce));
        params.put("engine_model_type", engine);
        params.put("voice_id", voice);
        params.put("voice_format", "1");
        params.put("needvad", "1");
        if ("mix".equals(track)) params.put("speaker_diarization", "1");

        StringBuilder signSource = new StringBuilder(HOST).append(PATH_PREFIX).append('/').append(id).append('?');
        boolean first = true;
        for (var entry : params.entrySet()) {
            if (!first) signSource.append('&');
            signSource.append(entry.getKey()).append('=').append(entry.getValue());
            first = false;
        }
        Mac mac = Mac.getInstance("HmacSHA1");
        mac.init(new SecretKeySpec(skey.getBytes(StandardCharsets.UTF_8), "HmacSHA1"));
        String signature = Base64.encodeToString(
                mac.doFinal(signSource.toString().getBytes(StandardCharsets.UTF_8)),
                Base64.NO_WRAP);

        StringBuilder url = new StringBuilder("wss://").append(HOST).append(PATH_PREFIX)
                .append('/').append(rfc3986(id)).append('?');
        first = true;
        for (var entry : params.entrySet()) {
            if (!first) url.append('&');
            url.append(rfc3986(entry.getKey())).append('=').append(rfc3986(entry.getValue()));
            first = false;
        }
        url.append("&signature=").append(rfc3986(signature));
        return url.toString();
    }

    static String newVoiceId() {
        return UUID.randomUUID().toString();
    }

    private static String require(String value, String name) {
        String v = value == null ? "" : value.trim();
        if (v.isEmpty()) throw new IllegalArgumentException(name + " 不能为空");
        return v;
    }

    private static String rfc3986(String value) {
        try {
            return URLEncoder.encode(value, "UTF-8")
                    .replace("+", "%20")
                    .replace("!", "%21")
                    .replace("'", "%27")
                    .replace("(", "%28")
                    .replace(")", "%29")
                    .replace("*", "%2A");
        } catch (Exception e) {
            return value;
        }
    }
}