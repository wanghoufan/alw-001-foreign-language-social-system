package app.socialmate.dualmic;

import android.content.Context;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import app.socialmate.dualmic.local.CloudKeys;
import app.socialmate.dualmic.local.DirectCloud;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ConnectException;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

/**
 * 远端神经 TTS 适配器（正式声音路径）。
 *
 * 链路：POST /v12/api/tts/synthesize（带配对短期令牌 + 同源 Origin + 一次性写票）
 *      → 拿到 audioId → GET /v12/api/tts/audio/<audioId>（支持 Range，此处取整段）
 *      → 校验 audioSha256 → 写入私有缓存 → 交给 MediaPlayer。
 *
 * 三条硬约束：
 * 1. 同段重复播放/循环只读缓存文件，不重复请求合成（合成要钱、要外发文本）；
 * 2. 失败一律 fail closed：返回可读错误，绝不静默切到系统 TTS；
 * 3. 请求里只有逻辑 providerId（fake/azure/...），不含任何厂商 Key；令牌不落盘、不进日志。
 */
public final class RemoteTtsAdapter implements TtsProviderAdapter {
    public static final String PROVIDER_ID = "remote";
    private static final String TAG = "SocialMateTts";
    private static final int MAX_AUDIO_BYTES = 8 * 1024 * 1024;
    private static final int CONNECT_TIMEOUT_MS = 4000;
    private static final int READ_TIMEOUT_MS = 15000;

    private final Context appContext;
    private final File cacheDir;
    private final DevicePairing pairing;
    private final Supplier<String> baseUrl;
    private final Supplier<String> serverProvider;
    private final Logger logger;
    private ExecutorService io = Executors.newSingleThreadExecutor();
    private final AtomicInteger synthRequests = new AtomicInteger();

    public RemoteTtsAdapter(Context context, DevicePairing pairing,
                            Supplier<String> baseUrl, Supplier<String> serverProvider,
                            Logger logger) {
        this.appContext = context.getApplicationContext();
        this.cacheDir = new File(appContext.getCacheDir(), "tts-remote");
        this.pairing = pairing;
        this.baseUrl = baseUrl;
        this.serverProvider = serverProvider;
        this.logger = logger;
    }

    @Override public String providerId() {
        return PROVIDER_ID;
    }

    /** 真正发出去的合成请求数（缓存命中不计）。 */
    public int synthRequestCount() {
        return synthRequests.get();
    }

    @Override public void prepare(SpeakRequest request, Callback callback) {
        prepare(request, callback, false);
    }

