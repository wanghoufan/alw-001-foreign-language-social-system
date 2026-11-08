package app.socialmate.dualmic;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.PlaybackParams;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import app.socialmate.dualmic.local.CloudKeys;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * 朗读播放控制器（N05 · 由 0.8.2 的 TtsController 改造而来，原逻辑全部保留）。
 *
 * 对外统一为 speak(SpeakRequest) / stop() / setRate() / setLoop() / state()；
 * 内部只按 providerId 分派，学习页面、播放控制、复盘数据都不感知厂商差异：
 *
 *   fake   → FakeTtsAdapter      读 res/raw 预置音频（默认，无后端也能验收）
 *   remote → RemoteTtsAdapter    合成/缓存/校验 → MediaPlayer（PlaybackParams 保音高变速）
 *   system → AndroidSystemTtsAdapter  FALLBACK_ONLY：仅用户手动打开「临时系统声音」才可用
 *
 * 三条硬约束：
 * 1. 同一段循环 N 次 = 1 次准备 + N 次重放，绝不为第 N 次循环再请求合成；
 * 2. 远端失败只给可读错误 + 重试/试听/切换，**不静默切系统声音**；
 * 3. 切段/离页/onStop 立即停播并释放 MediaPlayer。
 */
public class TtsPlaybackController {
    private static final String TAG = "SocialMateTts";
    private static final String PREFS = "socialmate-tts";
    private static final String CONFIG_PREFS = "socialmate-config";
    private static final String DEFAULT_UI_BASE = "http://127.0.0.1:8791";

    public static final String PROVIDER_FAKE = FakeTtsAdapter.PROVIDER_ID;
    public static final String PROVIDER_REMOTE = RemoteTtsAdapter.PROVIDER_ID;
    public static final String PROVIDER_SYSTEM = AndroidSystemTtsAdapter.PROVIDER_ID;

    private static final int LOOP_PAUSE_MS = 450;
    private static final int MAX_LOOP = 20;

    /** 远端声线白名单错误码（P3 直接按 code + httpStatus 断言）。 */
    public static final String CODE_UNKNOWN_VOICE = "UNKNOWN_VOICE";
    /** V1.5.1 T-10：remote_base 不合规时统一返回该 code，原地址保持不变。 */
    public static final String CODE_REMOTE_BASE_REJECTED = "REMOTE_BASE_REJECTED";
    private static final int HTTP_BAD_REQUEST = 400;

    /** 远端声线只用这三个 locale；其余一律视为未知。 */
    private static final String[] REMOTE_LOCALES = {"zh-CN", "en-US", "en-GB"};
    /**
     * 远端声线白名单：locale / voiceId / 展示名。
     * 后端契约（aws-polly / aws-polly-fake）已固定，客户端只做镜像校验，不猜测其他声线。
     */
    private static final String[][] REMOTE_VOICES = {
            {"zh-CN", "Zhiyu", "智瑜（中文女声）"},
            {"en-US", "Ruth", "Ruth（美音女声 · 默认）"},
            {"en-US", "Joanna", "Joanna（美音女声）"},
            {"en-GB", "Amy", "Amy（英音女声 · 默认）"},
            {"en-GB", "Brian", "Brian（英音男声）"}
    };

    private static final String PHASE_IDLE = "idle";
    private static final String PHASE_PREPARING = "preparing";
    private static final String PHASE_PLAYING = "playing";
    private static final String PHASE_STOPPED = "stopped";
    private static final String PHASE_PAUSED = "paused";
    private static final String PHASE_FINISHED = "finished";
    private static final String PHASE_ERROR = "error";

    public interface Listener {
        void onEvent(JSONObject event);
    }

    private static final class Segment {
        final String label;
        final String text;
        final String segmentType;

        Segment(String label, String text, String segmentType) {
            this.label = label == null ? "" : label;
            this.text = text == null ? "" : text;
            this.segmentType = SpeakRequest.normalizeSegment(segmentType);
        }
    }

    private final Context appContext;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final SharedPreferences prefs;
    private final SharedPreferences config;

    private final AndroidSystemTtsAdapter systemTts;
    private final FakeTtsAdapter fakeTts;
    private final RemoteTtsAdapter remoteTts;

    private MediaPlayer player;
    private int generation;
    private String phase = PHASE_IDLE;
    private PreparedWrapper current;
    private int loopIndex;
    private int loopTotal = 1;
    private long startNanos;
    private long lastWallMs;
    private long lastFileMs;
    private TtsError lastError;
    private SpeakRequest lastRequest;
    /** 真实云 Polly 的待确认请求：只有 UI 显式同意后才会发送文本。 */
    private SpeakRequest pendingConsentRequest;
    private JSONObject pendingConsentQuote;
    /** 本次运行内用户已同意云端朗读；只问一次，切换服务商或用户撤销才重置。 */
    private boolean consentSessionGranted;
    /** N05 V1.3：暂停态标记；暂停期间不推进循环重放。 */
    private boolean paused;
    private final List<Segment> playlist = new ArrayList<>();
    private int playlistIndex = -1;

    /** Prepared 的薄包装，避免 controller 直接依赖接口内部类太多字段。 */
    private static final class PreparedWrapper {
        final TtsProviderAdapter.Prepared prepared;
        final String providerId;
        final String cacheKey;

        PreparedWrapper(TtsProviderAdapter.Prepared prepared, String providerId, String cacheKey) {
            this.prepared = prepared;
            this.providerId = providerId;
            this.cacheKey = cacheKey;
        }
    }

    public TtsPlaybackController(Context context, Listener listener) {
        this.appContext = context.getApplicationContext();
        this.listener = listener;
        this.prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        this.config = appContext.getSharedPreferences(CONFIG_PREFS, Context.MODE_PRIVATE);
        this.systemTts = new AndroidSystemTtsAdapter(appContext, this::onSystemEvent);
        this.fakeTts = new FakeTtsAdapter(appContext, this::logOnly);
        this.remoteTts = new RemoteTtsAdapter(appContext, new DevicePairing(appContext),
                this::uiBase, this::remoteServerProvider, this::logOnly);
    }

    /* ------------------------------------------------------------ 对外 API */

