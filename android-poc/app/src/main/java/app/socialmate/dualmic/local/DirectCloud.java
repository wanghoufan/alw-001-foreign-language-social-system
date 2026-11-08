package app.socialmate.dualmic.local;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;

/**
 * 手机直连厂商（方案 2）：不经过任何云函数或 Mac。
 *
 * - DeepSeek：翻译 / 英文草稿 / 对话建议（只发文本，不发人物档案）；
 * - 豆包 TTS：Seed-TTS 2.0，逐行 JSON 拼 base64 音频；
 * - 每日预算：手机本地记账，超额 402，防止 Key 被滥用刷爆。
 *
 * Key 只从 CloudKeys（Keystore 加密）读取，不写日志、不回显。
 */
public final class DirectCloud {
    private static final String DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
    private static final String DEEPSEEK_MODEL = "deepseek-chat";
    private static final String DOUBAO_URL = "https://openspeech.bytedance.com/api/v3/tts/unidirectional";
    private static final String DOUBAO_RESOURCE = "seed-tts-2.0";
    private static final String USAGE_PREFS = "socialmate-cloud-usage";
    private static final long DEEPSEEK_DAILY_MICROS = 1_000_000L;
    private static final long DOUBAO_DAILY_MICROS = 2_000_000L;

    private final Context appContext;
    private final CloudKeys keys;

    public DirectCloud(Context context) {
        this.appContext = context.getApplicationContext();
        this.keys = new CloudKeys(context);
    }

    public CloudKeys keys() { return keys; }

    public boolean canAi() { return keys.hasDeepSeek(); }
    public boolean canTts() { return keys.hasDoubao(); }

    /* ============================== AI ============================== */

    public JSONObject translate(JSONObject body) throws Exception {
        String text = body.optString("text", "").trim();
        if (text.isEmpty()) throw new LocalHttpException(400, "INVALID_INPUT", "缺少待翻译句子");
        if (text.length() > 700) throw new LocalHttpException(400, "TEXT_TOO_LARGE", "单句超过 700 字上限");
        if (!text.matches(".*[A-Za-z].*")) {
            return new JSONObject().put("ok", true).put("zh", text).put("mode", "passthrough")
                    .put("provider", "deepseek").put("billing", new JSONObject().put("costCny", 0));
        }
        JSONArray messages = new JSONArray()
                .put(new JSONObject().put("role", "system")
                        .put("content", "Translate the user's sentence into concise, natural Simplified Chinese. Output only the translation, no quotes, no explanation."))
                .put(new JSONObject().put("role", "user").put("content", text));
        String out = chat(messages, 320, "ai:translate", estimateDeepSeekChars(text.length(), 320));
        JSONObject result = new JSONObject().put("ok", true).put("zh", out.trim())
                .put("mode", "direct").put("provider", "deepseek");
        result.put("billing", new JSONObject().put("costCny", lastCostCny));
        return result;
    }

    public JSONObject draftEn(JSONObject body) throws Exception {
        String text = body.optString("text", "").trim();
        if (text.isEmpty()) throw new LocalHttpException(400, "INVALID_INPUT", "缺少中文内容");
        if (text.length() > 2000) throw new LocalHttpException(400, "TEXT_TOO_LARGE", "中文内容超过 2000 字上限");
        if (!text.matches(".*[\\u3400-\\u9fff].*")) {
            return new JSONObject().put("ok", true).put("en", text).put("draft", true)
                    .put("mode", "passthrough").put("provider", "deepseek")
                    .put("billing", new JSONObject().put("costCny", 0));
        }
        JSONArray messages = new JSONArray()
                .put(new JSONObject().put("role", "system")
                        .put("content", "Write one natural, spoken-style English version of the user's Chinese text. Keep the meaning and personal details. Output only the English sentence, no quotes, no explanation."))
                .put(new JSONObject().put("role", "user").put("content", text));
        String out = chat(messages, 420, "ai:draft-en", estimateDeepSeekChars(text.length(), 420));
        JSONObject result = new JSONObject().put("ok", true).put("en", out.trim()).put("draft", true)
                .put("mode", "direct").put("provider", "deepseek");
        result.put("billing", new JSONObject().put("costCny", lastCostCny));
        return result;
    }

