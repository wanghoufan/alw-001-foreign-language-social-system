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
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 会话原文归档 + 断网 outbox（N04 V1.3 T3）。
 *
 * 约束：
 * - 只有用户勾选「留存并导出」才写盘；未勾选时 addFinal 直接丢弃（0 写盘 0 上传）。
 * - 只接受 final 事件；interim 不进入本类。原文逐字保存，不 trim、不改写。
 * - 每次追加 final 后原子写 current.json；停止时转存 outbox 并尝试上传。
 * - 进程被杀/设备重启时，启动阶段把残留 current.json 补进 outbox（不静默丢原文）。
 * - 上传成功（2xx）后才移入 exported/ 并写 ack；失败保留在 outbox，按 3/10/30/60/60/60s
 *   退避，最多 6 次。耗尽后进入「自动重试已用完」，等联网/手动补传恢复，不删数据。
 * - 401/403（授权）、413（体积超限）、其它 4xx（服务拒绝）不盲目重试：保留原文并明确告知；
 *   429/5xx/网络不可达属于可重试。
 * - sessionId 兼作服务端幂等键；同一份 outbox 重放只会得到 duplicate，不会写第二份。
 * - 令牌来源只有一个：设备配对换来的短期令牌。未配对 / 令牌过期 → fail closed，不上传、不伪造已同步。
 */
public final class SessionArchive {
    public interface Listener { void onArchiveStatus(String text); }
    /** 令牌来源：设备配对换来的短期令牌（不再接受手填长期令牌）。 */
    public interface TokenProvider { String currentToken(); }
    /**
     * 401 恢复：用设备证明现取一张新令牌。实现方必须自身做网络请求，
     * 只在后台上传线程调用；返回空串表示无法刷新（未配对/已被撤销）。
     */
    public interface TokenRefresher { String refreshToken(); }

    private static final String PREFS = "socialmate-archive";
    private static final String KEY_URL = "archive_url";
    /** 旧版本曾把长期令牌明文写在这里；启动时清除，永不回读。 */
    private static final String KEY_LEGACY_TOKEN = "archive_token";
    private static final String KEY_SYNCED_AT = "last_synced_at";
    private static final String DEFAULT_URL =
            "https://mac-mini.tail4e4317.ts.net/alw/api/archive/session";

    /** 断网补传退避：3s / 10s / 30s / 60s，之后稳定 60s，最多 6 次，不做常驻轮询。 */
    private static final long[] RETRY_DELAYS_MS = {3_000L, 10_000L, 30_000L, 60_000L, 60_000L, 60_000L};
    /** 与服务端 archive-receiver.mjs 的 MAX_BODY 保持一致。 */
    private static final int MAX_UPLOAD_BYTES = 512 * 1024;

    private final Context context;
    private final File root;
    private final File outbox;
    private final File exported;
    private final File quarantine;
    private final SharedPreferences prefs;
    private final SecureRandom random = new SecureRandom();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AtomicBoolean uploading = new AtomicBoolean(false);

    private volatile Listener listener;
    private volatile TokenProvider tokenProvider;
    private volatile TokenRefresher tokenRefresher;
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
    /** 6 次退避用完或遇到不可重试状态：需要联网/手动补传才能继续。 */
    private volatile boolean retryExhausted;
    private volatile boolean everSynced;
    private volatile boolean configMissing;
    private volatile String lastSyncedAt = "";
    /** 机器可读的失败分类：OFFLINE / AUTH / THROTTLED / SERVER / TOO_LARGE / REJECTED / CONFIG。 */
    private volatile String lastErrorCode = "";
    private volatile int lastHttpStatus;
    /** 启动时从残留 current.json 补进 outbox 的会话数；无法解析的进 quarantine。 */
    private volatile int recoveredSessions;
    private volatile int quarantinedSessions;

    private final Runnable retryTask = () -> flushAsync(null);

    public SessionArchive(Context context) {
        this.context = context.getApplicationContext();
        this.root = new File(this.context.getFilesDir(), "archive");
        this.outbox = new File(root, "outbox");
        this.exported = new File(root, "exported");
        this.quarantine = new File(root, "quarantine");
        this.prefs = this.context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        //noinspection ResultOfMethodCallIgnored
        outbox.mkdirs();
        //noinspection ResultOfMethodCallIgnored
        exported.mkdirs();
        //noinspection ResultOfMethodCallIgnored
        quarantine.mkdirs();
        // 清除历史版本的明文长期令牌：T1 起只认配对短期令牌。
        if (prefs.contains(KEY_LEGACY_TOKEN)) prefs.edit().remove(KEY_LEGACY_TOKEN).apply();
        lastSyncedAt = prefs.getString(KEY_SYNCED_AT, "");
        everSynced = !lastSyncedAt.isEmpty();
        recoveredSessions = recoverStaleSession();
        writeState();
    }

