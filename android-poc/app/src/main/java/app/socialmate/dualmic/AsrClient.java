package app.socialmate.dualmic;

import org.json.JSONObject;

import java.net.URI;
import java.nio.ByteBuffer;
import java.util.concurrent.TimeUnit;

import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;

/** Thin WebSocket client for the local ASR bridge. Holds no credentials; the server owns them. */
final class AsrClient extends WebSocketClient {
    interface Listener {
        void onAsrEvent(AsrClient client, JSONObject event);
        void onAsrState(AsrClient client, String state);
    }

    private final Listener listener;
    private final String label;

    AsrClient(URI uri, String label, Listener listener) {
        super(uri);
        this.label = label;
        this.listener = listener;
        setConnectionLostTimeout(0);
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
