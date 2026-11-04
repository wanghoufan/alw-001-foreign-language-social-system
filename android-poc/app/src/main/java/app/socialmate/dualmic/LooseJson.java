package app.socialmate.dualmic;

import org.json.JSONObject;

/**
 * JSONObject 的链式写入版本：Android 的 JSONObject.put 声明了 checked JSONException，
 * 直接链式写会让每个调用点都套 try/catch。这里只在内部吞掉写入异常（键/值全是自家字符串）。
 */
final class LooseJson extends JSONObject {
    @Override public LooseJson put(String key, boolean value) { write(key, value); return this; }

    @Override public LooseJson put(String key, double value) { write(key, value); return this; }

    @Override public LooseJson put(String key, int value) { write(key, value); return this; }

    @Override public LooseJson put(String key, long value) { write(key, value); return this; }

    @Override public LooseJson put(String key, Object value) { write(key, value); return this; }

    @Override public LooseJson putOpt(String key, Object value) { write(key, value); return this; }

    private void write(String key, Object value) {
        try {
            super.put(key, value);
        } catch (Exception ignored) {
        }
    }
}