    public String archiveUrl() {
        String value = prefs.getString(KEY_URL, DEFAULT_URL);
        return value == null || value.trim().isEmpty() ? DEFAULT_URL : value.trim();
    }

    public void setArchiveUrl(String url) {
        prefs.edit().putString(KEY_URL, url == null ? "" : url.trim()).apply();
    }

    public void setTokenProvider(TokenProvider provider) {
        this.tokenProvider = provider;
    }

    /** 401（短期令牌过期）时的一次性刷新器；403 撤销/权限不足不会调用它。 */
    public void setTokenRefresher(TokenRefresher refresher) {
        this.tokenRefresher = refresher;
    }

    /**
     * 实际用于上传的令牌：只来自设备配对。
     * 没有配对/令牌时返回空串，flushAsync 会 fail closed（不发请求、不伪造已同步）。
     */
    private String effectiveToken() {
        TokenProvider provider = tokenProvider;
        if (provider == null) return "";
        String value = provider.currentToken();
        return value == null ? "" : value.trim();
    }

    public int pendingCount() {
        File[] files = outbox.listFiles((dir, name) -> name.endsWith(".json"));
        return files == null ? 0 : files.length;
    }

    /** 本轮会话 ID（仅在开启留存且会话非空时存在）。 */
    public String lastSessionId() {
        return lastSessionId;
    }

    /** 该会话是否已经成功上传到 Mac（服务端 2xx 后才写 exported）。 */
    public boolean isExported(String sessionId) {
        if (sessionId == null || sessionId.isEmpty()) return false;
        return new File(exported, sessionId + ".json").exists();
    }