    /**
     * 对话建议：与 Mac 端同一输出契约（页面要求 mode=real-ai 且 reply 是对象）。
     * 只发最近 6 句，不发人物档案；references 暂空，页面仍可显示回复/追问/分享。
     */
    public JSONObject analyze(JSONObject body) throws Exception {
        JSONArray input = body.optJSONArray("messages");
        if (input == null || input.length() < 1 || input.length() > 12) {
            throw new LocalHttpException(400, "INVALID_INPUT", "需要 1–12 句对话");
        }
        StringBuilder transcript = new StringBuilder();
        int chars = 0;
        for (int i = 0; i < input.length(); i++) {
            JSONObject m = input.optJSONObject(i);
            if (m == null) continue;
            String who = m.optString("speaker", "unknown");
            String text = m.optString("text", "").trim();
            if (text.isEmpty()) continue;
            transcript.append(who).append(": ").append(text).append('\n');
            chars += text.length();
        }
        if (transcript.length() == 0) throw new LocalHttpException(400, "INVALID_INPUT", "对话为空");
        if (chars > 3000) throw new LocalHttpException(400, "TEXT_TOO_LARGE", "对话超过 3000 字上限");

        JSONArray messages = new JSONArray()
                .put(new JSONObject().put("role", "system")
                        .put("content", "You help a Chinese learner keep an English conversation going. "
                                + "Create 1 short English reply, 2-3 related follow-up questions, and 1 grounded English share. "
                                + "Do not invent personal facts. Reply in exactly one JSON object: "
                                + "{\"topic\":\"中文话题\",\"reply\":\"English reply\",\"questions\":[\"Question 1\",\"Question 2\"],\"share\":\"Grounded English share\",\"references\":[]}."))
                .put(new JSONObject().put("role", "user").put("content", transcript.toString()));
        String raw = chat(messages, 620, "ai:analyze", estimateDeepSeekChars(chars, 620));
        JSONObject parsed;
        try {
            parsed = new JSONObject(extractJson(raw));
        } catch (Exception e) {
            throw new LocalHttpException(502, "INVALID_AI_OUTPUT", "AI 返回不是合法 JSON");
        }
        String reply = parsed.optString("reply", "").trim();
        String share = parsed.optString("share", "").trim();
        JSONArray questions = parsed.optJSONArray("questions");
        if (reply.isEmpty() || share.isEmpty() || questions == null || questions.length() < 1) {
            throw new LocalHttpException(502, "INVALID_AI_OUTPUT", "AI 缺少英文接话/追问/分享");
        }
        JSONObject replyObj = new JSONObject()
                .put("topic", parsed.optString("topic", "自然交流"))
                .put("reply", reply)
                .put("questions", questions)
                .put("share", share);
        JSONObject result = new JSONObject().put("ok", true).put("mode", "real-ai")
                .put("provider", "deepseek").put("reply", replyObj)
                .put("references", new JSONArray());
        result.put("billing", new JSONObject().put("costCny", lastCostCny));
        return result;
    }

    private volatile double lastCostCny = 0;

    private synchronized String chat(JSONArray messages, int maxTokens, String kind, long estimateMicros) throws Exception {
        String key = keys.get(CloudKeys.DEEPSEEK);
        if (key.isEmpty()) throw new LocalHttpException(503, "DEEPSEEK_NOT_CONFIGURED", "未配置 DeepSeek Key");
        reserve(kind, estimateMicros, DEEPSEEK_DAILY_MICROS);
        JSONObject payload = new JSONObject()
                .put("model", DEEPSEEK_MODEL)
                .put("messages", messages)
                .put("max_tokens", maxTokens)
                .put("temperature", 0.4)
                .put("stream", false);
        JSONObject response = postJson(DEEPSEEK_URL, payload, key, 25000);
        String content = "";
        JSONObject choices = null;
        JSONArray list = response.optJSONArray("choices");
        if (list != null && list.length() > 0) choices = list.optJSONObject(0);
        if (choices != null) {
            JSONObject message = choices.optJSONObject("message");
            if (message != null) content = message.optString("content", "");
        }
        if (content.isEmpty()) throw new LocalHttpException(502, "DEEPSEEK_EMPTY", "DeepSeek 没有返回内容");
        long actual = estimateMicros;
        JSONObject usage = response.optJSONObject("usage");
        if (usage != null) {
            long in = usage.optLong("prompt_tokens", 0);
            long out = usage.optLong("completion_tokens", 0);
            actual = in * 2 + out * 20;
        }
        commit(kind, actual);
        lastCostCny = round6(actual / 1_000_000.0);
        return content;
    }

