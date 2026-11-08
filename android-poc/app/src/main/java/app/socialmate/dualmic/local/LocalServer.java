package app.socialmate.dualmic.local;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayDeque;
import java.util.Locale;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 手机内置本地 origin：127.0.0.1:<随机端口>。
 *
 * 只做三件事：
 * 1. 从 APK assets 提供 /v12 页面与同源脚本，首屏不再依赖 Mac；
 * 2. 从 LocalStore(SQLite) 提供页面需要的全部本地数据 CRUD；
 * 3. 把明确属于云端的能力（DeepSeek / 豆包 TTS / ASR）转发到已配置的云端薄网关；
 *    未配置时返回 503，页面按功能级失败提示，不阻塞主页面。
 *
 * 安全边界：
 * - 只绑定 127.0.0.1，随机端口；
 * - 校验 Host，拒绝 DNS rebinding；
 * - 数据接口要求 x-archive-token（启动时随机生成并注入页面 sessionStorage）；
 * - 写接口沿用页面的 x-sm-write 票，但不把票当身份；
 * - 不读取、不打印任何厂商密钥。
 */
public final class LocalServer {
    private static final String TAG = "SocialMateLocal";
    private static final String ASSET_PAGE = "v12/index.html";
    private static final String ASSET_PROFILE_SYNC = "v12/profile-sync.js";