    /**
     * T4 只读降级用：手机本地历史（离线时唯一可信的「自己的」历史）。
     * 只读文件系统，不触发任何网络/上传；「已同步」只认 exported 下的实体文件。
     */
    public String localHistorySummary(int limit) {
        java.util.List<String> lines = new java.util.ArrayList<>();
        File[] done = exported.listFiles((dir, name) -> name.endsWith(".json") && !name.endsWith(".ack.json"));
        File[] waiting = outbox.listFiles((dir, name) -> name.endsWith(".json"));
        int doneCount = done == null ? 0 : done.length;
        int waitCount = waiting == null ? 0 : waiting.length;
        if (waiting != null) {
            java.util.Arrays.sort(waiting, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
            for (File f : waiting) {
                if (lines.size() >= limit) break;
                lines.add("· " + stripJson(f.getName()) + " · 待上传 Mac");
            }
        }
        if (done != null) {
            java.util.Arrays.sort(done, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
            for (File f : done) {
                if (lines.size() >= limit) break;
                lines.add("· " + stripJson(f.getName()) + " · 已同步 Mac");
            }
        }
        if (lines.isEmpty()) return "本机还没有留存过的会话（未开启原文留存时不会写盘）。";
        String head = "共 " + (doneCount + waitCount) + " 段（已同步 " + doneCount + " · 待上传 " + waitCount + "）";
        return head + "\n" + String.join("\n", lines);
    }

    private static String stripJson(String name) {
        return name.endsWith(".json") ? name.substring(0, name.length() - 5) : name;
    }

    public String lastError() {
        return lastError;
    }

    public String lastSyncedAt() {
        return lastSyncedAt;
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
            return "原文留存：已开启 · 本轮手机已保存 " + savedSegments + " 条\n"
                    + "同步状态：停止录音后自动上传（待上传 " + pending + " 条）";
        }
        if (savedSegments == 0 && pending == 0) {
            if (everSynced) return "原文留存：本机无待补传会话\n" + syncLine(0);
            if (quarantinedSessions > 0) {
                return "原文留存：未开启 · 默认不留存（0 条写盘 · 0 条上传）\n"
                        + "同步状态：有 " + quarantinedSessions + " 份无法解析的旧记录已隔离保留（未删除）";
            }
            return "原文留存：未开启 · 默认不留存（0 条写盘 · 0 条上传）";
        }
        String first = savedSegments > 0
                ? "原文留存：手机已保存 " + savedSegments + " 条"
                : "原文留存：手机上有待补传的会话";
        return first + "\n" + syncLine(pending);
    }

    private String syncLine(int pending) {
        if (pending == 0) {
            if (everSynced) return "同步状态：已同步 Mac" + (lastSyncedAt.isEmpty() ? "" : " · " + lastSyncedAt);
            return "同步状态：手机已保存，尚未上传（需先配对这台手机）";
        }
        if (configMissing) {
            return "同步状态：待上传 " + pending + " 条（未配对/无令牌，已停止上传）";
        }
        if ("AUTH".equals(lastErrorCode)) {
            return "同步状态：授权失败" + httpSuffix() + " · 待上传 " + pending + " 条 · 原文仍在手机，"
                    + "请重新配对后点「立即补传」";
        }
        if ("TOO_LARGE".equals(lastErrorCode)) {
            return "同步状态：单条会话超过 512KB 上限 · 待上传 " + pending + " 条 · 原文仍在手机（未删除）";
        }
        if ("REJECTED".equals(lastErrorCode)) {
            return "同步状态：服务端拒绝" + httpSuffix() + " · 待上传 " + pending + " 条 · 原文仍在手机（未删除）";
        }
        if (retryExhausted) {
            return "同步状态：自动重试 6 次已用完（" + reasonText() + "）· 待上传 " + pending
                    + " 条 · 原文仍在手机，联网或点「立即补传」可继续";
        }
        if (uploading.get()) {
            return "同步状态：正在上传 · 待上传 " + pending + " 条";
        }
        if (lastUploadFailed) {
            return "同步状态：第 " + Math.min(retryAttempt, RETRY_DELAYS_MS.length) + "/"
                    + RETRY_DELAYS_MS.length + " 次补传失败（" + reasonText() + "）· 待上传 " + pending + " 条";
        }
        return "同步状态：待上传 " + pending + " 条（网络恢复后自动补传）";
    }

    private String httpSuffix() {
        return lastHttpStatus > 0 ? "（HTTP " + lastHttpStatus + "）" : "";
    }

    private String reasonText() {
        String code = lastErrorCode;
        if ("OFFLINE".equals(code)) return "网络不可达";
        if ("THROTTLED".equals(code)) return "服务限流 429";
        if ("SERVER".equals(code)) return "服务端 " + (lastHttpStatus > 0 ? lastHttpStatus : "异常");
        if ("AUTH".equals(code)) return "授权失败";
        if ("TOO_LARGE".equals(code)) return "体积超限";
        if ("CONFIG".equals(code)) return "未配置接收端";
        if ("REJECTED".equals(code)) return "服务端拒绝 " + (lastHttpStatus > 0 ? lastHttpStatus : "");
        return lastError == null || lastError.isEmpty() ? "原因未知" : lastError;
    }

    /** 开启一次会话；未勾选留存时不创建任何落盘对象。 */
    public synchronized void begin(boolean retentionAllowed, String appVersion) {
        // 上一次会话若因进程被杀没走 end()，先补进 outbox，再开新会话。
        recoveredSessions += recoverStaleSession();
        retention = retentionAllowed;
        current = null;
        lastSessionId = null;
        savedSegments = 0;
        retryAttempt = 0;
        lastUploadFailed = false;
        retryExhausted = false;
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
        writeState();
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
            writeState();
        } catch (Exception e) {
            lastError = e.getClass().getSimpleName();
        }
    }