    /**
     * 真云 Polly 的显式同意版本：explicitConsent=true 时才会把文本发送给第三方。
     * fake / aws-polly-fake 不经过这里。
     */
    public void prepare(SpeakRequest request, Callback callback, boolean explicitConsent) {
        io().execute(() -> {
            try {
                // 客户端 providerId 是「播放来源」；发给服务端的是服务端逻辑 provider（默认 fake）。
                final String serverProviderId = serverProviderId();
                File cached = cacheFileFor(request, serverProviderId);
                if (cached.isFile() && cached.length() > 0) {
                    log("remote cache hit serverProvider=" + serverProviderId
                            + " key=" + request.cacheKey().substring(0, 12)
                            + " bytes=" + cached.length() + " synthRequests=" + synthRequests.get());
                    callback.onReady(new Prepared(cached, mimeOf(cached), true,
                            readSidecar(cached, "audioId"), readSidecar(cached, "voiceId"),
                            readSidecar(cached, "modelVersion"), "local-cache", ""));
                    return;
                }
                // 方案 2：手机已配置豆包 Key 时，原生朗读也走手机直连，不再依赖 Mac/云端网关。
                CloudKeys cloudKeys = new CloudKeys(appContext);
                if (cloudKeys.hasDoubao()) {
                    JSONObject directBody = request.toJson();
                    directBody.put("explicitConsent", true);
                    String voice = directBody.optString("voiceProfileId", "");
                    if (voice.isEmpty()) voice = directBody.optString("voiceId", "");
                    if (!voice.matches("^(zh_female_xiaohe_uranus_bigtts|zh_male_m191_uranus_bigtts|zh_female_yingyujiaoxue_uranus_bigtts)$")) {
                        voice = "zh_female_xiaohe_uranus_bigtts";
                    }
                    directBody.put("voiceProfileId", voice);
                    DirectCloud.TtsResult audio = new DirectCloud(appContext).tts(directBody);
                    File written = writeAtomically(cached, audio.bytes);
                    writeSidecar(cached, "direct-" + sha256Hex(audio.bytes).substring(0, 16),
                            voice, "seed-tts-2.0", audio.mime);
                    log("direct doubao ok bytes=" + audio.bytes.length
                            + " synthRequests=" + synthRequests.incrementAndGet());
                    callback.onReady(new Prepared(written, audio.mime, false, "", voice,
                            "seed-tts-2.0", "direct", ""));
                    return;
                }
                String base = trimBase(baseUrl.get());
                if (base.isEmpty()) {
                    callback.onFailed(new TtsError(TtsError.CODE_REMOTE_UNREACHABLE,
                            "还没有配置私有服务地址，无法请求远端朗读。", false));
                    return;
                }
                String token;
                if (pairing.cachedToken().isEmpty()) {
                    if (!pairing.isPaired()) {
                        callback.onFailed(new TtsError(TtsError.CODE_NOT_PAIRED,
                                "本机未配对，无法请求远端朗读。请先在 Mac 上生成配对码并完成配对。",
                                false));
                        return;
                    }
                    token = pairing.refreshToken(base, line -> log("pairing " + line));
                    if (token.isEmpty()) {
                        callback.onFailed(new TtsError(TtsError.CODE_REMOTE_UNREACHABLE,
                                "已配对，但连不上远端服务（无法刷新短期令牌）。"
                                        + "检查 USB 反向代理/服务是否在运行；没有自动切到系统声音。",
                                true));
                        return;
                    }
                } else {
                    token = pairing.cachedToken();
                }
                String ticket = fetchWriteTicket(base, token);
                if (ticket.isEmpty()) {
                    callback.onFailed(new TtsError(TtsError.CODE_REMOTE_REJECTED,
                            "服务端拒绝了合成请求的写授权票（写操作必须先取票）。", true));
                    return;
                }
                JSONObject body = request.toJson();
                body.put("providerId", serverProviderId);
                body.put("textSha256", request.textSha256());
                if (explicitConsent) body.put("explicitConsent", true);
                synthRequests.incrementAndGet();
                Http ret = call("POST", base + "/v12/api/tts/synthesize", token, ticket, body, false);
                if (ret.status != 200) {
                    callback.onFailed(mapHttpError(ret, "合成"));
                    return;
                }
                JSONObject synth = new JSONObject(ret.bodyText);
                JSONObject result = synth.optJSONObject("result");
                String audioId = result == null ? "" : result.optString("audioId", "");
                String status = result == null ? "" : result.optString("status", "");
                if (audioId.isEmpty() || !"ready".equals(status)) {
                    String note = synth.optString("note", "");
                    callback.onFailed(new TtsError(TtsError.CODE_REMOTE_REJECTED,
                            "该 provider 没有返回可播放音频（status=" + status + "）。"
                                    + (note.isEmpty() ? "" : note), false));
                    return;
                }
                String audioSha = result.optString("audioSha256", "");
                String mime = result.optString("mimeType", "audio/wav");
                Http audio = call("GET", base + "/v12/api/tts/audio/" + audioId, token, "", null, true);
                if (audio.status != 200 && audio.status != 206) {
                    callback.onFailed(mapHttpError(audio, "读取音频"));
                    return;
                }
                if (audio.bytes == null || audio.bytes.length == 0) {
                    callback.onFailed(new TtsError(TtsError.CODE_AUDIO_EMPTY, "服务端返回了空音频。", true));
                    return;
                }
                String computed = sha256Hex(audio.bytes);
                String headerSha = audio.headerSha;
                boolean headerOk = headerSha.isEmpty() || headerSha.equalsIgnoreCase(computed);
                boolean bodyOk = audioSha.isEmpty() || audioSha.equalsIgnoreCase(computed);
                if (!headerOk || !bodyOk) {
                    Log.e(TAG, "audio sha mismatch headerOk=" + headerOk + " bodyOk=" + bodyOk);
                    callback.onFailed(new TtsError(TtsError.CODE_AUDIO_SHA_MISMATCH,
                            "下载的音频校验失败（sha256 不匹配），已丢弃，不会播放。", true));
                    return;
                }
                File written = writeAtomically(cached, audio.bytes);
                writeSidecar(cached, audioId, result.optString("voiceId", ""),
                        result.optString("modelVersion", ""), mime);
                log("remote synth ok provider=" + serverProviderId + " audioId=" + audioId
                        + " bytes=" + audio.bytes.length
                        + " cacheHit=" + result.optBoolean("cacheHit", false)
                        + " synthRequests=" + synthRequests.get());
                callback.onReady(new Prepared(written, mime, result.optBoolean("cacheHit", false),
                        audioId, result.optString("voiceId", ""),
                        result.optString("modelVersion", ""), "remote", ""));
            } catch (SocketTimeoutException e) {
                callback.onFailed(new TtsError(TtsError.CODE_REMOTE_TIMEOUT,
                        "远端朗读超时（网络太慢或服务无响应）。", true));
            } catch (ConnectException | UnknownHostException e) {
                callback.onFailed(new TtsError(TtsError.CODE_REMOTE_UNREACHABLE,
                        "连不上远端朗读服务（地址不可达）。没有自动切到系统声音。", true));
            } catch (Exception e) {
                Log.e(TAG, "remote prepare failed " + e.getClass().getSimpleName()
                        + " message=" + e.getMessage());
                callback.onFailed(new TtsError(TtsError.CODE_INTERNAL,
                        "远端朗读失败：" + e.getClass().getSimpleName(), true));
            }
        });
    }