    /** 朗读一段。providerId 为空时用设置项里的当前 provider。 */
    public JSONObject speak(SpeakRequest request) {
        if (request == null) {
            return fail(new TtsError(TtsError.CODE_EMPTY_TEXT, "缺少朗读请求", false), null);
        }
        if (request.text == null || request.text.trim().isEmpty()) {
            return fail(new TtsError(TtsError.CODE_EMPTY_TEXT, "朗读文本为空", false), request);
        }
        if (request.text.length() > SpeakRequest.MAX_TEXT_CHARS) {
            return fail(new TtsError(TtsError.CODE_REMOTE_REJECTED,
                    "文本超过 " + SpeakRequest.MAX_TEXT_CHARS + " 字符上限，请分段朗读。", false), request);
        }
        for (String candidate : SpeakRequest.SEGMENT_TYPES) {
            if (candidate.equals(request.segmentType)) {
                return speakChecked(request);
            }
        }
        return fail(new TtsError(TtsError.CODE_BAD_SEGMENT,
                "segmentType 只能是 cn/enA/enB/phrase（收到 " + request.segmentType + "）", false), request);
    }

    private JSONObject speakChecked(SpeakRequest request) {
        String providerId = request.providerId == null || request.providerId.isEmpty()
                ? currentProvider() : request.providerId;
        if (PROVIDER_SYSTEM.equals(providerId) && !systemFallbackEnabled()) {
            return fail(new TtsError(TtsError.CODE_SYSTEM_NOT_ENABLED,
                    "系统声音未启用。请在设置里打开「本机系统声音」再试。",
                    false), request.withProvider(providerId, request.rate));
        }
        SpeakRequest effective = request.withProvider(providerId, request.rate);
        // 只有远端朗读才注入声线偏好；fake / system 一字不改（它们不认 voiceProfileId）。
        if (PROVIDER_REMOTE.equals(providerId)) {
            String voiceLocale = effective.locale == null || effective.locale.isEmpty()
                    ? SpeakRequest.defaultLocale(effective.segmentType) : effective.locale;
            String preferred = remoteVoice(voiceLocale);
            if (preferred.isEmpty()) preferred = effective.voiceProfileId;
            effective = effective.withVoice(preferred);
        }
        // 真实云 Polly：先报价 + 用户显式同意，未同意前绝不把文本发到第三方。
        if (PROVIDER_REMOTE.equals(providerId) && isRealPollyServer() && !consentSessionGranted) {
            return requestConsent(effective);
        }
        lastRequest = effective;
        loopTotal = clampLoop(loopSetting());
        loopIndex = 1;
        lastError = null;
        lastWallMs = 0;
        lastFileMs = 0;
        releasePlayer();
        generation++;
        final int gen = generation;

        Log.i(TAG, "speak request id=" + effective.requestId + " segment=" + effective.segmentType
                + " provider=" + providerId + " locale=" + effective.locale
                + " voice=" + (effective.voiceProfileId.isEmpty() ? "(server-default)" : effective.voiceProfileId)
                + " rate=" + effective.rate + " loop=" + loopTotal
                + " chars=" + effective.text.length() + " textSha=" + effective.textSha256().substring(0, 12));

        if (PROVIDER_SYSTEM.equals(providerId)) {
            phase = PHASE_PLAYING;
            LooseJson result = systemTts.speakBlock(effective.text,
                    SpeakRequest.langFamily(effective.locale), loopTotal, effective.segmentType,
                    (float) effective.rate);
            emit(new LooseJson().put("type", "state").put("state", "system_dispatch")
                    .put("providerId", providerId));
            if (!result.optBoolean("ok")) {
                lastError = new TtsError(result.optString("code"),
                        result.optString("message"), false);
                phase = PHASE_ERROR;
            }
            return result.put("providerId", providerId).put("fallbackOnly", true)
                    .put("loop", loopTotal);
        }

        phase = PHASE_PREPARING;
        emit(new LooseJson().put("type", "state").put("state", "preparing")
                .put("providerId", providerId).put("segmentType", effective.segmentType));
        final SpeakRequest frozen = effective;
        TtsProviderAdapter adapter = PROVIDER_REMOTE.equals(providerId) ? remoteTts : fakeTts;
        final String providerName = providerId;
        TtsProviderAdapter.Callback callback = new TtsProviderAdapter.Callback() {
            @Override public void onReady(TtsProviderAdapter.Prepared prepared) {
                main.post(() -> {
                    if (gen != generation) {
                        Log.i(TAG, "prepare result dropped (superseded) provider=" + providerName);
                        return;
                    }
                    startPlayback(frozen, new PreparedWrapper(prepared, providerName, frozen.cacheKey()), gen);
                });
            }

            @Override public void onFailed(TtsError error) {
                main.post(() -> {
                    if (gen != generation) return;
                    fail(error, frozen);
                });
            }
        };
        if (PROVIDER_REMOTE.equals(providerId)) {
            remoteTts.prepare(frozen, callback, consentSessionGranted);
        } else {
            adapter.prepare(frozen, callback);
        }
        return new LooseJson().put("ok", true).put("code", "OK")
                .put("state", PHASE_PREPARING).put("providerId", providerId)
                .put("segmentType", effective.segmentType).put("locale", effective.locale)
                .put("rate", effective.rate).put("loop", loopTotal)
                .put("textSha256", effective.textSha256());
    }

    public JSONObject stop() {
        return runOnMainJson(() -> {
            generation++;
            pendingConsentRequest = null;
            pendingConsentQuote = null;
            releasePlayer();
            systemTts.stop();
            paused = false;
            phase = PHASE_STOPPED;
            Log.i(TAG, "stop");
            emit(new LooseJson().put("type", "state").put("state", "stopped")
                    .put("providerId", currentProvider()));
            return new LooseJson().put("ok", true).put("code", "OK").put("state", "stopped");
        });
    }

    /** N05 V1.3：暂停当前朗读（保留播放位置），不销毁队列。 */
    public JSONObject pause() {
        return runOnMainJson(() -> {
            if (player == null || !PHASE_PLAYING.equals(phase)) {
                return new LooseJson().put("ok", false).put("code", "TTS_NOT_PLAYING")
                        .put("message", "当前没有正在播放的读音");
            }
            try {
                player.pause();
            } catch (Exception e) {
                return new LooseJson().put("ok", false).put("code", TtsError.CODE_PLAYBACK_FAILED)
                        .put("message", "暂停失败：" + e.getClass().getSimpleName());
            }
            paused = true;
            phase = PHASE_PAUSED;
            Log.i(TAG, "paused at loop=" + loopIndex + "/" + loopTotal);
            emit(new LooseJson().put("type", "state").put("state", "paused")
                    .put("loopIndex", loopIndex).put("loopTotal", loopTotal));
            return new LooseJson().put("ok", true).put("code", "OK").put("state", "paused");
        });
    }

