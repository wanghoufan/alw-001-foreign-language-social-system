package app.socialmate.dualmic;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

/**
 * 会话原文归档 + 断网 outbox。
 *
 * 约束（对应产品化计划 B3/B4）：
 * - 只有用户勾选「留存并导出」才写盘；未勾选时 addFinal 直接丢弃。
 * - 只接受 final 事件；interim 不进入本类。
 * - 原文逐字保存，不 trim、不改写；识别错误原样保留。
 * - 每次追加 final 后原子写 current.json；停止时转存 outbox 并尝试上传。
 * - 上传成功（2xx）后才移入 exported/；失败保留在 outbox，下次启动/停止重试。
 * - 令牌只存本机 SharedPreferences，不写日志、不写文件内容。
 */
public final class SessionArchive {
    public interface Listener { void onArchiveStatus(String text); }

    private static final String PREFS = "socialmate-archive";
    private static final String KEY_URL = "archive_url";
    private static final String KEY_TOKEN = "archive_token";
    private static final String DEFAULT_URL =
            "https://mac-mini.tail4e4317.ts.net/alw/api/archive/session";

    private final Context context;
    private final File root;
    private final File outbox;
    private final File exported;
    private final SharedPreferences prefs;
    private final SecureRandom random = new SecureRandom();
    private final Handler main = new Handler(Looper.getMainLooper());

    private JSONObject current;
    private boolean retention;
    private volatile boolean uploading;
    private volatile String lastError;

    public SessionArchive(Context context) {
        this.context = context.getApplicationContext();
        this.root = new File(this.context.getFilesDir(), "archive");
        this.outbox = new File(root, "outbox");
        this.exported = new File(root, "exported");
        this.prefs = this.context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        //noinspection ResultOfMethodCallIgnored
        outbox.mkdirs();
        //noinspection ResultOfMethodCallIgnored
        exported.mkdirs();
    }

    public String archiveUrl() {
        String value = prefs.getString(KEY_URL, DEFAULT_URL);
        return value == null || value.trim().isEmpty() ? DEFAULT_URL : value.trim();
    }

    public void setArchiveUrl(String url) {
        prefs.edit().putString(KEY_URL, url == null ? "" : url.trim()).apply();
    }

    public String token() {
        String value = prefs.getString(KEY_TOKEN, "");
        return value == null ? "" : value.trim();
    }

    public void setToken(String token) {
        prefs.edit().putString(KEY_TOKEN, token == null ? "" : token.trim()).apply();
    }

    public int pendingCount() {
        File[] files = outbox.listFiles((dir, name) -> name.endsWith(".json"));
        return files == null ? 0 : files.length;
    }

    public String lastError() {
        return lastError;
    }

    /** 开启一次会话；未勾选留存时不创建任何落盘对象。 */
    public synchronized void begin(boolean retentionAllowed, String appVersion) {
        retention = retentionAllowed;
        current = null;
        if (!retentionAllowed) return;
        try {
            String stamp = Instant.now().toString().replace("-", "").replace(":", "").replace(".", "");
            String id = "sess_" + stamp.substring(0, 15) + "_" + hex(3);
            JSONObject consent = new JSONObject()
                    .put("recording", true)
                    .put("retention", true)
                    .put("cloudAi", false);
            current = new JSONObject()
                    .put("sessionId", id)
                    .put("startedAt", Instant.now().toString())
                    .put("appVersion", appVersion == null ? "unknown" : appVersion)
                    .put("consent", consent)
                    .put("revision", 1)
                    .put("segments", new JSONArray());
        } catch (Exception e) {
            lastError = e.getClass().getSimpleName();
            current = null;
        }
    }

    /** final 原文逐字追加；interim、空串、未开留存都会被忽略。 */
    public synchronized void addFinal(String text, long startMs, long endMs,
                                      String speakerId, String track, String provider, boolean mock) {
        if (!retention || current == null) return;
        if (text == null || text.isEmpty()) return;
        try {
            JSONArray segments = current.getJSONArray("segments");
            JSONObject segment = new JSONObject()
                    .put("eventId", UUID.randomUUID().toString())
                    .put("final", true)
                    .put("startMs", Math.max(0, startMs))
                    .put("endMs", Math.max(startMs, endMs))
                    .put("receivedAt", Instant.now().toString())
                    .put("speakerId", speakerId == null || speakerId.isEmpty() ? "unknown" : speakerId)
                    .put("track", track == null ? "mix" : track)
                    .put("provider", provider == null ? "tencent" : provider)
                    .put("mock", mock)
                    .put("textOriginal", text);
            segments.put(segment);
            writeAtomic(new File(root, "current.json"), current.toString());
        } catch (Exception e) {
            lastError = e.getClass().getSimpleName();
        }
    }