    /* ============================== 豆包 TTS ============================== */

    public static final class TtsResult {
        public final byte[] bytes;
        public final String mime;
        TtsResult(byte[] bytes, String mime) {
            this.bytes = bytes;
            this.mime = mime;
        }
    }

    public TtsResult tts(JSONObject body) throws Exception {
        String key = keys.get(CloudKeys.DOUBAO);
        if (key.isEmpty()) throw new LocalHttpException(503, "DOUBAO_NOT_CONFIGURED", "未配置豆包 Key");
        String text = body.optString("text", "");
        if (text.isEmpty()) throw new LocalHttpException(400, "TEXT_REQUIRED", "text 不能为空");
        if (text.length() > 2000) throw new LocalHttpException(400, "TTS_TEXT_TOO_LONG", "单段朗读最多 2000 字符");
        if (!body.optBoolean("explicitConsent", false)) {
            throw new LocalHttpException(403, "CONSENT_REQUIRED", "云端朗读需要显式同意");
        }
        String voice = body.optString("voiceProfileId", body.optString("voiceId", ""));
        if (voice.isEmpty() || !voice.matches("^(zh_female_xiaohe_uranus_bigtts|zh_male_m191_uranus_bigtts|zh_female_yingyujiaoxue_uranus_bigtts)$")) {
            // 页面可能传系统 TTS 的 voice 名称（如 Ruth）；豆包只接受自己的 voicetype。
            voice = "zh_female_xiaohe_uranus_bigtts";
        }
        if (!voice.matches("^[A-Za-z0-9._-]{1,80}$")) {
            throw new LocalHttpException(400, "VOICE_INVALID", "音色标识不合法");
        }
        long estimate = text.length() * 300L;
        reserve("tts:doubao", estimate, DOUBAO_DAILY_MICROS);
        JSONObject audioParams = new JSONObject().put("format", "mp3").put("sample_rate", 24000)
                .put("speech_rate", 0);
        JSONObject payload = new JSONObject()
                .put("user", new JSONObject().put("uid", "alw001"))
                .put("req_params", new JSONObject()
                        .put("text", text)
                        .put("speaker", voice)
                        .put("model", "seed-tts-2.0-standard")
                        .put("audio_params", audioParams));
        byte[] raw = postBytes(DOUBAO_URL, payload, key, 30000);
        ByteArrayOutputStream audio = new ByteArrayOutputStream();
        int lastCode = -1;
        String lastMessage = "";
        for (String line : new String(raw, StandardCharsets.UTF_8).split("\\r?\\n")) {
            String trimmed = line.trim();
            if (trimmed.isEmpty()) continue;
            JSONObject obj;
            try {
                obj = new JSONObject(trimmed);
            } catch (Exception e) {
                continue;
            }
            if (obj.has("code")) {
                lastCode = obj.optInt("code", -1);
                lastMessage = obj.optString("message", obj.optString("msg", ""));
            }
            String data = obj.optString("data", "");
            if (!data.isEmpty()) {
                byte[] chunk = android.util.Base64.decode(data, android.util.Base64.DEFAULT);
                audio.write(chunk, 0, chunk.length);
            }
        }
        byte[] bytes = audio.toByteArray();
        if (lastCode != -1 && lastCode != 0 && lastCode != 20000000) {
            throw new LocalHttpException(502, "PROVIDER_ERROR",
                    "豆包返回错误码 " + lastCode + (lastMessage.isEmpty() ? "" : "：" + lastMessage));
        }
        if (bytes.length == 0) {
            String rawText = new String(raw, StandardCharsets.UTF_8);
            if (rawText.length() > 180) rawText = rawText.substring(0, 180);
            throw new LocalHttpException(502, "PROVIDER_EMPTY_AUDIO",
                    "豆包没有返回音频（响应：" + rawText + "）");
        }
        commit("tts:doubao", estimate);
        return new TtsResult(bytes, "audio/mpeg");
    }