    /** 从暂停位置继续；声道与倍速保持原设置。 */
    public JSONObject resume() {
        return runOnMainJson(() -> {
            if (player == null || !PHASE_PAUSED.equals(phase)) {
                return new LooseJson().put("ok", false).put("code", "TTS_NOT_PAUSED")
                        .put("message", "当前没有已暂停的读音");
            }
            paused = false;
            phase = PHASE_PLAYING;
            try {
                applyPlaybackParams("resume");
                player.start();
                startNanos = System.nanoTime();
            } catch (Exception e) {
                return new LooseJson().put("ok", false).put("code", TtsError.CODE_PLAYBACK_FAILED)
                        .put("message", "继续失败：" + e.getClass().getSimpleName());
            }
            Log.i(TAG, "resumed at loop=" + loopIndex + "/" + loopTotal);
            emit(new LooseJson().put("type", "state").put("state", "resumed")
                    .put("loopIndex", loopIndex).put("loopTotal", loopTotal));
            return new LooseJson().put("ok", true).put("code", "OK").put("state", "resumed");
        });
    }

    /** 只用 0.75 / 0.9 / 1.0；播放中改速立即生效且保音高。 */
    public JSONObject setRate(double value) {
        double chosen = nearestRate(value);
        if (Math.abs(chosen - value) > 0.001) {
            return new LooseJson().put("ok", false).put("code", TtsError.CODE_BAD_RATE)
                    .put("message", "只支持 0.75 / 0.9 / 1.0 倍速");
        }
        prefs.edit().putFloat("rate", (float) chosen).apply();
        systemTts.setRate((float) chosen);
        return runOnMainJson(() -> {
            if (player != null) applyPlaybackParams("live change");
            Log.i(TAG, "rate set " + chosen);
            emit(new LooseJson().put("type", "state").put("state", "rate").put("rate", chosen));
            return new LooseJson().put("ok", true).put("code", "OK").put("rate", chosen);
        });
    }

    public JSONObject setLoop(int count) {
        int chosen = clampLoop(count);
        prefs.edit().putInt("loop", chosen).apply();
        emit(new LooseJson().put("type", "state").put("state", "loop").put("loop", chosen));
        return new LooseJson().put("ok", true).put("code", "OK").put("loop", chosen);
    }

    /** 设置页显式授权/撤销：授权后本次运行内云端朗读不再弹窗；撤销后下次需要重新确认。 */
    public JSONObject setCloudConsent(boolean granted) {
        consentSessionGranted = granted;
        pendingConsentRequest = null;
        pendingConsentQuote = null;
        Log.i(TAG, "cloud consent set " + granted);
        emit(new LooseJson().put("type", "state").put("state", "consent_set").put("granted", granted));
        return providerInfo();
    }

    public JSONObject setProvider(String providerId) {
        String chosen = normalizeProvider(providerId);
        prefs.edit().putString("provider", chosen).apply();
        pendingConsentRequest = null;
        pendingConsentQuote = null;
        consentSessionGranted = false;
        Log.i(TAG, "provider set " + chosen);
        emit(new LooseJson().put("type", "state").put("state", "provider")
                .put("providerId", chosen));
        return providerInfo();
    }

    /** 用户手动开关「临时系统声音」（FALLBACK_ONLY）。默认关闭。 */
    public JSONObject setSystemFallback(boolean enabled) {
        prefs.edit().putBoolean("system_fallback", enabled).apply();
        if (enabled) systemTts.ensureReady(); else systemTts.stop();
        Log.i(TAG, "system fallback " + (enabled ? "ENABLED_BY_USER" : "disabled"));
        emit(new LooseJson().put("type", "state").put("state", "system_fallback")
                .put("enabled", enabled).put("flag", AndroidSystemTtsAdapter.FALLBACK_FLAG));
        return providerInfo();
    }

    public JSONObject providerInfo() {
        String provider = currentProvider();
        JSONArray providers = new JSONArray();
        providers.put(describeProvider(PROVIDER_FAKE, "本地预置音频（默认 · 无后端可验收）",
                false, true));
        providers.put(describeProvider(PROVIDER_REMOTE, "远端神经 TTS（Mac 私有服务 /v12/api/tts）",
                false, true));
        providers.put(describeProvider(PROVIDER_SYSTEM, "系统声音（本机引擎）",
                true, systemFallbackEnabled()));
        return new LooseJson().put("ok", true).put("code", "OK")
                .put("providerId", provider)
                .put("providerLabel", labelOf(provider))
                .put("fallbackOnly", PROVIDER_SYSTEM.equals(provider))
                .put("systemFallbackEnabled", systemFallbackEnabled())
                .put("systemFlag", AndroidSystemTtsAdapter.FALLBACK_FLAG)
                .put("remoteBase", uiBase())
                .put("remoteServerProvider", remoteServerProvider())
                .put("cloudConsent", consentSessionGranted)
                .put("remoteVoices", remoteVoicesJson())
                .put("rate", (double) rateSetting())
                .put("loop", loopSetting())
                .put("providers", providers)
                .put("note", "默认用本机系统语音朗读；Amazon Polly 凭据到位后可切到云端声线。远端失败不会自动切系统声音。");
    }

    public JSONObject state() {
        LooseJson out = new LooseJson().put("ok", true).put("code", "OK")
                .put("providerId", currentProvider())
                .put("providerLabel", labelOf(currentProvider()))
                .put("fallbackOnly", PROVIDER_SYSTEM.equals(currentProvider()))
                .put("systemFallbackEnabled", systemFallbackEnabled())
                .put("remoteServerProvider", remoteServerProvider())
                .put("pendingConsent", pendingConsentRequest != null)
                .put("phase", phase)
                .put("playing", PHASE_PLAYING.equals(phase))
                .put("rate", (double) rateSetting())
                .put("loop", loopSetting())
                .put("loopIndex", loopIndex).put("loopTotal", loopTotal)
                .put("lastWallMs", lastWallMs).put("lastFileMs", lastFileMs)
                .put("synthRequests", remoteTts.synthRequestCount())
                .put("fakePrepares", fakeTts.prepareCount());
        if (current != null) {
            out.put("audioId", current.prepared.audioId)
                    .put("source", current.prepared.source)
                    .put("cacheHit", current.prepared.cacheHit)
                    .put("voiceId", current.prepared.voiceId)
                    .put("modelVersion", current.prepared.modelVersion)
                    .put("warning", current.prepared.warning)
                    .put("cacheKey", cacheKeyHint());
        }
        if (lastRequest != null) {
            out.put("segmentType", lastRequest.segmentType)
                    .put("locale", lastRequest.locale)
                    .put("requestId", lastRequest.requestId)
                    .put("textSha256", lastRequest.textSha256());
        }
        if (lastError != null) {
            out.put("lastError", new LooseJson().put("code", lastError.code)
                    .put("message", lastError.message)
                    .put("retryable", lastError.retryable)
                    .put("httpStatus", lastError.httpStatus));
        }
        return out;
    }