    /** 停止录音：把当前会话移入 outbox，并尝试立即上传。 */
    public synchronized void end() {
        if (!retention || current == null) { retention = false; return; }
        try {
            current.put("endedAt", Instant.now().toString());
            if (current.getJSONArray("segments").length() == 0) {
                // 没有 final 的空会话不落盘。
                current = null;
                File tmp = new File(root, "current.json");
                //noinspection ResultOfMethodCallIgnored
                tmp.delete();
                retention = false;
                return;
            }
            String id = current.getString("sessionId");
            writeAtomic(new File(outbox, id + ".json"), current.toString());
            File tmp = new File(root, "current.json");
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
        } catch (Exception e) {
            lastError = e.getClass().getSimpleName();
        } finally {
            current = null;
            retention = false;
        }
    }

    public void flushAsync(Listener listener) {
        if (uploading) return;
        String url = archiveUrl();
        String token = token();
        if (url.isEmpty() || token.isEmpty()) {
            notify(listener, "原文归档：待配置（需填写接收地址与令牌）");
            return;
        }
        uploading = true;
        new Thread(() -> {
            int ok = 0;
            File[] listed = outbox.listFiles((dir, name) -> name.endsWith(".json"));
            List<File> files = listed == null ? new ArrayList<>() : new ArrayList<>(Arrays.asList(listed));
            files.sort((a, b) -> a.getName().compareTo(b.getName()));
            for (File file : files) {
                if (!upload(file, url, token)) break;
                //noinspection ResultOfMethodCallIgnored
                file.renameTo(new File(exported, file.getName()));
                ok++;
            }
            uploading = false;
            String message = "原文归档：已导出 " + ok + " 条 · 待导出 " + pendingCount()
                    + (lastError == null ? "" : " · 上次失败 " + lastError);
            notify(listener, message);
        }, "archive-outbox").start();
    }

    private boolean upload(File file, String url, String token) {
        HttpURLConnection connection = null;
        try {
            String body = readFile(file);
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(12000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("X-Archive-Token", token);
            byte[] payload = body.getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(payload.length);
            try (java.io.OutputStream os = connection.getOutputStream()) {
                os.write(payload);
            }
            int code = connection.getResponseCode();
            if (code >= 200 && code < 300) {
                lastError = null;
                return true;
            }
            InputStream error = connection.getErrorStream();
            String detail = error == null ? "" : new String(readAll(error), StandardCharsets.UTF_8);
            lastError = "HTTP " + code + (detail.isEmpty() ? "" : " " + shorten(detail));
            return false;
        } catch (Exception e) {
            lastError = e.getClass().getSimpleName();
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String readFile(File file) throws IOException {
        return new String(readAll(new java.io.FileInputStream(file)), StandardCharsets.UTF_8);
    }

    private static byte[] readAll(InputStream input) throws IOException {
        java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
        byte[] chunk = new byte[4096];
        int read;
        while ((read = input.read(chunk)) >= 0) buffer.write(chunk, 0, read);
        input.close();
        return buffer.toByteArray();
    }

    private static String shorten(String value) {
        String oneLine = value.replace('\n', ' ').trim();
        return oneLine.length() > 160 ? oneLine.substring(0, 160) + "…" : oneLine;
    }

    private void writeAtomic(File target, String body) throws IOException {
        File tmp = new File(target.getAbsolutePath() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(body.getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        }
        if (!tmp.renameTo(target)) {
            //noinspection ResultOfMethodCallIgnored
            target.delete();
            if (!tmp.renameTo(target)) throw new IOException("rename failed");
        }
    }

    private String hex(int bytes) {
        byte[] value = new byte[bytes];
        random.nextBytes(value);
        StringBuilder sb = new StringBuilder();
        for (byte b : value) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    private void notify(Listener listener, String text) {
        if (listener != null) main.post(() -> listener.onArchiveStatus(text));
    }
}