    /** 停止录音：把当前会话移入 outbox，并尝试立即上传。 */
    public synchronized void end() {
        if (!retention || current == null) { retention = false; writeState(); return; }
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
            writeState();
        }
    }

    /** 网络恢复时调用：清空退避计数并立即补传一次（不常驻轮询）。 */
    public void onNetworkAvailable() {
        retryAttempt = 0;
        retryExhausted = false;
        lastUploadFailed = false;
        main.removeCallbacks(retryTask);
        flushAsync(null);
    }

    /** 用户点「立即补传」：重置退避预算，忽略上一次的授权/拒绝状态，重新试一次。 */
    public void retryNow() {
        retryNow(null);
    }

    public void retryNow(Listener target) {
        retryAttempt = 0;
        retryExhausted = false;
        lastUploadFailed = false;
        lastErrorCode = "";
        lastHttpStatus = 0;
        configMissing = false;
        main.removeCallbacks(retryTask);
        flushAsync(target);
    }

    public void flushAsync(Listener target) {
        if (target != null) this.listener = target;
        int pending = pendingCount();
        if (pending == 0) {
            lastUploadFailed = false;
            retryExhausted = false;
            notifyStatus();
            return;
        }
        String url = archiveUrl();
        String token = effectiveToken();
        if (url.isEmpty() || token.isEmpty()) {
            configMissing = true;
            lastErrorCode = "CONFIG";
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
        String token = effectiveToken();
        int ok = 0;
        boolean retryable = false;
        // 401 只允许在本轮补传里刷新一次并重试一次，避免过期令牌触发暴力刷新循环。
        boolean tokenRefreshed = false;
        try {
            File[] listed = outbox.listFiles((dir, name) -> name.endsWith(".json"));
            List<File> files = listed == null ? new ArrayList<>() : new ArrayList<>(Arrays.asList(listed));
            files.sort((a, b) -> a.getName().compareTo(b.getName()));
            for (File file : files) {
                Upload result = upload(file, url, token);
                if (!result.ok && result.expired && !tokenRefreshed) {
                    tokenRefreshed = true;
                    String refreshed = refreshTokenOnce();
                    if (!refreshed.isEmpty()) {
                        token = refreshed;
                        result = upload(file, url, token);
                    }
                }
                if (!result.ok) {
                    retryable = result.retryable;
                    break;
                }
                File dest = new File(exported, file.getName());
                if (dest.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    dest.delete();
                }
                if (!file.renameTo(dest)) {
                    retryable = false;
                    lastErrorCode = "REJECTED";
                    lastError = "local rename failed";
                    break;
                }
                writeAck(file.getName(), result.hash);
                ok++;
            }
        } finally {
            uploading.set(false);
        }
        lastUploadFailed = retryable;
        if (retryable) {
            scheduleRetry();
        } else {
            retryAttempt = 0;
            if (ok > 0) {
                everSynced = true;
                retryExhausted = false;
                lastSyncedAt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
                        .withZone(ZoneId.systemDefault()).format(Instant.now());
                prefs.edit().putString(KEY_SYNCED_AT, lastSyncedAt).apply();
            }
            main.removeCallbacks(retryTask);
        }
        notifyStatus();
    }

    private void scheduleRetry() {
        if (retryAttempt >= RETRY_DELAYS_MS.length) {
            retryExhausted = true; // 最多 6 次，不无限重试；数据仍在 outbox。
            return;
        }
        long delay = RETRY_DELAYS_MS[retryAttempt++];
        main.removeCallbacks(retryTask);
        main.postDelayed(retryTask, delay);
    }

    /** 后台线程调用：用设备证明换一张新短期令牌；失败返回空串（fail closed）。 */
    private String refreshTokenOnce() {
        TokenRefresher refresher = tokenRefresher;
        if (refresher == null) return "";
        try {
            String value = refresher.refreshToken();
            return value == null ? "" : value.trim();
        } catch (Exception e) {
            lastError = e.getClass().getSimpleName();
            return "";
        }
    }

    private static final class Upload {
        final boolean ok;
        final boolean retryable;
        /** HTTP 401：短期令牌过期，可用设备证明刷新后重试一次。 */
        final boolean expired;
        final String hash;
        Upload(boolean ok, boolean retryable, String hash) {
            this(ok, retryable, false, hash);
        }
        Upload(boolean ok, boolean retryable, boolean expired, String hash) {
            this.ok = ok;
            this.retryable = retryable;
            this.expired = expired;
            this.hash = hash;
        }
    }

    private Upload upload(File file, String url, String token) {
        long size = file.length();
        if (size > MAX_UPLOAD_BYTES) {
            // 本地先判体积：不发起注定 413 的请求，原文保留在 outbox。
            lastHttpStatus = 413;
            lastErrorCode = "TOO_LARGE";
            lastError = "payload " + size + " bytes > " + MAX_UPLOAD_BYTES;
            return new Upload(false, false, null);
        }
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
            lastHttpStatus = code;
            if (code >= 200 && code < 300) {
                lastError = null;
                lastErrorCode = "";
                return new Upload(true, false, readAckHash(connection));
            }
            InputStream error = connection.getErrorStream();
            String detail = error == null ? "" : new String(readAll(error), StandardCharsets.UTF_8);
            lastError = "HTTP " + code + (detail.isEmpty() ? "" : " " + shorten(detail));
            if (code == 401) {
                // 短期令牌过期：标记为可刷新，由 drainOutbox 用设备证明换一次新令牌再试一次。
                lastErrorCode = "AUTH";
                return new Upload(false, false, true, null);
            }
            if (code == 403) {
                // 设备撤销/权限不足：刷新令牌也不会好转，fail closed 并提示重新配对。
                lastErrorCode = "AUTH";
                return new Upload(false, false, null);
            }
            if (code == 413) {
                lastErrorCode = "TOO_LARGE";
                return new Upload(false, false, null);
            }
            if (code == 429) {
                lastErrorCode = "THROTTLED";
                return new Upload(false, true, null);
            }
            if (code >= 500) {
                lastErrorCode = "SERVER";
                return new Upload(false, true, null);
            }
            lastErrorCode = "REJECTED";
            return new Upload(false, false, null);
        } catch (Exception e) {
            // ConnectException / UnknownHost / timeout 都按「暂不可达」处理，继续退避。
            lastError = e.getClass().getSimpleName();
            lastErrorCode = "OFFLINE";
            lastHttpStatus = 0;
            return new Upload(false, true, null);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    /** 服务端 2xx 回执里的 contentHash，用于事后核对「同一份原文只归档一次」。 */
    private static String readAckHash(HttpURLConnection connection) {
        try {
            InputStream input = connection.getInputStream();
            if (input == null) return "";
            JSONObject parsed = new JSONObject(new String(readAll(input), StandardCharsets.UTF_8));
            return parsed.optString("hash", "");
        } catch (Exception e) {
            return "";
        }
    }

    private void writeAck(String fileName, String hash) {
        try {
            String id = fileName.endsWith(".json") ? fileName.substring(0, fileName.length() - 5) : fileName;
            JSONObject ack = new JSONObject()
                    .put("sessionId", id)
                    .put("hash", hash == null ? "" : hash)
                    .put("httpStatus", lastHttpStatus)
                    .put("syncedAt", Instant.now().toString());
            writeAtomic(new File(exported, id + ".ack.json"), ack.toString());
        } catch (Exception e) {
            lastError = e.getClass().getSimpleName();
        }
    }

    /**
     * 进程被杀/设备重启后，把残留 current.json 补进 outbox。
     * 解析失败的文件移入 quarantine/ 保留（绝不 delete 用户原文）。
     */
    private int recoverStaleSession() {
        File currentFile = new File(root, "current.json");
        if (!currentFile.isFile()) return 0;
        String raw;
        try {
            raw = readFile(currentFile);
        } catch (Exception e) {
            lastError = e.getClass().getSimpleName();
            return 0;
        }
        try {
            JSONObject json = new JSONObject(raw);
            JSONArray segments = json.optJSONArray("segments");
            String id = json.optString("sessionId", "");
            if (segments == null || segments.length() == 0 || id.isEmpty()) {
                //noinspection ResultOfMethodCallIgnored
                currentFile.delete();
                return 0;
            }
            if (!json.has("endedAt")) {
                String last = segments.optJSONObject(segments.length() - 1).optString("receivedAt", "");
                json.put("endedAt", last.isEmpty() ? Instant.now().toString() : last);
                json.put("recoveredAt", Instant.now().toString());
            }
            writeAtomic(new File(outbox, id + ".json"), json.toString());
            //noinspection ResultOfMethodCallIgnored
            currentFile.delete();
            return 1;
        } catch (Exception e) {
            lastError = e.getClass().getSimpleName();
            File target = new File(quarantine, "current-" + Instant.now().toString().replace(":", "") + ".json");
            //noinspection ResultOfMethodCallIgnored
            currentFile.renameTo(target);
            quarantinedSessions++;
            return 0;
        }
    }

    private void notifyStatus() {
        writeState();
        Listener target = listener;
        if (target == null) return;
        String text = describe();
        main.post(() -> target.onArchiveStatus(text));
    }

    /**
     * 落一份「状态快照」到 files/archive/state.json。
     * 只有计数/状态/错误码，没有任何原文，供现场排障与 QA 回读。
     */
    private synchronized void writeState() {
        try {
            JSONObject state = new JSONObject()
                    .put("schema", 1)
                    .put("retention", retention)
                    .put("savedSegments", savedSegments)
                    .put("pending", pendingCount())
                    .put("uploading", uploading.get())
                    .put("retryAttempt", retryAttempt)
                    .put("retryMax", RETRY_DELAYS_MS.length)
                    .put("retryDelaysMs", new JSONArray(RETRY_DELAYS_MS))
                    .put("retryExhausted", retryExhausted)
                    .put("lastUploadFailed", lastUploadFailed)
                    .put("lastErrorCode", lastErrorCode)
                    .put("lastHttpStatus", lastHttpStatus)
                    .put("lastError", lastError == null ? "" : shorten(lastError))
                    .put("configMissing", configMissing)
                    .put("everSynced", everSynced)
                    .put("lastSyncedAt", lastSyncedAt)
                    .put("recoveredSessions", recoveredSessions)
                    .put("quarantinedSessions", quarantinedSessions)
                    .put("maxUploadBytes", MAX_UPLOAD_BYTES)
                    .put("tokenSource", "device-pairing")
                    .put("updatedAt", Instant.now().toString());
            writeAtomic(new File(root, "state.json"), state.toString());
        } catch (Exception e) {
            lastError = e.getClass().getSimpleName();
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
}