    /** 当前远端服务商是否是需要显式同意的真实云 Polly。 */
    private boolean isRealPollyServer() {
        return "aws-polly".equals(remoteServerProvider());
    }

    /**
     * 真实云 Polly 的报价 + 同意前置：只发 estimate=true，不合成、不落盘、不产生费用。
     * 结果通过 consent_required 事件交给 UI 弹确认框。
     */
    private JSONObject requestConsent(SpeakRequest request) {
        pendingConsentRequest = request;
        pendingConsentQuote = null;
        lastRequest = request;
        phase = PHASE_PREPARING;
        emit(new LooseJson().put("type", "state").put("state", "consent_pending")
                .put("providerId", PROVIDER_REMOTE).put("serverProvider", "aws-polly")
                .put("segmentType", request.segmentType).put("locale", request.locale)
                .put("requestId", request.requestId));
        final SpeakRequest frozen = request;
        remoteTts.estimate(frozen, new RemoteTtsAdapter.QuoteCallback() {
            @Override public void onQuote(JSONObject quote) {
                main.post(() -> {
                    if (pendingConsentRequest != frozen) return;
                    // 云端未配置（无凭据）时没有任何东西可同意：直接报错，不弹确认框，
                    // 避免用户每点一段就被弹窗打断。
                    if (quote != null && quote.has("configured") && !quote.optBoolean("configured", true)) {
                        pendingConsentRequest = null;
                        pendingConsentQuote = null;
                        phase = PHASE_IDLE;
                        fail(new TtsError(TtsError.CODE_PROVIDER_NOT_CONFIGURED,
                                "Amazon Polly 尚未配置（无凭据）：不会发送文本、不会产生费用。"
                                        + "请先切回本机语音，或补齐 AWS 凭据。", false), frozen);
                        return;
                    }
                    pendingConsentQuote = quote;
                    phase = PHASE_IDLE;
                    emit(new LooseJson().put("type", "state").put("state", "consent_required")
                            .put("providerId", PROVIDER_REMOTE).put("serverProvider", "aws-polly")
                            .put("segmentType", frozen.segmentType).put("locale", frozen.locale)
                            .put("requestId", frozen.requestId).put("quote", quote));
                });
            }

            @Override public void onFailed(TtsError error) {
                main.post(() -> {
                    if (pendingConsentRequest != frozen) return;
                    pendingConsentRequest = null;
                    pendingConsentQuote = null;
                    fail(error, frozen);
                });
            }
        });
        return new LooseJson().put("ok", true).put("code", "OK")
                .put("state", "consent_pending").put("providerId", PROVIDER_REMOTE)
                .put("serverProvider", "aws-polly").put("segmentType", request.segmentType)
                .put("locale", request.locale).put("requestId", request.requestId);
    }

    /** 用户在确认框点「同意并朗读」：只对本次请求放行，然后重新走正常合成。 */
    public JSONObject confirmConsent() {
        SpeakRequest request = pendingConsentRequest;
        if (request == null) {
            return fail(new TtsError(TtsError.CODE_NO_PENDING_CONSENT,
                    "没有待确认的云端朗读请求。", false), lastRequest);
        }
        pendingConsentRequest = null;
        pendingConsentQuote = null;
        consentSessionGranted = true;
        Log.i(TAG, "consent granted provider=aws-polly request=" + request.requestId);
        return speak(request);
    }

    /** 用户取消：清掉待确认请求，不发任何合成。 */
    public JSONObject cancelConsent() {
        boolean had = pendingConsentRequest != null;
        pendingConsentRequest = null;
        pendingConsentQuote = null;
        consentSessionGranted = false;
        if (had) {
            emit(new LooseJson().put("type", "state").put("state", "consent_cancelled"));
        }
        return new LooseJson().put("ok", true).put("code", "OK").put("cancelled", had);
    }

    /** 重试上一次请求（同一段、同一 provider），不改变 provider。 */
    public JSONObject retry() {
        if (lastRequest == null) {
            return new LooseJson().put("ok", false).put("code", TtsError.CODE_EMPTY_TEXT)
                    .put("message", "还没有可重试的朗读请求");
        }
        return speak(lastRequest);
    }

    public JSONObject probeRemote() {
        return remoteTts.probe();
    }

    /* -------------------------------------------------- 与 0.8.2 兼容的入口 */

    /** 旧调用方（自检页/WebView 桥）用文本+语言朗读；这里转成 SpeakRequest。 */
    public JSONObject speakText(String text, String lang) {
        return speakTextWithLoop(text, lang, 0);
    }

    public JSONObject speakTextWithLoop(String text, String lang, int loop) {
        return speakTextWithIds(text, lang, loop, "", "", 0);
    }

    /** N05：把真实 recordId/blockId/revision 带进朗读请求，服务端缓存键不再退化成 selftest。 */
    public JSONObject speakTextWithIds(String text, String lang, int loop,
                                       String recordId, String blockId, int revision) {
        if (loop > 0) setLoop(loop);
        String segmentType = SpeakRequest.segmentOfLang(lang);
        SpeakRequest request = new SpeakRequest("req-" + System.currentTimeMillis(),
                recordId == null ? "" : recordId, blockId == null ? "" : blockId,
                Math.max(0, revision), segmentType, text,
                SpeakRequest.defaultLocale(segmentType), "",
                currentProvider(), "", rateSetting(), "");
        return speak(request);
    }