    /** 报价回调：只拿「会发什么、发给谁、多少钱」，不合成、不落盘、不产生费用。 */
    public interface QuoteCallback {
        void onQuote(JSONObject quote);

        void onFailed(TtsError error);
    }

    /**
     * 真实云 TTS 的显式同意前置：POST estimate=true，只返回服务商/区域/字符数/估价/摘录。
     * 该请求不会触发 Polly 合成，也不会创建缓存或账本。
     */
    public void estimate(SpeakRequest request, QuoteCallback callback) {
        io().execute(() -> {
            try {
                String base = trimBase(baseUrl.get());
                if (base.isEmpty()) {
                    callback.onFailed(new TtsError(TtsError.CODE_REMOTE_UNREACHABLE,
                            "还没有配置私有服务地址，无法估算朗读费用。", false));
                    return;
                }
                String token;
                if (pairing.cachedToken().isEmpty()) {
                    if (!pairing.isPaired()) {
                        callback.onFailed(new TtsError(TtsError.CODE_NOT_PAIRED,
                                "本机未配对，无法估算远端朗读费用。", false));
                        return;
                    }
                    token = pairing.refreshToken(base, line -> log("pairing " + line));
                    if (token.isEmpty()) {
                        callback.onFailed(new TtsError(TtsError.CODE_REMOTE_UNREACHABLE,
                                "已配对，但连不上远端服务（无法刷新短期令牌）。", true));
                        return;
                    }
                } else {
                    token = pairing.cachedToken();
                }
                JSONObject body = request.toJson();
                body.put("providerId", serverProviderId());
                body.put("textSha256", request.textSha256());
                body.put("estimate", true);
                Http ret = call("POST", base + "/v12/api/tts/synthesize", token, "", body, false);
                if (ret.status != 200) {
                    callback.onFailed(mapHttpError(ret, "估算"));
                    return;
                }
                JSONObject parsed = new JSONObject(ret.bodyText);
                JSONObject quote = parsed.optJSONObject("quote");
                if (quote == null) {
                    callback.onFailed(new TtsError(TtsError.CODE_REMOTE_REJECTED,
                            "服务端没有返回朗读报价。", false));
                    return;
                }
                callback.onQuote(quote);
            } catch (SocketTimeoutException e) {
                callback.onFailed(new TtsError(TtsError.CODE_REMOTE_TIMEOUT,
                        "远端朗读估算超时（网络太慢或服务无响应）。", true));
            } catch (ConnectException | UnknownHostException e) {
                callback.onFailed(new TtsError(TtsError.CODE_REMOTE_UNREACHABLE,
                        "连不上远端朗读服务（地址不可达）。", true));
            } catch (Exception e) {
                Log.e(TAG, "remote estimate failed " + e.getClass().getSimpleName());
                callback.onFailed(new TtsError(TtsError.CODE_INTERNAL,
                        "远端朗读估算失败：" + e.getClass().getSimpleName(), true));
            }
        });
    }

