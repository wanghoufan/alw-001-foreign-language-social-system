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
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 会话原文归档 + 断网 outbox。
 *
 * 约束（对应产品化计划 B3/B4、P0-01/P0-02）：
 * - 只有用户勾选「留存并导出」才写盘；未勾选时 addFinal 直接丢弃（0 写盘 0 上传）。
 * - 只接受 final 事件；interim 不进入本类。
 * - 原文逐字保存，不 trim、不改写；识别错误原样保留。
 * - 每次追加 final 后原子写 current.json；停止时转存 outbox 并尝试上传。
 * - 上传成功（2xx）后才移入 exported/；失败保留在 outbox，按 3/10/30/60s 退避补传，最多 6 次。
 * - 同一时刻只允许一个上传线程（single-flight）；sessionId 兼作服务端幂等键，重复上传不会重复归档。
 * - 令牌只存本机 SharedPreferences，不写日志、不写文件内容。
 */
public final class SessionArchive {
    public interface Listener { void onArchiveStatus(String text); }

    private static final String PREFS = "socialmate-archive";
    private static final String KEY_URL = "archive_url";
    private static final String KEY_TOKEN = "archive_token";
    private static final String DEFAULT_URL =
            "https://mac-mini.tail4e4317.ts.net/alw/api/archive/session";

    /** 断网补传退避：3s / 10s / 30s / 60s，之后稳定 60s，最多 6 次，不做常驻轮询。 */
    private static final long[] RETRY_DELAYS_MS = {3_000L, 10_000L, 30_000L, 60_000L, 60_000L, 60_000L};

    private final Context context;
    private final File root;
    private final File outbox;
    private final File exported;
    private final SharedPreferences prefs;
    private final SecureRandom random = new SecureRandom();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AtomicBoolean uploading = new AtomicBoolean(false);

    private volatile Listener listener;
    private JSONObject current;
    private volatile boolean retention;
    private volatile String lastError;
    /** 最近一次会话 ID；即使用户停止后仍在，用于打开「本轮原文与复盘」。 */
    private volatile String lastSessionId;

    /** 本轮已落盘（手机）的定稿条数，用于状态文案。 */
    private volatile int savedSegments;
    /** 最近一次补传失败的次数（0 表示没有进行中的退避）。 */
    private volatile int retryAttempt;
    private volatile boolean lastUploadFailed;
    private volatile boolean everSynced;
    private volatile boolean configMissing;

    private final Runnable retryTask = () -> flushAsync(null);

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

    /** 本轮会话 ID（仅在开启留存且会话非空时存在）。 */
    public String lastSessionId() {
        return lastSessionId;
    }

    /** 该会话是否已经成功上传到 Mac（决定能否直接查看原文与复盘）。 */
    public boolean isExported(String sessionId) {
        if (sessionId == null || sessionId.isEmpty()) return false;
        return new File(exported, sessionId + ".json").exists();
    }

    public String lastError() {
        return lastError;
    }

    /** 状态栏监听；设置后所有状态变化都会自动推送到这里。 */
    public void setListener(Listener value) {
        this.listener = value;
    }

    /**
     * 用户能看懂的中文四态：手机已保存 / 待上传 N 条 / 已同步 Mac / 失败可重试。
     * 本地已保存 ≠ Mac 已收妥，只有真正 2xx 成功才会显示「已同步 Mac」。
     */
    public String describe() {
        int pending = pendingCount();
        if (retention && current != null) {
            return "原文留存：已开启 · 手机已保存 " + savedSegments + " 条\n"
                    + "同步状态：停止录音后自动上传（待上传 " + pending + " 条）";
        }
        if (savedSegments == 0 && pending == 0) {
            return "原文留存：未开启 · 默认不留存（0 条写盘 · 0 条上传）";
        }
        String first = "原文留存：手机已保存 " + savedSegments + " 条";
        String second;
        if (pending == 0) {
            second = everSynced
                    ? "同步状态：已同步 Mac · 待上传 0 条"
                    : "同步状态：手机已保存，尚未上传（需先在高级设置填接收地址与令牌）";
        } else if (configMissing) {
            second = "同步状态：待上传 " + pending + " 条（未配置接收端）";
        } else if (lastUploadFailed) {
            second = "同步状态：失败可重试 · 待上传 " + pending + " 条";
        } else if (uploading.get()) {
            second = "同步状态：正在上传 · 待上传 " + pending + " 条";
        } else {
            second = "同步状态：待上传 " + pending + " 条（网络恢复后自动补传）";
        }
        return first + "\n" + second;
    }

    /** 开启一次会话；未勾选留存时不创建任何落盘对象。 */
    public synchronized void begin(boolean retentionAllowed, String appVersion) {
        retention = retentionAllowed;
        current = null;
        lastSessionId = null;
        savedSegments = 0;
        retryAttempt = 0;
        lastUploadFailed = false;
        configMissing = false;
        main.removeCallbacks(retryTask);
        if (!retentionAllowed) return;
        try {
            String stamp = Instant.now().toString().replace("-", "").replace(":", "").replace(".", "");
            String id = "sess_" + stamp.substring(0, 15) + "_" + hex(3);
            lastSessionId = id;
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
            savedSegments = segments.length();
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
                lastSessionId = null;
                savedSegments = 0;
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

    /** 网络恢复时调用：清空退避计数并立即补传一次（不常驻轮询）。 */
    public void onNetworkAvailable() {
        retryAttempt = 0;
        main.removeCallbacks(retryTask);
        flushAsync(null);
    }

    public void flushAsync(Listener target) {
        if (target != null) this.listener = target;
        int pending = pendingCount();
        if (pending == 0) {
            lastUploadFailed = false;
            notifyStatus();
            return;
        }
        String url = archiveUrl();
        String token = token();
        if (url.isEmpty() || token.isEmpty()) {
            configMissing = true;
            notifyStatus();
            return;
        }
        configMissing = false;
        // single-flight：并发调用（启动/停止/网络恢复）只允许一个线程真正上传。
        if (!uploading.compareAndSet(false, true)) return;
        notifyStatus();
        new Thread(this::drainOutbox, "archive-outbox").start();
    }

    private void drainOutbox() {
        String url = archiveUrl();
        String token = token();
        int ok = 0;
        boolean failed = false;
        try {
            File[] listed = outbox.listFiles((dir, name) -> name.endsWith(".json"));
            List<File> files = listed == null ? new ArrayList<>() : new ArrayList<>(Arrays.asList(listed));
            files.sort((a, b) -> a.getName().compareTo(b.getName()));
            for (File file : files) {
                if (!upload(file, url, token)) { failed = true; break; }
                File dest = new File(exported, file.getName());
                if (!file.renameTo(dest)) { failed = true; break; }
                ok++;
            }
        } finally {
            uploading.set(false);
        }
        lastUploadFailed = failed;
        if (failed) {
            scheduleRetry();
        } else {
            retryAttempt = 0;
            if (ok > 0) everSynced = true;
            main.removeCallbacks(retryTask);
        }
        notifyStatus();
    }

    private void scheduleRetry() {
        if (retryAttempt >= RETRY_DELAYS_MS.length) return; // 最多 6 次，不无限重试。
        long delay = RETRY_DELAYS_MS[retryAttempt++];
        main.removeCallbacks(retryTask);
        main.postDelayed(retryTask, delay);
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

    private void notifyStatus() {
        Listener target = listener;
        if (target == null) return;
        String text = describe();
        main.post(() -> target.onArchiveStatus(text));
    }
}