    public JSONObject setPlaylist(String json) {
        return runOnMainJson(() -> {
            playlist.clear();
            try {
                JSONArray array = new JSONArray(json == null ? "[]" : json);
                for (int i = 0; i < array.length(); i++) {
                    JSONObject item = array.optJSONObject(i);
                    if (item == null) continue;
                    String segmentType = item.optString("segmentType", "");
                    if (segmentType.isEmpty()) segmentType = SpeakRequest.segmentOfLang(item.optString("lang", "zh"));
                    playlist.add(new Segment(item.optString("label", "段" + (i + 1)),
                            item.optString("text", ""), segmentType));
                }
            } catch (Exception e) {
                return new LooseJson().put("ok", false).put("code", TtsError.CODE_EMPTY_TEXT)
                        .put("message", "播放列表格式不正确：" + e.getMessage());
            }
            if (playlistIndex >= playlist.size()) playlistIndex = -1;
            return new LooseJson().put("ok", true).put("code", "OK").put("total", playlist.size());
        });
    }

    public JSONObject nextSegment() {
        return step(1);
    }

    public JSONObject previousSegment() {
        return step(-1);
    }

    private JSONObject step(int direction) {
        if (playlist.isEmpty()) {
            return new LooseJson().put("ok", false).put("code", TtsError.CODE_EMPTY_TEXT)
                    .put("message", "还没有设置播放段列表");
        }
        int target = playlistIndex < 0 ? (direction > 0 ? 0 : playlist.size() - 1)
                : playlistIndex + direction;
        if (target < 0 || target >= playlist.size()) {
            return new LooseJson().put("ok", true).put("code", "OK")
                    .put("state", "boundary").put("index", playlistIndex).put("total", playlist.size());
        }
        playlistIndex = target;
        Segment segment = playlist.get(target);
        // 切段：先停掉上一段（含系统队列），再请求新段。
        stop();
        SpeakRequest request = new SpeakRequest("req-" + System.currentTimeMillis(),
                "selftest", segment.label, 1, segment.segmentType, segment.text,
                SpeakRequest.defaultLocale(segment.segmentType), "",
                currentProvider(), "", rateSetting(), "");
        JSONObject result = speak(request);
        try {
            result.put("playlistIndex", playlistIndex);
            result.put("playlistTotal", playlist.size());
        } catch (Exception ignored) { }
        return result;
    }

    public JSONObject setListened(String key, boolean listened) {
        if (key == null || key.trim().isEmpty()) {
            return new LooseJson().put("ok", false).put("code", TtsError.CODE_EMPTY_TEXT)
                    .put("message", "缺少段标识");
        }
        String safe = key.trim();
        prefs.edit().putBoolean("listened_" + safe, listened).apply();
        emit(new LooseJson().put("type", "state").put("state", "listened")
                .put("key", safe).put("listened", listened));
        return new LooseJson().put("ok", true).put("code", "OK").put("key", safe).put("listened", listened);
    }

    public JSONObject isListened(String key) {
        String safe = key == null ? "" : key.trim();
        return new LooseJson().put("ok", true).put("code", "OK").put("key", safe)
                .put("listened", !safe.isEmpty() && prefs.getBoolean("listened_" + safe, false));
    }

    public JSONObject prefsSnapshot() {
        JSONArray keys = new JSONArray();
        int count = 0;
        for (String key : prefs.getAll().keySet()) {
            if (key.startsWith("listened_") && prefs.getBoolean(key, false)) {
                keys.put(key.substring("listened_".length()));
                count++;
            }
        }
        return new LooseJson().put("ok", true).put("code", "OK")
                .put("rate", (double) rateSetting()).put("loop", loopSetting())
                .put("provider", currentProvider())
                .put("systemFallbackEnabled", systemFallbackEnabled())
                .put("listened", keys).put("listenedCount", count);
    }

    /* ------------------------------------------- 引擎信息（用于诊断/设置页） */

    public JSONObject status() {
        systemTts.ensureReady();
        JSONObject system = systemTts.status();
        return new LooseJson().put("ok", true).put("code", "OK")
                .put("providerId", currentProvider())
                .put("providerLabel", labelOf(currentProvider()))
                .put("systemFallbackEnabled", systemFallbackEnabled())
                .put("systemFlag", AndroidSystemTtsAdapter.FALLBACK_FLAG)
                .put("engine", system.optString("engine", "UNKNOWN"))
                .put("engineLabel", system.optString("engineLabel", "UNKNOWN"))
                .put("engineState", system.optString("state", "idle"))
                .put("rate", (double) rateSetting()).put("loop", loopSetting())
                .put("zhVoice", system.optString("zhVoice", "(engine-default)"))
                .put("enVoice", system.optString("enVoice", "(engine-default)"))
                .put("zhAvailable", system.optBoolean("zhAvailable", false))
                .put("enAvailable", system.optBoolean("enAvailable", false))
                .put("voices", system.optInt("voices", 0));
    }

    public JSONObject voices() {
        systemTts.ensureReady();
        return systemTts.voices();
    }

    public JSONObject setVoice(String lang, String voiceName) {
        return systemTts.setVoice(lang, voiceName);
    }

    public JSONObject diagnose(String lang) {
        systemTts.ensureReady();
        return systemTts.diagnose(lang);
    }

    /* -------------------------------------------------------- 生命周期 */

    /** 切页/onStop：停播并释放播放器（系统引擎也停），保留 provider 设置。 */
    public void onStop() {
        runOnMain(() -> {
            generation++;
            releasePlayer();
            systemTts.onStop();
            if (PHASE_PLAYING.equals(phase) || PHASE_PREPARING.equals(phase)) {
                phase = PHASE_STOPPED;
                Log.i(TAG, "onStop → stopped");
                emit(new LooseJson().put("type", "state").put("state", "stopped")
                        .put("reason", "onStop"));
            }
        });
    }

    public void shutdown() {
        runOnMain(() -> {
            generation++;
            releasePlayer();
            systemTts.shutdown();
            fakeTts.release();
            remoteTts.release();
            phase = PHASE_IDLE;
            Log.i(TAG, "shutdown");
        });
    }

    public void ensureReady() {
        if (PROVIDER_SYSTEM.equals(currentProvider())) systemTts.ensureReady();
    }

    /* ---------------------------------------------------------- 播放实现 */

