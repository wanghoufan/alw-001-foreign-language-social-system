package app.socialmate.dualmic;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URI;
import java.util.HashMap;
import java.util.Map;

/**
 * 手机直连腾讯云实时语音识别（wss v2）。
 *
 * 与 Mac 中继的区别：
 * - 不经过 Mac/P066，也不需要配对令牌；签名 URL 由手机本地生成；
 * - 音频必须是 16k / mono PCM16 LE（由 Pcm16 转换）；
 * - 事件格式与 AsrClient/统一协议完全一致，页面与归档不需要改。
 *
 * 密钥只在内存中参与签名，不写日志、不放进事件。
 */
final class TencentAsrClient extends AsrClient {
    private static final int MAX_AUDIO_CHUNK_BYTES = 6400;

    private final String sessionId;
    private final String trackName;
    private final Map<String, String> lastFinal = new HashMap<>();
    private final Map<String, String> lastInterim = new HashMap<>();
    private volatile boolean readySent = false;
    private volatile boolean endedSent = false;

    TencentAsrClient(URI signedUri, String track, String sessionId, Listener listener) {
        super(signedUri, track, "", listener);
        this.trackName = track;
        this.sessionId = sessionId == null ? "" : sessionId;
    }

    @Override public void onMessage(String message) {
        JSONObject msg;
        try {
            msg = new JSONObject(message);
        } catch (Exception e) {
            emitError("ASR_BAD_JSON", "腾讯返回不是合法 JSON");
            return;
        }
        int code = msg.optInt("code", 0);
        if (code != 0) {
            emitError("ASR_UPSTREAM_" + code, "腾讯 ASR 错误 " + code + "：" + msg.optString("message", "unknown"));
            return;
        }
        if (!readySent) {
            readySent = true;
            emitSession("ready");
        }
        if (msg.optInt("final", 0) == 1) {
            // 同一包里可能同时带最后一句 sentences；必须先收句子，再结束会话。
            JSONObject tail = msg.optJSONObject("sentences");
            if (tail != null) handleSentences(tail);
            emitSession("ended");
            closeQuietly();
            return;
        }
        JSONObject sentences = msg.optJSONObject("sentences");
        if (sentences != null) {
            handleSentences(sentences);
            return;
        }
        JSONObject result = msg.optJSONObject("result");
        if (result != null) handleStandardResult(result);
    }

    @Override void sendPcm(byte[] pcm) {
        if (!isOpen() || pcm == null || pcm.length == 0) return;
        for (int offset = 0; offset < pcm.length; offset += MAX_AUDIO_CHUNK_BYTES) {
            int end = Math.min(pcm.length, offset + MAX_AUDIO_CHUNK_BYTES);
            byte[] chunk = offset == 0 && end == pcm.length ? pcm
                    : java.util.Arrays.copyOfRange(pcm, offset, end);
            send(chunk);
        }
    }

    @Override void finish() {
        if (!isOpen()) return;
        send("{\"type\":\"end\"}");
    }

    private void handleSentences(JSONObject sentences) {
        JSONArray list = sentences.optJSONArray("sentence_list");
        if (list == null) list = sentences.optJSONArray("speaker_sentences");
        if (list == null) {
            handleSentence(sentences);
            return;
        }
        for (int i = 0; i < list.length(); i++) {
            JSONObject sentence = list.optJSONObject(i);
            if (sentence != null) handleSentence(sentence);
        }
    }

    private void handleSentence(JSONObject sentence) {
        String text = sentence.optString("sentence", "").trim();
        if (text.isEmpty()) return;
        boolean isFinal = sentence.optInt("sentence_type", 0) == 1;
        String key = sentence.optString("sentence_id",
                sentence.optLong("start_time", 0) + "-" + sentence.optLong("end_time", 0));
        if (!remember(isFinal, key, text)) return;
        String speaker = speakerOf(sentence.optInt("speaker_id", -1));
        emit(isFinal ? "final" : "interim",
                text, sentence.optLong("start_time", 0), sentence.optLong("end_time", 0),
                speaker, isFinal, sentence.optString("sentence_id", key));
    }

    private void handleStandardResult(JSONObject result) {
        String text = result.optString("voice_text_str", "").trim();
        if (text.isEmpty()) return;
        boolean isFinal = result.optInt("slice_type", 0) == 2;
        String key = result.has("index") ? String.valueOf(result.optInt("index"))
                : result.optLong("start_time", 0) + "-" + result.optLong("end_time", 0);
        if (!remember(isFinal, key, text)) return;
        String speaker = speakerOf(result.optInt("speaker_id", -1));
        emit(isFinal ? "final" : "interim", text,
                result.optLong("start_time", 0), result.optLong("end_time", 0),
                speaker, isFinal, key);
    }

    private boolean remember(boolean isFinal, String key, String text) {
        Map<String, String> map = isFinal ? lastFinal : lastInterim;
        if (text.equals(map.get(key))) return false;
        map.put(key, text);
        return true;
    }

    private String speakerOf(int speakerId) {
        if ("A".equals(trackName) || "B".equals(trackName)) return trackName;
        return speakerId >= 0 ? "spk_" + speakerId : "unknown";
    }

    private void emit(String type, String text, long startMs, long endMs,
                      String speaker, boolean isFinal, String index) {
        try {
            JSONObject event = new JSONObject();
            event.put("type", type);
            event.put("track", trackName);
            event.put("text", text);
            event.put("startMs", startMs);
            event.put("endMs", endMs);
            event.put("speaker", speaker);
            event.put("confidence", JSONObject.NULL);
            event.put("final", isFinal);
            event.put("mock", false);
            event.put("provider", "tencent");
            event.put("sessionId", sessionId);
            event.put("index", index);
            listener.onAsrEvent(this, event);
        } catch (Exception ignored) {
        }
    }

    private void emitSession(String status) {
        try {
            JSONObject event = new JSONObject();
            event.put("type", "session");
            event.put("status", status);
            event.put("track", trackName);
            event.put("provider", "tencent");
            event.put("mock", false);
            event.put("sessionId", sessionId);
            listener.onAsrEvent(this, event);
        } catch (Exception ignored) {
        }
    }

    private void emitError(String code, String message) {
        try {
            JSONObject event = new JSONObject();
            event.put("type", "error");
            event.put("track", trackName);
            event.put("text", message);
            event.put("code", code);
            event.put("provider", "tencent");
            event.put("mock", false);
            event.put("sessionId", sessionId);
            listener.onAsrEvent(this, event);
        } catch (Exception ignored) {
        }
        closeQuietly();
    }

    private void closeQuietly() {
        if (endedSent) return;
        endedSent = true;
        try {
            close();
        } catch (Exception ignored) {
        }
    }
}