    /** 只读探测：给设置页显示「远端是否就绪」，不改任何状态。 */
    public JSONObject probe() {
        JSONObject out = new JSONObject();
        try {
            String base = trimBase(baseUrl.get());
            out.put("baseConfigured", !base.isEmpty());
            if (base.isEmpty()) {
                out.put("ok", false).put("code", TtsError.CODE_REMOTE_UNREACHABLE);
                return out;
            }
            String token = pairing.cachedToken();
            if (token.isEmpty()) {
                if (!pairing.isPaired()) {
                    out.put("ok", false).put("code", TtsError.CODE_NOT_PAIRED)
                            .put("message", "本机未配对");
                    return out;
                }
                token = pairing.refreshToken(base, line -> log("pairing " + line));
                if (token.isEmpty()) {
                    out.put("ok", false).put("code", TtsError.CODE_REMOTE_UNREACHABLE)
                            .put("message", "已配对，但连不上服务（令牌刷新失败）");
                    return out;
                }
            }
            Http ret = call("GET", base + "/v12/api/tts/providers", token, "", null, false);
            out.put("httpStatus", ret.status);
            if (ret.status != 200) {
                TtsError error = mapHttpError(ret, "读取提供商");
                out.put("ok", false).put("code", error.code).put("message", error.message);
                return out;
            }
            JSONArray providers = new JSONObject(ret.bodyText).optJSONArray("providers");
            JSONArray enabled = new JSONArray();
            if (providers != null) {
                for (int i = 0; i < providers.length(); i++) {
                    JSONObject item = providers.optJSONObject(i);
                    if (item != null && item.optBoolean("enabled")) {
                        enabled.put(item.optString("providerId"));
                    }
                }
            }
            out.put("ok", true).put("enabled", enabled);
            return out;
        } catch (Exception e) {
            try {
                out.put("ok", false).put("code", TtsError.CODE_REMOTE_UNREACHABLE)
                        .put("message", "探测失败：" + e.getClass().getSimpleName());
            } catch (Exception ignored) { }
            return out;
        }
    }

    @Override public void release() {
        io.shutdownNow();
    }

    /** 释放后再次使用（同一 controller 生命周期内）时重建线程池，避免 RejectedExecutionException。 */
    private synchronized ExecutorService io() {
        if (io.isShutdown()) io = Executors.newSingleThreadExecutor();
        return io;
    }

    /* --------------------------------------------------------------- 网络 */

    private String fetchWriteTicket(String base, String token) throws Exception {
        Http ret = call("GET", base + "/v12/api/demo/write-ticket", token, "", null, false);
        if (ret.status != 200) return "";
        return new JSONObject(ret.bodyText).optString("ticket", "");
    }