    private final Context appContext;
    private final LocalStore store;
    private final String token;
    /** 方案 2：手机直连厂商（Key 在 Keystore，不经过云函数/Mac）。 */
    private final DirectCloud direct;
    private final ExecutorService pool = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "sm-local-http");
        t.setDaemon(true);
        return t;
    });
    /** 最近 ASR 事件环形缓冲容量：SSE 每 300s 主动结束，重连窗口内的事件靠它补发。 */
    private static final int ASR_REPLAY_BUFFER = 256;
    /** SSE 单连接最长存活时间，保留原有「5 分钟主动结束 + 页面退避重连」行为。 */
    private static final long SSE_MAX_MILLIS = 150L * 2000L;
    /** SSE 心跳间隔，与原先 2000ms 一致。 */
    private static final long SSE_HEARTBEAT_MILLIS = 2000L;
    private static final byte[] SSE_HEARTBEAT = ": heartbeat\n\n".getBytes(StandardCharsets.UTF_8);

    private final CopyOnWriteArrayList<SseClient> sseClients = new CopyOnWriteArrayList<>();
    private final AtomicBoolean running = new AtomicBoolean(false);
    /** 保护 asrSeq + asrBuffer 与「注册订阅者 + 补发快照」的原子性，保证帧顺序。 */
    private final Object asrLock = new Object();
    /** 最近事件环形缓冲（seq 单调递增）；断线重连补发用，partial 仍在内存，不落盘。 */
    private final ArrayDeque<AsrRecord> asrBuffer = new ArrayDeque<>();
    private long asrSeq = 0L;
    private ServerSocket server;
    private int port;
    private volatile byte[] pageCache;
    private volatile byte[] profileSyncCache;

    public LocalServer(Context context) {
        this.appContext = context.getApplicationContext();
        this.store = LocalStore.get(context);
        this.token = randomToken();
        this.direct = new DirectCloud(this.appContext);
    }

    public String token() { return token; }

    public synchronized int start() throws IOException {
        if (running.get()) return port;
        ServerSocket socket = new ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"));
        this.server = socket;
        this.port = socket.getLocalPort();
        running.set(true);
        Thread accept = new Thread(() -> {
            while (running.get()) {
                try {
                    Socket client = server.accept();
                    pool.execute(() -> handle(client));
                } catch (IOException e) {
                    if (running.get()) Log.w(TAG, "accept failed: " + e.getMessage());
                }
            }
        }, "sm-local-accept");
        accept.setDaemon(true);
        accept.start();
        Log.i(TAG, "local origin listening on 127.0.0.1:" + port);
        return port;
    }

    public synchronized void stop() {
        running.set(false);
        // 清空补发缓冲与全部订阅者；seq 保持单调不重置，避免新连接拿旧 Last-Event-ID 时永远等不到更大的 seq。
        synchronized (asrLock) {
            for (SseClient c : sseClients) c.close();
            sseClients.clear();
            asrBuffer.clear();
        }
        try { if (server != null) server.close(); } catch (IOException ignored) {}
        server = null;
    }

    public String baseUrl() { return "http://127.0.0.1:" + port; }

    public String pageUrl() { return baseUrl() + "/v12"; }

    /**
     * 把原生 ASR 事件推给页面 SSE 订阅者。
     *
     * <p>先写入最近事件环形缓冲（带单调递增 seq），再广播给当前在线客户端；
     * 没有客户端时事件仍留在缓冲里，供断线重连补发。
     * partial 只存在于内存，不落盘。</p>
     */
    public void publishAsr(JSONObject event) {
        if (event == null) return;
        synchronized (asrLock) {
            asrSeq += 1L;
            byte[] frame = asrFrame(asrSeq, event);
            asrBuffer.addLast(new AsrRecord(asrSeq, frame));
            while (asrBuffer.size() > ASR_REPLAY_BUFFER) asrBuffer.removeFirst();
            // 有订阅者才推送；推送只是入队，写失败由各自写线程移除客户端。
            for (SseClient client : sseClients) client.enqueue(frame);
        }
    }

    /** SSE 帧格式：id 单调递增，页面重连时可带 Last-Event-ID 指定补发起点。 */
    private static byte[] asrFrame(long seq, JSONObject event) {
        return ("id: " + seq + "\nevent: asr\ndata: " + event + "\n\n")
                .getBytes(StandardCharsets.UTF_8);
    }

    private static long parseEventId(String value) {
        if (value == null) return 0L;
        try {
            long parsed = Long.parseLong(value.trim());
            return parsed < 0L ? 0L : parsed;
        } catch (NumberFormatException e) {
            return 0L;
        }
    }

    /* ============================== HTTP 基础 ============================== */

    private void handle(Socket client) {
        try (Socket socket = client) {
            socket.setSoTimeout(5000);
            BufferedInputStream in = new BufferedInputStream(socket.getInputStream());
            ByteArrayOutputStream headBuf = new ByteArrayOutputStream();
            int prev3 = -1, prev2 = -1, prev1 = -1, cur;
            while ((cur = in.read()) != -1) {
                headBuf.write(cur);
                if (prev3 == '\r' && prev2 == '\n' && prev1 == '\r' && cur == '\n') break;
                prev3 = prev2; prev2 = prev1; prev1 = cur;
                if (headBuf.size() > 65536) throw new IOException("header too large");
            }
            if (headBuf.size() == 0) return;
            String head = headBuf.toString(StandardCharsets.ISO_8859_1.name());
            String[] lines = head.split("\r\n");
            if (lines.length == 0) return;
            String[] first = lines[0].split(" ");
            if (first.length < 2) return;
            String method = first[0].toUpperCase(Locale.ROOT);
            String target = first[1];
            Headers headers = new Headers(lines, 1);
            int contentLength = parseLength(headers.get("content-length"));
            byte[] body = readBody(in, contentLength);
            OutputStream out = socket.getOutputStream();

            String host = headers.get("host");
            if (host == null || !host.equals("127.0.0.1:" + port)) {
                writeJson(out, 403, error("HOST_REJECTED", "只接受本机页面请求"));
                return;
            }
            String origin = headers.get("origin");
            if (origin != null && !origin.equals("http://127.0.0.1:" + port)) {
                writeJson(out, 403, error("ORIGIN_REJECTED", "来源不被允许"));
                return;
            }
            Uri uri = Uri.parse("http://127.0.0.1:" + port + target);
            try {
                route(out, method, uri, headers, body);
            } catch (LocalHttpException e) {
                // 可预期错误必须回给页面；静默关连接会让前端只看到 Failed to fetch。
                try {
                    writeJson(out, e.status, error(e.code, e.getMessage()));
                } catch (IOException ignored) {}
            }
        } catch (Throwable e) {
            Log.e(TAG, "request failed: " + e, e);
        }
    }

    private void route(OutputStream out, String method, Uri uri, Headers headers, byte[] body) throws Exception {
        String path = uri.getPath() == null ? "/" : uri.getPath();
        String tokenHeader = headers.get("x-archive-token");

        if ("GET".equals(method) && (path.equals("/v12") || path.equals("/v12/") || path.equals("/v12/index.html"))) {
            writeBytes(out, 200, "text/html; charset=utf-8", pageBytes(), false);
            return;
        }
        if ("GET".equals(method) && path.equals("/profile-sync.js")) {
            writeBytes(out, 200, "application/javascript; charset=utf-8", profileSyncBytes(), true);
            return;
        }
        if ("GET".equals(method) && path.equals("/health")) {
            writeJson(out, 200, new JSONObject().put("ok", true).put("service", "socialmate-local")
                    .put("schema", 1).put("port", port));
            return;
        }
        if ("GET".equals(method) && path.equals("/api/asr/live")) {
            // Last-Event-ID：浏览器原生 EventSource 自动重连会带；页面手动重连不带则补发全部缓冲。
            streamSse(out, headers.get("last-event-id"));
            return;
        }

        boolean needsToken = (path.startsWith("/v12/api/") || path.startsWith("/api/ai/")
                || path.startsWith("/v12/media/"))
                // 写票生成只返回一次性随机串，页面 smTicket 不带 token；写请求本身仍校验 token。
                && !path.equals("/v12/api/demo/write-ticket");
        if (needsToken && (tokenHeader == null || !constantTimeEquals(tokenHeader, token))) {
            writeJson(out, 401, error("TOKEN_INVALID", "本地令牌无效，请重新打开应用"));
            return;
        }

        /* ---------- 档案 / 偏好 ---------- */
        if (path.equals("/api/profile")) {
            if ("GET".equals(method)) { writeJson(out, 200, store.getProfile()); return; }
            if ("PUT".equals(method)) { writeJson(out, 200, store.putProfile(parseJson(body))); return; }
        }
        if (path.equals("/v12/api/prefs")) {
            if ("GET".equals(method)) { writeJson(out, 200, store.getPrefs()); return; }
            if ("POST".equals(method)) { writeJson(out, 200, store.putPrefs(parseJson(body))); return; }
        }

        /* ---------- 云端能力：优先手机直连，其次云端网关，最后 503 ---------- */
        if (path.startsWith("/api/ai/")) {
            if (direct.canAi()) {
                JSONObject req = parseJson(body);
                JSONObject result;
                if (path.equals("/api/ai/translate")) result = direct.translate(req);
                else if (path.equals("/api/ai/draft-en")) result = direct.draftEn(req);
                else if (path.equals("/api/ai/analyze")) result = direct.analyze(req);
                else throw new LocalHttpException(404, "AI_PATH_UNKNOWN", "未知 AI 路径");
                writeJson(out, 200, result);
                return;
            }
            writeBytes(out, 200, "application/json; charset=utf-8",
                    cloudJson("POST", path.replace("/api/ai/", "/v1/ai/"), body).getBytes(StandardCharsets.UTF_8), false);
            return;
        }
        if (path.equals("/v12/api/tts/synthesize") && "POST".equals(method)) {
            JSONObject req = parseJson(body);
            if (direct.canTts()) {
                DirectCloud.TtsResult audio = direct.tts(req);
                writeJson(out, 200, cacheTts(audio.bytes, audio.mime));
            } else {
                writeJson(out, 200, synthesizeTts(req));
            }
            return;
        }
        if (path.startsWith("/v12/api/tts/audio/") && "GET".equals(method)) {
            writeTtsAudio(out, path.substring("/v12/api/tts/audio/".length()));
            return;
        }
        if (path.equals("/v12/api/tts/providers")) {
            writeJson(out, 200, new JSONObject().put("ok", true).put("providers", new JSONArray()
                    .put(new JSONObject().put("id", "doubao").put("ready", direct.canTts() || cloudConfigured())
                            .put("direct", direct.canTts())
                            .put("label", direct.canTts() ? "豆包语音 2.0（手机直连）" : "豆包语音 2.0（云端）"))));
            return;
        }
        if (path.equals("/v12/api/tts/voices")) {
            writeJson(out, 200, new JSONObject().put("ok", true).put("voices", new JSONArray()
                    .put(new JSONObject().put("id", "zh_female_yingyujiaoxue_uranus_bigtts").put("label", "Tina老师 2.0 · 中英混"))
                    .put(new JSONObject().put("id", "zh_female_xiaohe_uranus_bigtts").put("label", "小何 2.0 · 女声"))
                    .put(new JSONObject().put("id", "zh_male_m191_uranus_bigtts").put("label", "云舟 2.0 · 男声"))));
            return;
        }
        if (path.equals("/v12/api/asr/status") || path.equals("/api/asr/status")) {
            writeJson(out, 200, new JSONObject().put("ok", true).put("combined", true)
                    .put("local", true).put("cloud", cloudConfigured())
                    .put("directTencent", direct.keys().hasTencentAsr()));
            return;
        }
        if (path.equals("/api/ai/health")) {
            writeJson(out, 200, new JSONObject().put("ok", true).put("local", true)
                    .put("directAi", direct.canAi()).put("directTts", direct.canTts())
                    .put("cloud", cloudConfigured()));
            return;
        }
        if (path.equals("/v12/api/cloud/status") && "GET".equals(method)) {
            writeJson(out, 200, new JSONObject().put("ok", true).put("keys", direct.keys().status()));
            return;
        }

        /* ---------- 写票：本地只做协议兼容 ---------- */
        if (path.equals("/v12/api/demo/write-ticket")) {
            writeJson(out, 200, new JSONObject().put("ok", true).put("ticket", "local-" + randomToken()));
            return;
        }

        /* ---------- 人物 ---------- */
        if (path.equals("/v12/api/people")) {
            if ("GET".equals(method)) { writeJson(out, 200, store.peopleList()); return; }
            if ("POST".equals(method)) {
                JSONObject b = parseJson(body);
                String slug = b.optString("slug", "");
                String name = b.optString("name", slug);
                writeJson(out, 200, store.createPerson(slug, name, b.optString("note", "")));
                return;
            }
        }
        if (path.equals("/v12/api/people/slug-suggest") && "GET".equals(method)) {
            String name = uri.getQueryParameter("name");
            writeJson(out, 200, store.slugSuggest(name == null ? "" : name));
            return;
        }
        if (path.matches("^/v12/api/people/[^/]+/prep$") && "GET".equals(method)) {
            writeJson(out, 200, store.personPrep(decode(segment(path, 4))));
            return;
        }
        if (path.matches("^/v12/api/people/[^/]+/facts/revoke$") && "POST".equals(method)) {
            JSONObject b = parseJson(body);
            writeJson(out, 200, store.revokeFact(decode(segment(path, 4)), b.optString("factId", "")));
            return;
        }
        if (path.matches("^/v12/api/people/[^/]+/facts/draft$") && "POST".equals(method)) {
            JSONObject b = parseJson(body);
            writeJson(out, 200, store.saveManualDraft(decode(segment(path, 4)),
                    b.optString("rawInput", ""), b.optString("batchId", "")));
            return;
        }
        if (path.matches("^/v12/api/people/[^/]+/facts/confirm$") && "POST".equals(method)) {
            JSONObject b = parseJson(body);
            JSONArray items = b.optJSONArray("items");
            if (items == null) items = new JSONArray();
            writeJson(out, 200, store.confirmFacts(decode(segment(path, 4)),
                    b.optString("draftId", ""), items));
            return;
        }
        if (path.matches("^/v12/api/people/[^/]+/facts/drafts$") && "GET".equals(method)) {
            writeJson(out, 200, new JSONObject().put("ok", true).put("drafts", new JSONArray()));
            return;
        }
        if (path.matches("^/v12/api/people/[^/]+$") && "GET".equals(method)) {
            writeJson(out, 200, store.personDetail(decode(segment(path, 4))));
            return;
        }

        /* ---------- 收藏 ---------- */
        if (path.equals("/v12/api/favorites")) {
            if ("GET".equals(method)) { writeJson(out, 200, store.listFavorites()); return; }
            if ("POST".equals(method)) { writeJson(out, 200, store.addFavorite(parseJson(body))); return; }
        }
        if (path.matches("^/v12/api/favorites/[^/]+$") && "DELETE".equals(method)) {
            writeJson(out, 200, store.removeFavorite(decode(segment(path, 4))));
            return;
        }

        /* ---------- 活资料库卡片 ---------- */
        if (path.equals("/v12/api/cards")) {
            if ("GET".equals(method)) {
                String kind = uri.getQueryParameter("kind");
                boolean includeDeleted = "1".equals(uri.getQueryParameter("includeDeleted"));
                writeJson(out, 200, store.listCards(kind == null ? "" : kind, includeDeleted));
                return;
            }
            if ("POST".equals(method)) { writeJson(out, 200, store.createCard(parseJson(body))); return; }
        }
        if (path.equals("/v12/api/cards/stats") && "GET".equals(method)) {
            JSONObject stats = new JSONObject();
            for (String kind : new String[]{"place", "story", "app"}) {
                stats.put(kind, store.listCards(kind, false).optInt("count"));
            }
            writeJson(out, 200, new JSONObject().put("ok", true).put("counts", stats));
            return;
        }
        if (path.matches("^/v12/api/cards/(place|story|app)/[^/]+$")) {
            String kind = segment(path, 4);
            String id = decode(segment(path, 5));
            if ("GET".equals(method)) { writeJson(out, 200, store.getCard(kind, id)); return; }
            if ("PATCH".equals(method)) { writeJson(out, 200, store.updateCard(kind, id, parseJson(body))); return; }
            if ("DELETE".equals(method)) {
                if (!"1".equals(uri.getQueryParameter("confirm"))) {
                    throw new LocalHttpException(400, "CONFIRM_REQUIRED", "删除卡片需要 confirm=1");
                }
                writeJson(out, 200, store.softDeleteCard(kind, id));
                return;
            }
        }
        if (path.matches("^/v12/api/cards/(place|story|app)/[^/]+/restore$") && "POST".equals(method)) {
            writeJson(out, 200, store.restoreCard(segment(path, 4), decode(segment(path, 5))));
            return;
        }
        if (path.matches("^/v12/api/cards/(place|story|app)/[^/]+/media$") && "POST".equals(method)) {
            JSONObject b = parseJson(body);
            writeJson(out, 200, store.addCardMedia(segment(path, 4), decode(segment(path, 5)),
                    b.optString("data", ""), b.optString("mime", "")));
            return;
        }
        if (path.matches("^/v12/api/cards/(place|story|app)/[^/]+/media/[^/]+$") && "DELETE".equals(method)) {
            writeJson(out, 200, store.deleteCardMedia(segment(path, 4), decode(segment(path, 5)),
                    decode(segment(path, 7))));
            return;
        }
        if (path.matches("^/v12/api/cards/(place|story|app)/[^/]+/cover$") && "POST".equals(method)) {
            JSONObject b = parseJson(body);
            writeJson(out, 200, store.setCardCover(segment(path, 4), decode(segment(path, 5)),
                    b.optString("mediaId", "")));
            return;
        }
        if (path.matches("^/v12/api/cards/(place|story|app)/[^/]+/override$")) {
            String kind = segment(path, 4);
            String id = decode(segment(path, 5));
            if ("GET".equals(method)) { writeJson(out, 200, store.getOverride(kind, id)); return; }
            if ("PUT".equals(method)) { writeJson(out, 200, store.putOverride(kind, id, parseJson(body))); return; }
        }
        if (path.startsWith("/v12/media/")) {
            String cardId = decode(segment(path, 3));
            String file = decode(segment(path, 4));
            writeFile(out, store.cardMediaFile(cardId, file), store.cardMediaMime(cardId, file));
            return;
        }

        /* ---------- 私有地点 ---------- */
        if (path.equals("/v12/api/private-places")) {
            if ("GET".equals(method)) { writeJson(out, 200, store.listPrivatePlaces()); return; }
            if ("POST".equals(method)) { writeJson(out, 200, store.createPrivatePlace(parseJson(body))); return; }
        }

        /* ---------- 地点档案 / 记录 ---------- */
        if (path.equals("/v12/api/places/unassigned") && "GET".equals(method)) {
            writeJson(out, 200, store.unassignedRecords());
            return;
        }
        if (path.equals("/v12/api/places/match") && "POST".equals(method)) {
            writeJson(out, 200, store.matchPlace(parseJson(body).optString("text", "")));
            return;
        }
        if (path.matches("^/v12/api/places/[^/]+/records/[^/]+/blocks/[^/]+/practice$") && "POST".equals(method)) {
            writeJson(out, 200, store.savePractice(decode(segment(path, 4)), decode(segment(path, 6)),
                    decode(segment(path, 8)), parseJson(body)));
            return;
        }
        if (path.matches("^/v12/api/places/[^/]+/practice/weak$") && "GET".equals(method)) {
            writeJson(out, 200, store.practiceWeak(decode(segment(path, 4))));
            return;
        }
        if (path.matches("^/v12/api/places/[^/]+/records$") && "POST".equals(method)) {
            writeJson(out, 200, store.saveRecord(decode(segment(path, 4)), parseJson(body)));
            return;
        }
        if (path.matches("^/v12/api/places/[^/]+$") && "GET".equals(method)) {
            writeJson(out, 200, store.placeDetail(decode(segment(path, 4))));
            return;
        }

        /* ---------- 实时候选：本地会话未确认时不展示 ---------- */
        if (path.startsWith("/v12/api/live/")) {
            if (path.equals("/v12/api/live/status")) {
                writeJson(out, 200, new JSONObject().put("ok", true).put("pending", 0).put("local", true));
                return;
            }
            if (path.equals("/v12/api/live/pending")) {
                writeJson(out, 200, new JSONObject().put("ok", true).put("items", new JSONArray()).put("targets", new JSONArray()));
                return;
            }
            if (path.equals("/v12/api/live/facts")) {
                writeJson(out, 200, new JSONObject().put("ok", true).put("items", new JSONArray()));
                return;
            }
            writeJson(out, 200, new JSONObject().put("ok", true));
            return;
        }

        /* ---------- 演示命名空间：本机离线版不写入真实库 ---------- */
        if (path.startsWith("/v12/api/demo/")) {
            if (path.equals("/v12/api/demo/people")) {
                writeJson(out, 200, new JSONObject().put("ok", true).put("people", new JSONArray())
                        .put("inbox", new JSONArray()).put("source", "local-empty"));
                return;
            }
            writeJson(out, 200, new JSONObject().put("ok", true).put("items", new JSONArray())
                    .put("records", new JSONArray()).put("source", "local-empty"));
            return;
        }

        if (path.equals("/v12/api/learning-archive/status")) {
            writeJson(out, 200, new JSONObject().put("ok", true).put("materials", 0).put("local", true));
            return;
        }
        if (path.equals("/v12/api/learning-archive/materials")) {
            writeJson(out, 200, new JSONObject().put("ok", true).put("materials", new JSONArray()));
            return;
        }

        /* ---------- 备份 / 同步 ---------- */
        if (path.equals("/v12/api/local/backup") && "GET".equals(method)) {
            writeJson(out, 200, store.exportBackup());
            return;
        }
        if (path.equals("/v12/api/local/backup") && "POST".equals(method)) {
            JSONObject b = parseJson(body);
            writeJson(out, 200, store.importBackup(b.optJSONObject("backup") == null ? b : b.optJSONObject("backup"),
                    b.optBoolean("overwrite", false)));
            return;
        }
        if (path.equals("/v12/api/local/sync-state") && "GET".equals(method)) {
            writeJson(out, 200, store.syncState());
            return;
        }
        // LAN/桌面投递入口：把 .smbak.zip 放到 files/import/backup.zip 后调用；
        // 与 SAF 导入共用 LocalBackup.importFrom，用于同步、自动化恢复和真机验证。
        if (path.equals("/v12/api/local/import-file") && "POST".equals(method)) {
            File dir = new File(appContext.getFilesDir(), "import");
            File zip = new File(dir, "backup.zip");
            if (!zip.exists() || !zip.isFile()) {
                throw new LocalHttpException(404, "IMPORT_NOT_FOUND", "本机没有待导入的备份包");
            }
            JSONObject result;
            String password = "{}".equals(new String(body, StandardCharsets.UTF_8))
                    ? "" : parseJson(body).optString("password", "");
            try (InputStream in = new FileInputStream(zip)) {
                result = LocalBackup.importFrom(store, in, appContext.getCacheDir(), password);
            }
            File done = new File(dir, "backup.imported-" + System.currentTimeMillis() + ".zip");
            //noinspection ResultOfMethodCallIgnored
            zip.renameTo(done);
            writeJson(out, 200, result);
            return;
        }

        /* ---------- 历史原文页 ---------- */
        if (path.equals("/v12/history") && "GET".equals(method)) {
            writeBytes(out, 200, "text/html; charset=utf-8",
                    historyPage(uri.getQueryParameter("session")).getBytes(StandardCharsets.UTF_8), true);
            return;
        }

        /* ---------- 公开地点图片：从 APK assets 离线提供 ---------- */
        if (path.startsWith("/v12/img/")) {
            String rel = path.substring("/v12/img/".length());
            if (rel.isEmpty() || rel.contains("..") || !rel.matches("^[A-Za-z0-9._/-]{1,200}$")) {
                writeJson(out, 404, error("IMAGE_INVALID", "图片路径不合法"));
                return;
            }
            try (InputStream in = appContext.getAssets().open("img/" + rel)) {
                String mime = rel.toLowerCase(Locale.ROOT).endsWith(".png") ? "image/png" : "image/webp";
                writeBytes(out, 200, mime, readAll(in), true);
            } catch (IOException e) {
                writeJson(out, 404, error("IMAGE_NOT_FOUND", "本机没有这张图片"));
            }
            return;
        }

        writeJson(out, 404, error("NOT_FOUND", "本地服务没有这个路径"));
    }

    /* ============================== 云端代理 ============================== */

    private boolean cloudConfigured() {
        SharedPreferences prefs = appContext.getSharedPreferences("socialmate-config", Context.MODE_PRIVATE);
        String base = prefs.getString("cloud_gateway_url", "");
        return base != null && !base.trim().isEmpty();
    }

    private String cloudJson(String method, String path, byte[] body) throws Exception {
        SharedPreferences prefs = appContext.getSharedPreferences("socialmate-config", Context.MODE_PRIVATE);
        String base = prefs.getString("cloud_gateway_url", "");
        String token = prefs.getString("cloud_gateway_token", "");
        if (base == null || base.trim().isEmpty()) {
            throw new LocalHttpException(503, "CLOUD_NOT_CONFIGURED", "未配置云端网关；离线仍可使用本地资料");
        }
        String url = base.replaceAll("/+$", "") + path;
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setRequestMethod(method);
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(20000);
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("Accept", "application/json");
        if (token != null && !token.isEmpty()) conn.setRequestProperty("Authorization", "Bearer " + token);
        if (body != null && body.length > 0) {
            conn.setDoOutput(true);
            try (OutputStream out = conn.getOutputStream()) { out.write(body); }
        }
        int status = conn.getResponseCode();
        InputStream in = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
        byte[] payload = in == null ? new byte[0] : readAll(in);
        String text = new String(payload, StandardCharsets.UTF_8);
        if (status >= 400) {
            throw new LocalHttpException(status, "CLOUD_" + status, text.isEmpty() ? "云端请求失败" : text);
        }
        return text.isEmpty() ? "{\"ok\":true}" : text;
    }

    private JSONObject synthesizeTts(JSONObject request) throws Exception {
        String text = request.optString("text", "");
        if (text.length() > 2000) throw new LocalHttpException(400, "TTS_TEXT_TOO_LONG", "单段朗读最多 2000 字符");
        if (!request.optBoolean("explicitConsent", false)) {
            throw new LocalHttpException(403, "CONSENT_REQUIRED", "云端朗读需要显式同意");
        }
        String cloud = cloudJson("POST", "/v1/tts/synthesize", request.toString().getBytes(StandardCharsets.UTF_8));
        JSONObject parsed = new JSONObject(cloud);
        String audioBase64 = parsed.optString("audioBase64", "");
        String mime = parsed.optString("mimeType", "audio/mpeg");
        if (audioBase64.isEmpty()) {
            JSONObject result = parsed.optJSONObject("result");
            if (result != null) audioBase64 = result.optString("audioBase64", "");
        }
        if (audioBase64.isEmpty()) throw new LocalHttpException(502, "TTS_NO_AUDIO", "云端没有返回音频");
        byte[] bytes = android.util.Base64.decode(audioBase64, android.util.Base64.DEFAULT);
        return cacheTts(bytes, mime);
    }

    /** 把合成音频落到本机缓存，返回页面契约的 audioId。 */
    private JSONObject cacheTts(byte[] bytes, String mime) throws Exception {
        String audioId = "tts-" + LocalSegments.sha256(new String(bytes, StandardCharsets.ISO_8859_1)).substring(0, 32);
        File dir = new File(appContext.getCacheDir(), "local-tts");
        if (!dir.exists()) //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        File audio = new File(dir, audioId + ".bin");
        try (FileOutputStream out = new FileOutputStream(audio)) {
            out.write(bytes);
            out.flush();
            out.getFD().sync();
        }
        JSONObject meta = new JSONObject().put("audioId", audioId).put("mimeType", mime)
                .put("bytes", bytes.length);
        try (FileOutputStream out = new FileOutputStream(new File(dir, audioId + ".json"))) {
            out.write(meta.toString().getBytes(StandardCharsets.UTF_8));
        }
        return new JSONObject().put("ok", true).put("result",
                new JSONObject().put("audioId", audioId).put("mimeType", mime)
                        .put("cacheHit", false).put("status", "ready"));
    }

    private void writeTtsAudio(OutputStream out, String audioId) throws Exception {
        if (audioId == null || !audioId.matches("^tts-[a-f0-9]{32}$")) {
            writeJson(out, 400, error("AUDIO_ID_INVALID", "音频标识不合法"));
            return;
        }
        File dir = new File(appContext.getCacheDir(), "local-tts");
        File audio = new File(dir, audioId + ".bin");
        if (!audio.exists()) {
            writeJson(out, 404, error("AUDIO_NOT_FOUND", "音频不存在或已过期"));
            return;
        }
        String mime = "audio/mpeg";
        File meta = new File(dir, audioId + ".json");
        if (meta.exists()) {
            try (InputStream in = new FileInputStream(meta)) {
                mime = new JSONObject(new String(readAll(in), StandardCharsets.UTF_8)).optString("mimeType", mime);
            } catch (Exception ignored) {}
        }
        writeBytes(out, 200, mime, readAll(new FileInputStream(audio)), false);
    }

    /* ============================== 静态资源 ============================== */

    private byte[] pageBytes() {
        if (pageCache == null) pageCache = readAsset(ASSET_PAGE);
        return pageCache;
    }

    private byte[] profileSyncBytes() {
        if (profileSyncCache == null) profileSyncCache = readAsset(ASSET_PROFILE_SYNC);
        return profileSyncCache;
    }

    private byte[] readAsset(String path) {
        try (InputStream in = appContext.getAssets().open(path)) {
            return readAll(in);
        } catch (IOException e) {
            Log.e(TAG, "asset missing: " + path);
            return ("<h1>SocialMate</h1><p>页面资源缺失：" + path + "</p>").getBytes(StandardCharsets.UTF_8);
        }
    }

    private String historyPage(String sessionId) {
        StringBuilder html = new StringBuilder();
        html.append("<!doctype html><html lang=\"zh\"><head><meta charset=\"utf-8\">")
                .append("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">")
                .append("<title>会话原文</title><style>body{font:19px/1.7 -apple-system,PingFang SC,sans-serif;padding:16px;background:#f5f7f8;color:#12232e}")
                .append("h1{font-size:23px}p{margin:8px 0}pre{white-space:pre-wrap;word-break:break-word;background:#fff;padding:12px;border-radius:12px}")
                .append(".meta{color:#5b6b76;font-size:15px}</style></head><body>");
        html.append("<h1>会话原文</h1>");
        if (sessionId == null || sessionId.isEmpty()) {
            html.append("<p>缺少会话标识。</p>");
        } else {
            JSONObject session = findLocalSession(sessionId);
            if (session == null) {
                html.append("<p>本机暂无这条会话原文。</p>");
            } else {
                html.append("<p class=\"meta\">会话 ").append(escape(sessionId))
                        .append(" · 开始 ").append(escape(session.optString("startedAt", "")))
                        .append(" · 结束 ").append(escape(session.optString("endedAt", ""))).append("</p>");
                JSONArray segments = session.optJSONArray("segments");
                if (segments == null || segments.length() == 0) {
                    html.append("<p>没有逐字段落。</p>");
                } else {
                    for (int i = 0; i < segments.length(); i++) {
                        JSONObject seg = segments.optJSONObject(i);
                        if (seg == null) continue;
                        html.append("<p class=\"meta\">第 ").append(i + 1).append(" 段 · ")
                                .append(escape(seg.optString("speakerId", "unknown"))).append("</p>")
                                .append("<pre>").append(escape(seg.optString("textOriginal", ""))).append("</pre>");
                    }
                }
            }
        }
        html.append("<p class=\"meta\">原文只保存在本机；未经留存同意的会话不会落盘。</p></body></html>");
        return html.toString();
    }

    private JSONObject findLocalSession(String sessionId) {
        if (!sessionId.matches("^[A-Za-z0-9._-]{1,80}$")) return null;
        File root = new File(appContext.getFilesDir(), "archive");
        String[] dirs = {"exported", "outbox", ""};
        for (String dir : dirs) {
            File f = dir.isEmpty() ? new File(root, "current.json") : new File(new File(root, dir), sessionId + ".json");
            if (!f.exists() || !f.isFile()) continue;
            try (InputStream in = new FileInputStream(f)) {
                JSONObject json = new JSONObject(new String(readAll(in), StandardCharsets.UTF_8));
                if (sessionId.equals(json.optString("sessionId", "")) || f.getName().startsWith(sessionId)) return json;
            } catch (Exception ignored) {}
        }
        return null;
    }

    /* ============================== SSE ============================== */

    /**
     * 建立一条 SSE 长连接。
     *
     * <p>保留心跳与 5 分钟主动结束（页面按既有退避重连）；区别在于断开窗口不再丢事件：
     * 新连接在 {@code event: ready} 之后补发最近缓冲中的事件，带 {@code id: <seq>}。
     * 补发只做入队，由本连接自己的写线程发送，不占用 accept 线程。</p>
     */
    private void streamSse(OutputStream out, String lastEventIdHeader) throws IOException {
        String head = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream; charset=utf-8\r\n"
                + "Cache-Control: no-store\r\nConnection: keep-alive\r\n"
                + "X-Accel-Buffering: no\r\n\r\n"
                + "event: ready\ndata: {\"ok\":true}\n\n"
                + ": heartbeat\n\n";
        out.write(head.getBytes(StandardCharsets.UTF_8));
        out.flush();

        SseClient client = new SseClient();
        long lastEventId = parseEventId(lastEventIdHeader);
        // 断线重连补发：注册订阅者与快照缓冲放在同一临界区，
        // 保证「补发帧 → 后续实时帧」的先后顺序不会交错。
        // 无 Last-Event-ID（页面手动重连即如此）时补发全部缓冲，最多 ASR_REPLAY_BUFFER 条。
        synchronized (asrLock) {
            sseClients.add(client);
            for (AsrRecord record : asrBuffer) {
                if (record.seq > lastEventId) client.enqueue(record.frame);
            }
        }

        long deadline = System.currentTimeMillis() + SSE_MAX_MILLIS;
        try {
            while (running.get()) {
                long remain = deadline - System.currentTimeMillis();
                if (remain <= 0L) break;
                byte[] frame = nextFrame(client, remain);
                if (frame == null) break;
                out.write(frame);
                out.flush();
            }
        } catch (Exception ignored) {
            // 客户端断开或 5 分钟到期；页面会按既有退避重连，缺口由缓冲补发。
        } finally {
            sseClients.remove(client);
            client.close();
        }
    }

    /**
     * 取下一帧：队列有事件先发事件；空闲时最多等一次心跳间隔，到点发 {@code : heartbeat}。
     * 返回 null 表示连接已关闭或已到 5 分钟上限，应结束连接。
     */
    private static byte[] nextFrame(SseClient client, long remain) throws InterruptedException {
        synchronized (client) {
            if (client.queue.isEmpty() && !client.closed) {
                long waitFor = Math.min(SSE_HEARTBEAT_MILLIS, remain);
                if (waitFor <= 0L) return null;
                client.wait(waitFor);
            }
            if (client.closed) return null;
            byte[] queued = client.queue.pollFirst();
            return queued != null ? queued : SSE_HEARTBEAT;
        }
    }

    /** SSE 单连接：发布侧只入队不写，慢客户端不会阻塞事件源；写失败由写线程移除。 */
    private static final class SseClient {
        private final ArrayDeque<byte[]> queue = new ArrayDeque<>();
        private boolean closed;

        void enqueue(byte[] frame) {
            synchronized (this) {
                if (closed) return;
                queue.addLast(frame);
                notifyAll();
            }
        }

        void close() {
            synchronized (this) {
                closed = true;
                queue.clear();
                notifyAll();
            }
        }
    }

    /** 缓冲中的一帧事件；seq 单调递增，用于 Last-Event-ID 增量补发。 */
    private static final class AsrRecord {
        final long seq;
        final byte[] frame;

        AsrRecord(long seq, byte[] frame) {
            this.seq = seq;
            this.frame = frame;
        }
    }

    /* ============================== HTTP 工具 ============================== */

    private static JSONObject error(String code, String message) {
        JSONObject out = new JSONObject();
        try {
            out.put("ok", false).put("code", code).put("error", message);
        } catch (Exception ignored) {}
        return out;
    }

    private static JSONObject parseJson(byte[] body) throws Exception {
        if (body == null || body.length == 0) return new JSONObject();
        try {
            return new JSONObject(new String(body, StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new LocalHttpException(400, "BAD_JSON", "请求体不是合法 JSON");
        }
    }

    private static byte[] readBody(InputStream in, int length) throws IOException {
        if (length <= 0) return new byte[0];
        int capped = Math.min(length, 12 * 1024 * 1024);
        byte[] buf = new byte[capped];
        int read = 0;
        while (read < capped) {
            int n = in.read(buf, read, capped - read);
            if (n < 0) break;
            read += n;
        }
        if (read == capped && length > capped) throw new IOException("body too large");
        byte[] out = new byte[read];
        System.arraycopy(buf, 0, out, 0, read);
        return out;
    }

    private static int parseLength(String value) {
        if (value == null) return 0;
        try { return Integer.parseInt(value.trim()); } catch (NumberFormatException e) { return 0; }
    }

    private static void writeJson(OutputStream out, int status, JSONObject body) throws IOException {
        writeBytes(out, status, "application/json; charset=utf-8",
                body.toString().getBytes(StandardCharsets.UTF_8), false);
    }

    private static void writeBytes(OutputStream out, int status, String mime, byte[] bytes, boolean cache) throws IOException {
        String head = "HTTP/1.1 " + status + " " + reason(status) + "\r\n"
                + "Content-Type: " + mime + "\r\n"
                + "Content-Length: " + bytes.length + "\r\n"
                + "Cache-Control: " + (cache ? "private, max-age=60" : "no-store") + "\r\n"
                + "X-Content-Type-Options: nosniff\r\n"
                + "Referrer-Policy: no-referrer\r\n"
                + "Connection: close\r\n\r\n";
        out.write(head.getBytes(StandardCharsets.ISO_8859_1));
        out.write(bytes);
        out.flush();
    }

    private static void writeFile(OutputStream out, File file, String mime) throws IOException {
        if (file == null || !file.exists()) {
            writeJson(out, 404, error("MEDIA_NOT_FOUND", "图片不存在"));
            return;
        }
        byte[] bytes;
        try (InputStream in = new FileInputStream(file)) { bytes = readAll(in); }
        writeBytes(out, 200, mime == null ? "application/octet-stream" : mime, bytes, true);
    }

    private static String reason(int status) {
        switch (status) {
            case 200: return "OK";
            case 400: return "Bad Request";
            case 401: return "Unauthorized";
            case 403: return "Forbidden";
            case 404: return "Not Found";
            case 409: return "Conflict";
            case 413: return "Payload Too Large";
            case 429: return "Too Many Requests";
            case 500: return "Internal Server Error";
            case 502: return "Bad Gateway";
            case 503: return "Service Unavailable";
            default: return "Response";
        }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toByteArray();
    }

    private static String segment(String path, int index) {
        String[] parts = path.split("/");
        return index < parts.length ? parts[index] : "";
    }

    private static String decode(String value) {
        try { return java.net.URLDecoder.decode(value, "UTF-8"); } catch (Exception e) { return value; }
    }

    private static String escape(String value) {
        return value == null ? "" : value.replace("&", "&amp;").replace("<", "&lt;")
                .replace(">", "&gt;").replace("\"", "&quot;");
    }

    private static String randomToken() {
        byte[] buf = new byte[24];
        new SecureRandom().nextBytes(buf);
        StringBuilder sb = new StringBuilder();
        for (byte b : buf) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    private static boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null || a.length() != b.length()) return false;
        int diff = 0;
        for (int i = 0; i < a.length(); i++) diff |= a.charAt(i) ^ b.charAt(i);
        return diff == 0;
    }

    private static final class Headers {
        private final java.util.Map<String, String> map = new java.util.HashMap<>();

        Headers(String[] lines, int from) {
            for (int i = from; i < lines.length; i++) {
                int colon = lines[i].indexOf(':');
                if (colon <= 0) continue;
                map.put(lines[i].substring(0, colon).trim().toLowerCase(Locale.ROOT),
                        lines[i].substring(colon + 1).trim());
            }
        }

        String get(String key) { return map.get(key.toLowerCase(Locale.ROOT)); }
    }
}