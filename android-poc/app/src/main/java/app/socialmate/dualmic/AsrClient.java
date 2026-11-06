package app.socialmate.dualmic;

import org.json.JSONObject;

import java.net.URI;
import java.nio.ByteBuffer;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;

/**
 * Thin WebSocket client for the local ASR bridge.
 *
 * Holds no upstream credentials: the only secret sent is the device's short-lived
 * pairing token in the {@code x-asr-token} handshake header. The bridge rejects the
 * upgrade before it ever opens an upstream P066/Tencent session.
 *
 * N05 V1.5.1：开启连接丢失探测（ping/pong），让 Wi-Fi→蜂窝切换后的“半开连接”能被发现，
 * 由 AsrActivity 做一次受限重连，而不是永远显示“正在听”。
 */
class AsrClient extends WebSocketClient {
    interface Listener {
        void onAsrEvent(AsrClient client, JSONObject event);
        void onAsrState(AsrClient client, String state);
    }

    /** 半开连接探测：超过该秒数没有 pong 就判定断开（服务端在本机/Tailnet，20s 足够）。 */
    private static final int CONNECTION_LOST_SECONDS = 20;

    protected final Listener listener;
    protected final String label;
    /** P1-2：重连后的事件时间轴偏移（本轮已录毫秒），避免页面字幕时间倒退。 */
    volatile long timeOffsetMs = 0;

    AsrClient(URI uri, String label, String token, Listener listener) {
        super(uri, handshakeHeaders(token));
        this.label = label;
        this.listener = listener;
        setConnectionLostTimeout(CONNECTION_LOST_SECONDS);
    }

    /** 短期配对令牌只走握手头，不进 URL、不写日志。 */
    private static Map<String, String> handshakeHeaders(String token) {
        Map<String, String> headers = new LinkedHashMap<>();
        String value = token == null ? "" : token.trim();
        if (!value.isEmpty()) headers.put("x-asr-token", value);
        return headers;
    }

    String label() { return label; }

    @Override public void onOpen(ServerHandshake handshake) {
        listener.onAsrState(this, "connected");
    }

    @Override public void onMessage(String message) {
        try {
            listener.onAsrEvent(this, new JSONObject(message));
        } catch (Exception e) {
            listener.onAsrState(this, "bad-json: " + e.getMessage());
        }
    }

    @Override public void onMessage(ByteBuffer bytes) {
        // Binary output is not part of the bridge contract.
    }

    @Override public void onClose(int code, String reason, boolean remote) {
        listener.onAsrState(this, "closed(" + code + ")");
    }

    @Override public void onError(Exception ex) {
        listener.onAsrState(this, "error: " + (ex.getMessage() == null ? ex.getClass().getSimpleName() : ex.getMessage()));
    }

    boolean awaitOpen() {
        try {
            return connectBlocking(4, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    boolean isAlive() {
        return isOpen();
    }

    void sendPcm(byte[] pcm) {
        if (isOpen()) send(pcm);
    }

    void finish() {
        if (isOpen()) send("{\"type\":\"end\"}");
    }

    void sendSuggest(String text, int limit) {
        if (!isOpen()) return;
        try {
            JSONObject message = new JSONObject();
            message.put("type", "suggest");
            message.put("text", text);
            message.put("limit", limit);
            send(message.toString());
        } catch (Exception ignored) {
            // A malformed local message is a programming error, not a protocol event.
        }
    }
}