    private Http call(String method, String url, String token, String ticket,
                      JSONObject body, boolean audio) throws Exception {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setInstanceFollowRedirects(false);
            // 同源写校验用：Origin 必须与本次请求的 Host 一致。
            connection.setRequestProperty("Origin", originOf(url));
            connection.setRequestProperty("Accept", audio ? "audio/*" : "application/json");
            if (!token.isEmpty()) connection.setRequestProperty("x-archive-token", token);
            if (!ticket.isEmpty()) connection.setRequestProperty("x-sm-write", ticket);
            if (body != null) {
                byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                connection.setFixedLengthStreamingMode(payload.length);
                try (OutputStream os = connection.getOutputStream()) {
                    os.write(payload);
                }
            }
            int status = connection.getResponseCode();
            Http result = new Http();
            result.status = status;
            if (audio && status >= 200 && status < 300) {
                result.bytes = readBytes(connection.getInputStream(), MAX_AUDIO_BYTES);
                result.headerSha = header(connection, "X-Tts-Audio-Sha256");
                result.bodyText = "";
            } else {
                result.bodyText = new String(readBytes(
                        status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream(),
                        256 * 1024), StandardCharsets.UTF_8);
            }
            return result;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private TtsError mapHttpError(Http http, String action) {
        String code = "";
        String message = "";
        try {
            JSONObject parsed = new JSONObject(http.bodyText == null ? "{}" : http.bodyText);
            code = parsed.optString("code", "");
            message = parsed.optString("error", parsed.optString("message", ""));
        } catch (Exception ignored) { }
        // 旧版服务对未注册的 POST 回 405、GET 回 404（都表示这条路由还没加载）。
        if ((http.status == 404 || http.status == 405)
                && (code.isEmpty() || "NOT_FOUND".equals(code) || "METHOD_NOT_ALLOWED".equals(code))) {
            return new TtsError(TtsError.CODE_REMOTE_ROUTE_MISSING,
                    "服务端还没有加载 TTS 路由（HTTP " + http.status + "）。需要先在 Mac 上重启私有服务。",
                    false, http.status);
        }
        if (http.status == 401) {
            return new TtsError(TtsError.CODE_REMOTE_UNAUTHORIZED,
                    "远端朗读鉴权失败（令牌无效或已撤销），请重新配对。" + suffix(message), false, 401);
        }
        if (http.status == 402 || http.status == 403 || code.startsWith("CONSENT")
                || code.startsWith("TTS_BUDGET")) {
            return new TtsError(TtsError.CODE_REMOTE_REJECTED,
                    "远端拒绝了这次" + action + "：" + (message.isEmpty() ? code : message), false, http.status);
        }
        if (http.status == 429) {
            return new TtsError(TtsError.CODE_REMOTE_REJECTED,
                    "远端限流，请稍后重试。" + suffix(message), true, 429);
        }
        return new TtsError(TtsError.CODE_REMOTE_REJECTED,
                "远端" + action + "失败（HTTP " + http.status + "）。" + suffix(message), true, http.status);
    }

    private static String suffix(String message) {
        return message == null || message.isEmpty() ? "" : " " + message;
    }

    /* ------------------------------------------------------------- 缓存 */

    private File cacheFileFor(SpeakRequest request, String serverProviderId) {
        if (!cacheDir.isDirectory()) cacheDir.mkdirs();
        String key = sha256Hex((serverProviderId + "|" + request.cacheKey())
                .getBytes(StandardCharsets.UTF_8));
        return new File(cacheDir, key + ".wav");
    }

    /** 服务端逻辑 provider（默认 fake；换成 azure/elevenlabs 只改设置，不改播放器）。 */
    public String serverProviderId() {
        String value = serverProvider == null ? "" : serverProvider.get();
        if (value == null || value.trim().isEmpty()) return "fake";
        return value.trim();
    }

    private File writeAtomically(File target, byte[] bytes) throws IOException {
        if (!cacheDir.isDirectory() && !cacheDir.mkdirs()) {
            throw new IOException("无法创建音频缓存目录");
        }
        File temp = new File(cacheDir, target.getName() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(temp)) {
            out.write(bytes);
        }
        if (!temp.renameTo(target)) throw new IOException("音频缓存落盘失败");
        return target;
    }

    private void writeSidecar(File audio, String audioId, String voiceId, String modelVersion, String mime) {
        try {
            JSONObject meta = new JSONObject();
            meta.put("audioId", audioId);
            meta.put("voiceId", voiceId);
            meta.put("modelVersion", modelVersion);
            meta.put("mimeType", mime);
            try (FileOutputStream out = new FileOutputStream(sidecarOf(audio))) {
                out.write(meta.toString().getBytes(StandardCharsets.UTF_8));
            }
        } catch (Exception ignored) { }
    }

    private String readSidecar(File audio, String key) {
        try {
            File meta = sidecarOf(audio);
            if (!meta.isFile()) return "";
            JSONObject parsed = new JSONObject(new String(java.nio.file.Files.readAllBytes(meta.toPath()),
                    StandardCharsets.UTF_8));
            return parsed.optString(key, "");
        } catch (Exception e) {
            return "";
        }
    }

    private static File sidecarOf(File audio) {
        return new File(audio.getParentFile(), audio.getName() + ".json");
    }

    private static String mimeOf(File audio) {
        String name = audio.getName().toLowerCase(Locale.US);
        if (name.endsWith(".mp3")) return "audio/mpeg";
        return "audio/wav";
    }

    /* ------------------------------------------------------------- 工具 */

    private static String header(HttpURLConnection connection, String name) {
        try {
            String value = connection.getHeaderField(name);
            return value == null ? "" : value.trim();
        } catch (Exception e) {
            return "";
        }
    }

    private static byte[] readBytes(InputStream input, int limit) throws IOException {
        if (input == null) return new byte[0];
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[16384];
        int read;
        int total = 0;
        try (InputStream in = input) {
            while ((read = in.read(chunk)) > 0) {
                total += read;
                if (total > limit) throw new IOException("响应体超过上限");
                buffer.write(chunk, 0, read);
            }
        }
        return buffer.toByteArray();
    }

    static String sha256Hex(byte[] bytes) {
        try {
            java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
            byte[] raw = digest.digest(bytes);
            StringBuilder sb = new StringBuilder(raw.length * 2);
            for (byte b : raw) sb.append(String.format(Locale.US, "%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    private static String originOf(String url) {
        try {
            URL parsed = new URL(url);
            int port = parsed.getPort();
            String defaultPort = "https".equals(parsed.getProtocol()) ? ":443" : ":80";
            return parsed.getProtocol() + "://" + parsed.getHost()
                    + (port > 0 ? ":" + port : defaultPort);
        } catch (Exception e) {
            return "";
        }
    }

    private static String trimBase(String value) {
        String base = value == null ? "" : value.trim();
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        if (base.endsWith("/v12")) base = base.substring(0, base.length() - 4);
        return base;
    }

    private void log(String line) {
        Log.i(TAG, line);
        if (logger != null) logger.log(line);
    }

    private static final class Http {
        int status;
        String bodyText = "";
        byte[] bytes;
        String headerSha = "";
    }
}