    private void startPlayback(SpeakRequest request, PreparedWrapper wrapper, int gen) {
        File file = wrapper.prepared.file;
        if (file == null || !file.isFile() || file.length() <= 0) {
            fail(new TtsError(TtsError.CODE_AUDIO_EMPTY, "音频文件不存在或为空，无法播放。", true), request);
            return;
        }
        current = wrapper;
        phase = PHASE_PREPARING;
        Log.i(TAG, "prepare ok provider=" + wrapper.providerId + " file=" + file.getName()
                + " bytes=" + file.length() + " cacheHit=" + wrapper.prepared.cacheHit
                + " source=" + wrapper.prepared.source + " audioId=" + wrapper.prepared.audioId
                + " warning=" + wrapper.prepared.warning);
        emit(new LooseJson().put("type", "state").put("state", "prepared")
                .put("providerId", wrapper.providerId)
                .put("cacheHit", wrapper.prepared.cacheHit)
                .put("source", wrapper.prepared.source)
                .put("audioId", wrapper.prepared.audioId)
                .put("warning", wrapper.prepared.warning)
                .put("loopTotal", loopTotal));
        try {
            MediaPlayer created = new MediaPlayer();
            created.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build());
            created.setDataSource(file.getAbsolutePath());
            created.setOnPreparedListener(mp -> {
                if (gen != generation) return;
                lastFileMs = mp.getDuration();
                phase = PHASE_PLAYING;
                Log.i(TAG, "media prepared fileMs=" + lastFileMs + " loopTotal=" + loopTotal);
                playLoop(gen);
            });
            created.setOnCompletionListener(mp -> onLoopCompleted(gen));
            created.setOnErrorListener((mp, what, extra) -> {
                if (gen == generation) {
                    fail(new TtsError(TtsError.CODE_PLAYBACK_FAILED,
                            "播放器报错（what=" + what + " extra=" + extra + "）", true), request);
                }
                return true;
            });
            player = created;
            created.prepareAsync();
        } catch (Exception e) {
            fail(new TtsError(TtsError.CODE_PLAYBACK_FAILED,
                    "无法打开音频：" + e.getClass().getSimpleName(), true), request);
        }
    }

    private void playLoop(int gen) {
        if (gen != generation || player == null) return;
        applyPlaybackParams("loop " + loopIndex + "/" + loopTotal);
        startNanos = System.nanoTime();
        try {
            player.start();
        } catch (Exception e) {
            fail(new TtsError(TtsError.CODE_PLAYBACK_FAILED,
                    "播放器启动失败：" + e.getClass().getSimpleName(), true), lastRequest);
            return;
        }
        Log.i(TAG, "play start loop=" + loopIndex + "/" + loopTotal
                + " rate=" + rateSetting() + " speed=" + rateSetting() + " pitch=1.0"
                + " provider=" + (current == null ? "?" : current.providerId));
        emit(new LooseJson().put("type", "state").put("state", "playing")
                .put("loopIndex", loopIndex).put("loopTotal", loopTotal)
                .put("rate", rateSetting())
                .put("providerId", current == null ? "" : current.providerId));
    }

    private void onLoopCompleted(int gen) {
        if (gen != generation) return;
        lastWallMs = startNanos == 0 ? 0 : (System.nanoTime() - startNanos) / 1_000_000L;
        Log.i(TAG, "play complete loop=" + loopIndex + "/" + loopTotal
                + " wallMs=" + lastWallMs + " fileMs=" + lastFileMs
                + " rate=" + rateSetting());
        emit(new LooseJson().put("type", "state").put("state", "loop_done")
                .put("loopIndex", loopIndex).put("loopTotal", loopTotal)
                .put("wallMs", lastWallMs).put("fileMs", lastFileMs));
        if (loopIndex < loopTotal) {
            loopIndex++;
            Log.i(TAG, "replay loop=" + loopIndex + "/" + loopTotal + " (cached file, no synth)");
            main.postDelayed(() -> {
                if (gen != generation || player == null || paused) return;
                try {
                    player.seekTo(0);
                    playLoop(gen);
                } catch (Exception e) {
                    fail(new TtsError(TtsError.CODE_PLAYBACK_FAILED,
                            "重放失败：" + e.getClass().getSimpleName(), true), lastRequest);
                }
            }, LOOP_PAUSE_MS);
            return;
        }
        phase = PHASE_FINISHED;
        Log.i(TAG, "loop finished total=" + loopTotal + " synthRequests="
                + remoteTts.synthRequestCount() + " fakePrepares=" + fakeTts.prepareCount());
        emit(new LooseJson().put("type", "state").put("state", "finished")
                .put("loopTotal", loopTotal).put("wallMs", lastWallMs)
                .put("synthRequests", remoteTts.synthRequestCount()));
        releasePlayer();
    }

    /** 保音高变速：setSpeed(rate) + setPitch(1.0)，音调不变。 */
    private void applyPlaybackParams(String where) {
        if (player == null) return;
        double rate = rateSetting();
        try {
            PlaybackParams params = new PlaybackParams();
            params.allowDefaults();
            params.setSpeed((float) rate);
            params.setPitch(1.0f);
            player.setPlaybackParams(params);
            PlaybackParams applied = player.getPlaybackParams();
            Log.i(TAG, "PlaybackParams " + where + " speed=" + applied.getSpeed()
                    + " pitch=" + applied.getPitch() + " rate=" + rate);
        } catch (Exception e) {
            Log.w(TAG, "PlaybackParams failed " + e.getClass().getSimpleName());
        }
    }

    private void releasePlayer() {
        if (player != null) {
            try { player.reset(); } catch (Exception ignored) { }
            try { player.release(); } catch (Exception ignored) { }
            player = null;
            Log.i(TAG, "player released");
        }
        current = null;
    }

    private JSONObject fail(TtsError error, SpeakRequest request) {
        lastError = error;
        phase = PHASE_ERROR;
        releasePlayer();
        Log.e(TAG, "error code=" + error.code + " retryable=" + error.retryable
                + " message=" + error.message
                + (request == null ? "" : " segment=" + request.segmentType
                + " provider=" + request.providerId));
        LooseJson event = new LooseJson().put("type", "state").put("state", "error")
                .put("ok", false).put("code", error.code).put("message", error.message)
                .put("retryable", error.retryable)
                .put("providerId", request == null ? currentProvider() : request.providerId)
                .put("actions", new JSONArray().put("retry").put("preview").put("switch_provider"));
        emit(event);
        return event;
    }

    /* ------------------------------------------------------------ 设置项 */

    private String uiBase() {
        String override = prefs.getString("remote_base", "");
        if (override != null && !override.trim().isEmpty()
                && rejectRemoteBase(override) == null) {
            return override.trim();
        }
        String value = config.getString("ui_url", DEFAULT_UI_BASE);
        if (value == null || value.trim().isEmpty()) value = DEFAULT_UI_BASE;
        value = value.trim();
        while (value.endsWith("/")) value = value.substring(0, value.length() - 1);
        if (value.endsWith("/v12")) value = value.substring(0, value.length() - 4);
        return value;
    }

    /** 仅验收用：临时指定远端基地址（不写 socialmate-config，不影响主 UI 地址）。 */
    public JSONObject setRemoteBase(String base) {
        String trimmed = base == null ? "" : base.trim();
        String reason = rejectRemoteBase(trimmed);
        if (reason != null) {
            // 只写失败原因，不打印原地址里的任何凭据片段；原 base 保持不变。
            Log.w(TAG, "remote base rejected: " + reason);
            return new LooseJson().put("ok", false).put("code", CODE_REMOTE_BASE_REJECTED)
                    .put("message", "远端基地址不被允许：" + reason)
                    .put("base", uiBase());
        }
        prefs.edit().putString("remote_base", trimmed).apply();
        return new LooseJson().put("ok", true).put("code", "OK").put("base", uiBase());
    }

    /**
     * remote_base 白名单（V1.5.1 T-10，Activity 与 controller 共用同一份规则）：
     * 只允许 http/https，不允许 userinfo，host 仅限本机 / RFC1918 私网 / *.ts.net，
     * 端口不限制但必须是合法数字；返回 null 表示通过，否则返回不含敏感值的拒绝原因。
     */
    public static String rejectRemoteBase(String base) {
        String value = base == null ? "" : base.trim();
        if (value.isEmpty()) return null; // 清空 = 回退默认地址
        if (value.indexOf('@') >= 0) return "不允许 userinfo（@）";
        URI parsed;
        try {
            parsed = new URI(value);
        } catch (Exception e) {
            return "地址格式不合法";
        }
        String scheme = parsed.getScheme();
        if (scheme == null) return "缺少 http/https scheme";
        scheme = scheme.toLowerCase(Locale.ROOT);
        if (!"http".equals(scheme) && !"https".equals(scheme)) return "只允许 http/https";
        if (parsed.getRawUserInfo() != null) return "不允许 userinfo（@）";
        String host = parsed.getHost();
        if (host == null || host.trim().isEmpty()) return "缺少 host";
        host = host.trim().toLowerCase(Locale.ROOT);
        if (host.startsWith("[") && host.endsWith("]")) {
            host = host.substring(1, host.length() - 1);
        }
        if (!isAllowedRemoteHost(host)) return "host 不在白名单";
        if (parsed.getPort() > 65535) return "端口不合法";
        String path = parsed.getRawPath();
        if (path != null) {
            String lower = path.toLowerCase(Locale.ROOT);
            if (lower.contains("..")) return "路径不允许包含 ..";
            if (lower.contains("%2e")) return "路径不允许编码点号";
        }
        return null;
    }

    /** 本机回环 / RFC1918 私网 / Tailscale MagicDNS。 */
    private static boolean isAllowedRemoteHost(String host) {
        if ("127.0.0.1".equals(host) || "localhost".equals(host) || "::1".equals(host)) return true;
        if (host.endsWith(".ts.net") && host.length() > ".ts.net".length()) return true;
        String[] parts = host.split("\\.");
        if (parts.length != 4) return false;
        int[] octets = new int[4];
        for (int i = 0; i < 4; i++) {
            String part = parts[i];
            if (part.isEmpty() || part.length() > 3) return false;
            for (int c = 0; c < part.length(); c++) {
                if (!Character.isDigit(part.charAt(c))) return false;
            }
            octets[i] = Integer.parseInt(part);
            if (octets[i] > 255) return false;
        }
        if (octets[0] == 10) return true;
        if (octets[0] == 172 && octets[1] >= 16 && octets[1] <= 31) return true;
        return octets[0] == 192 && octets[1] == 168;
    }

    /** 当前远端基地址（只读展示用）。 */
    public String remoteBase() {
        return uiBase();
    }

    /** 服务端逻辑 provider：换厂商只改这里，播放器与学习页面不动。 */
    public String remoteServerProvider() {
        String value = prefs.getString("remote_provider", "fake");
        return value == null || value.trim().isEmpty() ? "fake" : value.trim();
    }

    public JSONObject setRemoteProvider(String providerId) {
        String chosen = providerId == null ? "" : providerId.trim();
        prefs.edit().putString("remote_provider", chosen.isEmpty() ? "fake" : chosen).apply();
        pendingConsentRequest = null;
        pendingConsentQuote = null;
        consentSessionGranted = false;
        Log.i(TAG, "remote server provider → " + remoteServerProvider());
        return providerInfo();
    }

    /* ------------------------------------------- 远端声线偏好（Polly V1.1） */

    /**
     * 远端声线偏好；空字符串 = 交给服务端默认（后端按 locale 决定）。
     * locale 不在 zh-CN / en-US / en-GB 内时返回空串，避免把脏值带进请求。
     */
    public String remoteVoice(String locale) {
        String key = remoteVoiceKey(locale);
        if (key.isEmpty()) return "";
        String value = prefs.getString(key, "");
        return value == null ? "" : value.trim();
    }

    /**
     * 设置远端声线：只接受白名单（Zhiyu / Ruth / Joanna / Amy / Brian），
     * voiceId 为空表示清除（回到服务端默认），其余一律 400 UNKNOWN_VOICE。
     */
    public JSONObject setRemoteVoice(String locale, String voiceId) {
        String normalized = normalizeRemoteLocale(locale);
        String raw = voiceId == null ? "" : voiceId.trim();
        if (normalized.isEmpty()) {
            return new LooseJson().put("ok", false).put("code", CODE_UNKNOWN_VOICE)
                    .put("httpStatus", HTTP_BAD_REQUEST)
                    .put("message", "未知 locale（只支持 zh-CN / en-US / en-GB）：" + (locale == null ? "" : locale))
                    .put("locale", locale == null ? "" : locale)
                    .put("voiceId", raw);
        }
        String chosen = canonicalVoice(normalized, raw);
        if (!raw.isEmpty() && chosen.isEmpty()) {
            return new LooseJson().put("ok", false).put("code", CODE_UNKNOWN_VOICE)
                    .put("httpStatus", HTTP_BAD_REQUEST)
                    .put("message", normalized + " 不支持声线 " + raw + "；可选：" + allowedVoiceIds(normalized))
                    .put("locale", normalized).put("voiceId", raw)
                    .put("allowed", allowedVoiceIds(normalized));
        }
        prefs.edit().putString(remoteVoiceKey(normalized), chosen).apply();
        Log.i(TAG, "remote voice " + normalized + " → "
                + (chosen.isEmpty() ? "(server default)" : chosen));
        emit(new LooseJson().put("type", "state").put("state", "remote_voice")
                .put("locale", normalized).put("voiceId", chosen));
        return providerInfo();
    }

    /** providerInfo()/调试用：locale / voiceId / label / selected 平铺数组（空 voiceId 行 = 服务端默认）。 */
    private JSONArray remoteVoicesJson() {
        JSONArray out = new JSONArray();
        for (String locale : REMOTE_LOCALES) {
            String current = remoteVoice(locale);
            out.put(new LooseJson().put("locale", locale).put("voiceId", "")
                    .put("label", "服务端默认").put("selected", current.isEmpty()));
            for (String[] row : REMOTE_VOICES) {
                if (!row[0].equals(locale)) continue;
                out.put(new LooseJson().put("locale", row[0]).put("voiceId", row[1])
                        .put("label", row[2]).put("selected", row[1].equals(current)));
            }
        }
        return out;
    }

    private static String remoteVoiceKey(String locale) {
        String normalized = normalizeRemoteLocale(locale);
        return normalized.isEmpty() ? "" : "remote_voice_" + normalized;
    }

    /** 只认三个契约 locale（大小写无关，输出规范写法）。 */
    private static String normalizeRemoteLocale(String locale) {
        String value = locale == null ? "" : locale.trim();
        for (String candidate : REMOTE_LOCALES) {
            if (candidate.equalsIgnoreCase(value)) return candidate;
        }
        return "";
    }

    /** 白名单校验并返回规范 voiceId；不合法返回空串。 */
    private static String canonicalVoice(String locale, String voiceId) {
        if (voiceId == null || voiceId.isEmpty()) return "";
        for (String[] row : REMOTE_VOICES) {
            if (row[0].equals(locale) && row[1].equalsIgnoreCase(voiceId)) return row[1];
        }
        return "";
    }

    private static String allowedVoiceIds(String locale) {
        List<String> ids = new ArrayList<>();
        for (String[] row : REMOTE_VOICES) {
            if (row[0].equals(locale)) ids.add(row[1]);
        }
        return String.join(" / ", ids);
    }

    public String currentProvider() {
        String stored = prefs.getString("provider", "");
        if (stored != null && !stored.isEmpty()) return normalizeProvider(stored);
        // 新装/未设置过时：手机已配豆包 Key 就默认豆包直连，避免落到不可用的系统 TTS。
        try {
            if (new CloudKeys(appContext).hasDoubao()) return PROVIDER_REMOTE;
        } catch (Exception ignored) {}
        return PROVIDER_SYSTEM;
    }

    public boolean systemFallbackEnabled() {
        return prefs.getBoolean("system_fallback", true);
    }

    public double rateSetting() {
        return nearestRate(prefs.getFloat("rate", 0.9f));
    }

    public int loopSetting() {
        return clampLoop(prefs.getInt("loop", 1));
    }

    private String labelOf(String providerId) {
        if (PROVIDER_REMOTE.equals(providerId)) return "远端神经 TTS";
        if (PROVIDER_SYSTEM.equals(providerId)) return "系统声音（本机引擎）";
        return "本地预置音频";
    }

    private static JSONObject describeProvider(String id, String label, boolean fallbackOnly,
                                               boolean usable) {
        return new LooseJson().put("providerId", id).put("label", label)
                .put("fallbackOnly", fallbackOnly).put("usable", usable);
    }

    private static String normalizeProvider(String providerId) {
        if (PROVIDER_REMOTE.equals(providerId)) return PROVIDER_REMOTE;
        if (PROVIDER_SYSTEM.equals(providerId)) return PROVIDER_SYSTEM;
        return PROVIDER_FAKE;
    }

    private static double nearestRate(double value) {
        double[] allowed = {0.75, 0.9, 1.0};
        double best = 0.9;
        double distance = Double.MAX_VALUE;
        for (double candidate : allowed) {
            double d = Math.abs(candidate - value);
            if (d < distance) {
                distance = d;
                best = candidate;
            }
        }
        return best;
    }

    private static int clampLoop(int value) {
        if (value <= 0) return 1;
        return Math.min(value, MAX_LOOP);
    }

    /* ------------------------------------------------------------ 事件/线程 */

    private void onSystemEvent(JSONObject event) {
        String state = event.optString("state");
        if ("finished".equals(state)) {
            phase = PHASE_FINISHED;
        } else if ("stopped".equals(state)) {
            phase = PHASE_STOPPED;
        } else if ("error".equals(state) && event.optBoolean("ok") == false) {
            phase = PHASE_ERROR;
        }
        emit(event);
    }

    private void emit(JSONObject event) {
        try {
            event.put("providerId", event.optString("providerId", currentProvider()));
        } catch (Exception ignored) { }
        if (listener != null) {
            try { listener.onEvent(event); } catch (Exception ignored) { }
        }
    }

    private void logOnly(String line) {
        // 适配器已经写过 logcat，这里保留给自检页取用。
        if (listener != null) {
            emit(new LooseJson().put("type", "state").put("state", "adapter_log")
                    .put("line", line));
        }
    }

    private void runOnMain(Runnable action) {
        if (Looper.myLooper() == Looper.getMainLooper()) action.run();
        else main.post(action);
    }

    private JSONObject runOnMainJson(java.util.concurrent.Callable<JSONObject> task) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            try { return task.call(); } catch (Exception e) { return internalError(e); }
        }
        java.util.concurrent.FutureTask<JSONObject> future = new java.util.concurrent.FutureTask<>(task);
        main.post(future);
        try {
            return future.get(8, java.util.concurrent.TimeUnit.SECONDS);
        } catch (Exception e) {
            return internalError(e);
        }
    }

    private JSONObject internalError(Exception e) {
        Log.e(TAG, "internal " + e.getClass().getSimpleName() + ": " + e.getMessage());
        return new LooseJson().put("ok", false).put("code", TtsError.CODE_INTERNAL)
                .put("message", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
    }

    private String cacheKeyHint() {
        if (current == null || current.cacheKey == null) return "";
        return current.cacheKey.length() <= 12 ? current.cacheKey
                : current.cacheKey.substring(0, 12);
    }
}