    /* ============================== 预算 ============================== */

    private void reserve(String kind, long estimate, long dailyLimit) throws LocalHttpException {
        SharedPreferences prefs = appContext.getSharedPreferences(USAGE_PREFS, Context.MODE_PRIVATE);
        String today = today();
        String savedDate = prefs.getString("date", "");
        long spent = savedDate.equals(today) ? prefs.getLong(kind + ".spent", 0) : 0;
        if (spent + estimate > dailyLimit) {
            throw new LocalHttpException(402, "BUDGET_EXHAUSTED",
                    "本机今日额度已用完（" + round6(dailyLimit / 1_000_000.0) + " 元），明天再试");
        }
    }

    private void commit(String kind, long actual) {
        SharedPreferences prefs = appContext.getSharedPreferences(USAGE_PREFS, Context.MODE_PRIVATE);
        String today = today();
        String savedDate = prefs.getString("date", "");
        long spent = savedDate.equals(today) ? prefs.getLong(kind + ".spent", 0) : 0;
        prefs.edit().putString("date", today).putLong(kind + ".spent", spent + Math.max(0, actual)).apply();
    }

    /* ============================== HTTP ============================== */

    private static JSONObject postJson(String url, JSONObject payload, String key, int readTimeout) throws Exception {
        byte[] raw = postBytes(url, payload, key, readTimeout);
        try {
            return new JSONObject(new String(raw, StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new LocalHttpException(502, "PROVIDER_BAD_JSON", "厂商返回不是合法 JSON");
        }
    }

    private static byte[] postBytes(String url, JSONObject payload, String key, int readTimeout) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setRequestMethod("POST");
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(readTimeout);
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("Accept", "application/json");
        if (url.contains("api.deepseek.com")) {
            conn.setRequestProperty("Authorization", "Bearer " + key);
        }
        if (url.contains("openspeech.bytedance.com")) {
            conn.setRequestProperty("X-Api-Key", key);
            conn.setRequestProperty("X-Api-Resource-Id", DOUBAO_RESOURCE);
            conn.setRequestProperty("X-Api-Request-Id", UUID.randomUUID().toString());
        }
        conn.setDoOutput(true);
        byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
        try (OutputStream out = conn.getOutputStream()) {
            out.write(body);
            out.flush();
        }
        int status = conn.getResponseCode();
        InputStream in = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
        byte[] raw = in == null ? new byte[0] : readAll(in);
        if (status >= 400) {
            String message = "厂商返回 HTTP " + status;
            try {
                JSONObject error = new JSONObject(new String(raw, StandardCharsets.UTF_8));
                String code = error.optString("code", error.optJSONObject("header") == null
                        ? "" : error.optJSONObject("header").optString("code", ""));
                if (!code.isEmpty()) message += " · code " + code;
            } catch (Exception ignored) {}
            int mapped = status == 401 || status == 403 ? 403 : status == 429 ? 429 : 502;
            throw new LocalHttpException(mapped, "PROVIDER_REJECTED", message);
        }
        return raw;
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

    private static String extractJson(String raw) {
        String text = raw == null ? "" : raw.trim();
        if (text.startsWith("```")) {
            int first = text.indexOf('\n');
            int last = text.lastIndexOf("```");
            if (first > 0 && last > first) text = text.substring(first + 1, last).trim();
        }
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start >= 0 && end > start) return text.substring(start, end + 1);
        return text;
    }

    private static long estimateDeepSeekChars(int inputChars, int maxOutputTokens) {
        // 粗估：输入约 2 micros/字；输出按 20 micros/token。只用于本机每日闸，不做账单。
        return inputChars * 2L + maxOutputTokens * 20L;
    }

    private static String today() {
        SimpleDateFormat fmt = new SimpleDateFormat("yyyyMMdd", Locale.US);
        fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
        return fmt.format(new Date());
    }

    private static double round6(double value) {
        return Math.round(value * 1_000_000.0) / 1_000_000.0;
    }
}