package app.socialmate.dualmic;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Android 系统 TextToSpeech 适配器 —— **FALLBACK_ONLY**（用户已判定音质不合格）。
 *
 * 代码来自 N05 S4 的 TtsController（0.8.2），保留原有能力：
 * 中英分别绑定 voice、句级队列、循环、停止、倍速、语言缺失错误码、voice 诊断。
 *
 * 与 0.8.2 的差别只有三处（都是本任务要求的）：
 * 1. 只有用户在设置里手动打开「临时系统声音」后，上层才会把请求派到这里；
 * 2. 远端失败**绝不**回落到这里（回落由用户点击，不静默发生）；
 * 3. 语速/循环由播放控制器传入，本类不再自己持久化 rate/loop。
 */
public final class AndroidSystemTtsAdapter {
    private static final String TAG = "SocialMateTts";
    private static final String PREFS = "socialmate-tts";

    public static final String PROVIDER_ID = "system";
    public static final String FALLBACK_FLAG = "FALLBACK_ONLY";

    private static final int INIT_NONE = 0;
    private static final int INIT_RUNNING = 1;
    private static final int INIT_READY = 2;
    private static final int INIT_FAILED = 3;

    private static final int SENTENCE_PAUSE_MS = 180;
    private static final int BLOCK_LOOP_PAUSE_MS = 450;
    private static final int MAX_SENTENCE_CHARS = 3200;
    /** 冷启动时引擎可能还在 init：这段时间内到达的朗读挂起，就绪后自动播放。 */
    private static final int INIT_WAIT_MS = 4000;

    public interface Listener {
        void onEvent(JSONObject event);
    }

    private static final class Job {
        final String text;
        final String lang;
        final String label;
        final int loopIndex;
        final int loopTotal;
        final boolean blockEnd;

        Job(String text, String lang, String label, int loopIndex, int loopTotal, boolean blockEnd) {
            this.text = text;
            this.lang = lang;
            this.label = label;
            this.loopIndex = loopIndex;
            this.loopTotal = loopTotal;
            this.blockEnd = blockEnd;
        }
    }

    private final Context appContext;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final SharedPreferences prefs;

    private TextToSpeech tts;
    private int initState = INIT_NONE;
    private int initCode = TextToSpeech.ERROR;
    /** 等待引擎就绪的那一次朗读（最多挂起到 INIT_WAIT_MS）。 */
    private Runnable pendingBlock;
    private boolean shutdownRequested;

    private final List<Job> jobs = new ArrayList<>();
    private int cursor = -1;
    private int generation;
    private boolean playing;
    private String currentUtteranceId;
    private Runnable watchdog;

    private float rate = 0.9f;

    public AndroidSystemTtsAdapter(Context context, Listener listener) {
        this.appContext = context.getApplicationContext();
        this.listener = listener;
        this.prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static boolean fallbackOnly() {
        return true;
    }

    /* ------------------------------------------------------------ 初始化 */

    /** 主线程创建/重建引擎；已 shutdown 后再次调用会重新 init。 */
    public void ensureReady() {
        runOnMain(() -> {
            if (shutdownRequested) return;
            if (tts != null && (initState == INIT_READY || initState == INIT_RUNNING)) return;
            if (tts != null) {
                try { tts.shutdown(); } catch (Exception ignored) { }
                tts = null;
            }
            initState = INIT_RUNNING;
            initCode = TextToSpeech.ERROR;
            TextToSpeech.OnInitListener onInit = code -> main.post(() -> {
                initCode = code;
                if (code == TextToSpeech.SUCCESS && tts != null) {
                    initState = INIT_READY;
                    installProgressListener();
                    try { tts.setSpeechRate(rate); } catch (Exception ignored) { }
                    Log.i(TAG, "system init READY engine=" + enginePackage()
                            + " engineLabel=" + engineLabel() + " voices=" + safeVoices().size()
                            + " fallbackOnly=" + FALLBACK_FLAG);
                    emit(event("init").put("engine", enginePackage()).put("engineLabel", engineLabel())
                            .put("voices", safeVoices().size()).put("rate", (double) rate)
                            .put("fallbackOnly", FALLBACK_FLAG));
                    Runnable queued = pendingBlock;
                    pendingBlock = null;
                    if (queued != null) {
                        Log.i(TAG, "system init READY，播放挂起的那一次朗读");
                        queued.run();
                    }
                } else {
                    initState = INIT_FAILED;
                    pendingBlock = null;
                    Log.e(TAG, "system init FAILED code=" + code + " engine=" + enginePackage());
                    emit(errorEvent(TtsError.CODE_SYSTEM_FAILED, "系统 TextToSpeech 初始化失败（code=" + code
                            + "）。请更换 TTS 引擎或安装语音包。", null, null));
                }
            });
            try {
                tts = new TextToSpeech(appContext, onInit);
            } catch (Exception e) {
                initState = INIT_FAILED;
                emit(errorEvent(TtsError.CODE_SYSTEM_FAILED,
                        "没有可用的系统 TTS 引擎：" + e.getMessage(), null, null));
            }
        });
    }

    public boolean isReady() {
        return initState == INIT_READY && tts != null;
    }

    /* ------------------------------------------------------------ 对外 API */

    /** 一段（中文/英A/英B/表达）按句排队；loop=2 表示整段读两遍后自停。 */
    public LooseJson speakBlock(String text, String lang, int loop, String label, float rate) {
        this.rate = rate;
        return onMain(() -> {
            String normalized = normalizeLang(lang);
            if (normalized == null) {
                emit(errorEvent(TtsError.CODE_BAD_SEGMENT, "不支持的语言：" + lang, lang, null));
                return errorJson(TtsError.CODE_BAD_SEGMENT, "不支持的语言：" + lang, lang, null);
            }
            if (text == null || text.trim().isEmpty()) {
                emit(errorEvent(TtsError.CODE_EMPTY_TEXT, "朗读文本为空", lang, null));
                return errorJson(TtsError.CODE_EMPTY_TEXT, "朗读文本为空", lang, null);
            }
            if (!readyForSpeech()) {
                // 冷启动 1 秒内容易命中这里：引擎还在初始化时不报错，挂起这一次，
                // 就绪后自动播放；超过 INIT_WAIT_MS 仍未就绪才按原样报错。
                if (initState == INIT_RUNNING) {
                    pendingBlock = () -> speakBlock(text, lang, loop, label, rate);
                    main.postDelayed(() -> {
                        if (pendingBlock == null) return;
                        pendingBlock = null;
                        LooseJson late = initNotReadyJson(lang);
                        emit(errorEvent(late.optString("code"), late.optString("message"), lang, null));
                    }, INIT_WAIT_MS);
                    emit(event("system_queued").put("reason", "initializing"));
                    return new LooseJson().put("ok", true).put("code", "TTS_INITIALIZING_QUEUED")
                            .put("message", "本机语音正在初始化，就绪后自动朗读").put("lang", normalized)
                            .put("providerId", PROVIDER_ID).put("fallbackOnly", true).put("loop", loop);
                }
                LooseJson pending = initNotReadyJson(lang);
                emit(errorEvent(pending.optString("code"), pending.optString("message"), lang, null));
                return pending;
            }

            String missing = null;
            Voice voice = pickVoice(normalized);
            if (voice == null) {
                int avail = availability(normalized);
                if (avail < TextToSpeech.LANG_AVAILABLE
                        || (!"zh".equals(normalized) && !"en".equals(normalized))) {
                    missing = localeFor(normalized).toLanguageTag();
                    String message = "缺少 " + missing + " 语音包。请到系统设置安装语音包，或更换 TTS 引擎。";
                    emit(errorEvent(TtsError.CODE_SYSTEM_FAILED, message, lang, missing));
                    return errorJson("TTS_LANG_UNAVAILABLE", message, lang, missing);
                }
            }
            int repeats = clampLoop(loop <= 0 ? 1 : loop);
            List<Job> next = new ArrayList<>();
            List<String> sentences = splitSentences(text);
            for (int round = 0; round < repeats; round++) {
                for (int i = 0; i < sentences.size(); i++) {
                    boolean blockEnd = (i == sentences.size() - 1);
                    next.add(new Job(sentences.get(i), normalized, label,
                            round + 1, repeats, blockEnd));
                }
            }
            applyVoice(normalized, voice);
            startQueue(next);
            Log.i(TAG, "system speak lang=" + normalized + " voice=" + describeVoice(voice)
                    + " rate=" + rate + " loop=" + repeats + " sentences=" + sentences.size()
                    + " chars=" + text.length() + " fallbackOnly=" + FALLBACK_FLAG);
            return okJson().put("lang", normalized).put("voice", describeVoice(voice))
                    .put("locale", localeFor(normalized).toLanguageTag())
                    .put("rate", (double) rate).put("loop", repeats)
                    .put("sentences", sentences.size()).put("label", label)
                    .put("providerId", PROVIDER_ID).put("fallbackOnly", true);
        });
    }

    public LooseJson stop() {
        return onMain(() -> {
            int stoppedAt = cursor;
            stopQueue();
            emit(event("stopped").put("index", stoppedAt).put("total", jobs.size()));
            return okJson().put("state", "stopped");
        });
    }

    public void setRate(float value) {
        rate = value;
        runOnMain(() -> {
            if (tts != null) {
                try { tts.setSpeechRate(rate); } catch (Exception ignored) { }
            }
        });
    }

    public LooseJson status() {
        return onMain(() -> {
            LooseJson out = okJson()
                    .put("providerId", PROVIDER_ID)
                    .put("fallbackOnly", true)
                    .put("state", initState == INIT_READY ? "ready"
                            : initState == INIT_RUNNING ? "initializing"
                            : initState == INIT_FAILED ? "failed" : "idle")
                    .put("initCode", initCode)
                    .put("engine", enginePackage()).put("engineLabel", engineLabel())
                    .put("defaultEngine", enginePackage())
                    .put("rate", (double) rate)
                    .put("playing", playing).put("index", cursor)
                    .put("total", jobs.size())
                    .put("zhVoice", describeVoice(pickVoice("zh")))
                    .put("enVoice", describeVoice(pickVoice("en")))
                    .put("zhAvailable", availability("zh") >= TextToSpeech.LANG_AVAILABLE)
                    .put("enAvailable", availability("en") >= TextToSpeech.LANG_AVAILABLE)
                    .put("voices", safeVoices().size())
                    .put("flag", FALLBACK_FLAG);
            try {
                JSONArray engines = new JSONArray();
                for (TextToSpeech.EngineInfo info : safeEngines()) {
                    engines.put(new JSONObject().put("name", info.name)
                            .put("label", info.label));
                }
                out.put("engines", engines);
            } catch (Exception ignored) { }
            return out;
        });
    }

    public LooseJson voices() {
        return onMain(() -> {
            LooseJson out = okJson();
            JSONArray array = new JSONArray();
            for (Voice voice : safeVoices()) {
                try {
                    Locale locale = voice.getLocale();
                    array.put(new JSONObject()
                            .put("name", voice.getName())
                            .put("locale", locale.toLanguageTag())
                            .put("language", locale.getLanguage())
                            .put("country", locale.getCountry())
                            .put("quality", voice.getQuality())
                            .put("latency", voice.getLatency())
                            .put("network", voice.isNetworkConnectionRequired())
                            .put("features", String.valueOf(voice.getFeatures())));
                } catch (Exception ignored) { }
            }
            out.put("voices", array);
            out.put("zhAvailable", availability("zh") >= TextToSpeech.LANG_AVAILABLE);
            out.put("enAvailable", availability("en") >= TextToSpeech.LANG_AVAILABLE);
            return out;
        });
    }

    /** 前端可指定具体 voice；语言不匹配直接拒绝，避免英文声线读中文。 */
    public LooseJson setVoice(String lang, String voiceName) {
        return onMain(() -> {
            String normalized = normalizeLang(lang);
            if (normalized == null) {
                return errorJson(TtsError.CODE_BAD_SEGMENT, "不支持的语言：" + lang, lang, null);
            }
            Voice chosen = findVoiceByName(voiceName);
            if (chosen == null) {
                return errorJson("TTS_VOICE_REJECTED", "找不到 voice：" + voiceName, lang, null);
            }
            if (!languageOf(chosen).equals(baseLanguage(normalized))) {
                return errorJson("TTS_VOICE_REJECTED",
                        "voice " + voiceName + " 的语言 " + chosen.getLocale().toLanguageTag()
                                + " 与请求的 " + normalized + " 不一致", lang, null);
            }
            int result = applyVoice(normalized, chosen);
            prefs.edit().putString("voice_" + baseLanguage(normalized), chosen.getName()).apply();
            return result == TextToSpeech.SUCCESS
                    ? okJson().put("lang", normalized).put("voice", chosen.getName())
                    : errorJson("TTS_VOICE_REJECTED", "引擎拒绝该 voice", lang, null);
        });
    }

    public LooseJson diagnose(String lang) {
        return onMain(() -> {
            String normalized = normalizeLang(lang);
            String tag = normalized == null ? (lang == null ? "zh-CN" : lang) : localeFor(normalized).toLanguageTag();
            Locale locale = normalized == null ? Locale.forLanguageTag(tag) : localeFor(normalized);
            int avail = tts == null ? TextToSpeech.LANG_NOT_SUPPORTED : tts.isLanguageAvailable(locale);
            Voice voice = normalized == null ? null : pickVoice(normalized);
            LooseJson out = okJson().put("lang", tag).put("availableCode", avail)
                    .put("available", avail >= TextToSpeech.LANG_AVAILABLE)
                    .put("voice", describeVoice(voice))
                    .put("engine", enginePackage()).put("engineLabel", engineLabel())
                    .put("providerId", PROVIDER_ID).put("fallbackOnly", true);
            if (avail < TextToSpeech.LANG_AVAILABLE) {
                out.put("ok", false).put("code", "TTS_LANG_UNAVAILABLE").put("missingLanguage", tag)
                        .put("message", "缺少 " + tag + " 语音包。请到系统设置安装语音包，或更换 TTS 引擎。");
            }
            return out;
        });
    }

    /* -------------------------------------------------------- 生命周期 */

    public void onStop() {
        runOnMain(() -> {
            if (playing || !jobs.isEmpty()) {
                stopQueue();
                emit(event("stopped").put("reason", "onStop"));
            } else if (tts != null) {
                try { tts.stop(); } catch (Exception ignored) { }
            }
        });
    }

    public void shutdown() {
        runOnMain(() -> {
            shutdownRequested = true;
            stopQueue();
            if (tts != null) {
                try { tts.stop(); } catch (Exception ignored) { }
                try { tts.shutdown(); } catch (Exception ignored) { }
                tts = null;
            }
            initState = INIT_NONE;
            Log.i(TAG, "system shutdown");
        });
    }

    /** 允许同一实例在 shutdown 后重新初始化（自检页重复进入时使用）。 */
    public void reopen() {
        runOnMain(() -> {
            shutdownRequested = false;
            ensureReady();
        });
    }

    /* ---------------------------------------------------------- 内部实现 */

    private boolean readyForSpeech() {
        if (initState == INIT_READY && tts != null) return true;
        if (initState == INIT_NONE || initState == INIT_FAILED) ensureReady();
        return false;
    }

    private LooseJson initNotReadyJson(String lang) {
        return errorJson(initState == INIT_FAILED ? TtsError.CODE_SYSTEM_FAILED
                        : "TTS_INITIALIZING",
                initState == INIT_FAILED
                        ? "系统 TTS 初始化失败。请更换 TTS 引擎或安装语音包。"
                        : "系统 TTS 正在初始化，请稍后再试。", lang, null);
    }

    private void startQueue(List<Job> next) {
        stopQueue();
        jobs.clear();
        jobs.addAll(next);
        cursor = -1;
        generation++;
        playing = true;
        emit(event("queue").put("total", jobs.size()).put("rate", (double) rate)
                .put("providerId", PROVIDER_ID));
        speakNext(generation, 0);
    }

    private void speakNext(int gen, int delayMs) {
        main.postDelayed(() -> {
            if (gen != generation || !playing) return;
            cursor++;
            if (cursor >= jobs.size()) {
                finishQueue();
                return;
            }
            Job job = jobs.get(cursor);
            Voice voice = pickVoice(job.lang);
            int voiceResult = applyVoice(job.lang, voice);
            if (voiceResult < 0) {
                emit(errorEvent(TtsError.CODE_SYSTEM_FAILED,
                        "缺少 " + localeFor(job.lang).toLanguageTag()
                                + " 语音包。请到系统设置安装语音包，或更换 TTS 引擎。",
                        job.lang, localeFor(job.lang).toLanguageTag()));
                finishQueue();
                return;
            }
            try { tts.setSpeechRate(rate); } catch (Exception ignored) { }
            String id = "smtts-" + gen + "-" + cursor + "-" + System.nanoTime();
            currentUtteranceId = id;
            Bundle params = new Bundle();
            params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f);
            int result = tts.speak(job.text, TextToSpeech.QUEUE_FLUSH, params, id);
            if (result != TextToSpeech.SUCCESS) {
                Log.e(TAG, "system speak rejected result=" + result + " lang=" + job.lang);
                currentUtteranceId = null;
                emit(errorEvent(TtsError.CODE_SYSTEM_FAILED, "TTS 引擎拒绝朗读（" + result + "）",
                        job.lang, null));
                finishQueue();
                return;
            }
            Log.i(TAG, "system utterance index=" + cursor + "/" + jobs.size() + " lang=" + job.lang
                    + " voice=" + describeVoice(voice) + " loop=" + job.loopIndex + "/" + job.loopTotal
                    + " text=" + preview(job.text));
            emit(event("started").put("index", cursor).put("total", jobs.size())
                    .put("lang", job.lang).put("voice", describeVoice(voice))
                    .put("loopIndex", job.loopIndex).put("loopTotal", job.loopTotal)
                    .put("label", job.label).put("text", preview(job.text))
                    .put("providerId", PROVIDER_ID));
            armWatchdog(gen, id, 1200L + job.text.length() * 220L);
        }, Math.max(0, delayMs));
    }

    private void armWatchdog(int gen, String id, long timeoutMs) {
        cancelWatchdog();
        watchdog = () -> {
            if (gen != generation || !playing) return;
            if (id.equals(currentUtteranceId)) {
                Log.w(TAG, "onDone timeout voice engine silent, advancing id=" + id);
                currentUtteranceId = null;
                advance(gen);
            }
        };
        main.postDelayed(watchdog, timeoutMs);
    }

    private void cancelWatchdog() {
        if (watchdog != null) {
            main.removeCallbacks(watchdog);
            watchdog = null;
        }
    }

    private void advance(int gen) {
        if (gen != generation || !playing) return;
        cancelWatchdog();
        int finishedIndex = cursor;
        Job finished = cursor >= 0 && cursor < jobs.size() ? jobs.get(cursor) : null;
        emit(event("sentence_done").put("index", finishedIndex).put("total", jobs.size())
                .put("lang", finished == null ? null : finished.lang)
                .put("loopIndex", finished == null ? 0 : finished.loopIndex)
                .put("loopTotal", finished == null ? 0 : finished.loopTotal));
        int pause = SENTENCE_PAUSE_MS;
        if (finished != null && finished.blockEnd) pause = BLOCK_LOOP_PAUSE_MS;
        speakNext(gen, pause);
    }

    private void finishQueue() {
        cancelWatchdog();
        playing = false;
        currentUtteranceId = null;
        cursor = jobs.size();
        emit(event("finished").put("total", jobs.size()).put("providerId", PROVIDER_ID));
        Log.i(TAG, "system queue finished total=" + jobs.size());
    }

    private void stopQueue() {
        pendingBlock = null;
        generation++;
        playing = false;
        cancelWatchdog();
        currentUtteranceId = null;
        cursor = jobs.isEmpty() ? -1 : cursor;
        jobs.clear();
        if (tts != null) {
            try { tts.stop(); } catch (Exception ignored) { }
        }
    }

    private final UtteranceProgressListener progressListener = new UtteranceProgressListener() {
        @Override public void onStart(String utteranceId) {
            main.post(() -> { });
        }

        @Override public void onDone(String utteranceId) {
            main.post(() -> {
                if (!playing || utteranceId == null || !utteranceId.equals(currentUtteranceId)) return;
                currentUtteranceId = null;
                advance(generation);
            });
        }

        @Override public void onError(String utteranceId) {
            main.post(() -> {
                if (!playing || utteranceId == null || !utteranceId.equals(currentUtteranceId)) return;
                Job failed = cursor >= 0 && cursor < jobs.size() ? jobs.get(cursor) : null;
                currentUtteranceId = null;
                Log.e(TAG, "system onError id=" + utteranceId + " lang=" + (failed == null ? "?" : failed.lang));
                emit(errorEvent(TtsError.CODE_SYSTEM_FAILED, "该句朗读失败（引擎返回错误）",
                        failed == null ? null : failed.lang, null));
                advance(generation);
            });
        }

        @Override public void onError(String utteranceId, int errorCode) {
            main.post(() -> {
                if (!playing || utteranceId == null || !utteranceId.equals(currentUtteranceId)) return;
                Job failed = cursor >= 0 && cursor < jobs.size() ? jobs.get(cursor) : null;
                currentUtteranceId = null;
                Log.e(TAG, "system onError code=" + errorCode + " lang=" + (failed == null ? "?" : failed.lang));
                emit(errorEvent(TtsError.CODE_SYSTEM_FAILED, "该句朗读失败（错误码 " + errorCode + "）",
                        failed == null ? null : failed.lang, null));
                advance(generation);
            });
        }
    };

    private void installProgressListener() {
        if (tts != null) tts.setOnUtteranceProgressListener(progressListener);
    }

    /* -------------------------------------------------------- voice 选择 */

    private static String normalizeLang(String lang) {
        if (lang == null) return null;
        String value = lang.trim().replace('_', '-');
        if (value.isEmpty()) return null;
        String lower = value.toLowerCase(Locale.US);
        if (lower.startsWith("zh") || lower.startsWith("cmn") || lower.startsWith("yue")) return "zh";
        if (lower.startsWith("en")) return "en";
        return value;
    }

    private static String baseLanguage(String normalized) {
        if ("zh".equals(normalized)) return "zh";
        if ("en".equals(normalized)) return "en";
        return Locale.forLanguageTag(normalized).getLanguage();
    }

    private static Locale localeFor(String normalized) {
        if ("zh".equals(normalized)) return Locale.SIMPLIFIED_CHINESE;
        if ("en".equals(normalized)) return Locale.US;
        return Locale.forLanguageTag(normalized);
    }

    private static String languageOf(Voice voice) {
        return voice == null || voice.getLocale() == null ? "" : voice.getLocale().getLanguage();
    }

    private int availability(String normalized) {
        if (tts == null) return TextToSpeech.LANG_NOT_SUPPORTED;
        try {
            return tts.isLanguageAvailable(localeFor(normalized));
        } catch (Exception e) {
            return TextToSpeech.LANG_NOT_SUPPORTED;
        }
    }

    private Set<Voice> safeVoices() {
        try {
            Set<Voice> voices = tts == null ? null : tts.getVoices();
            return voices == null ? java.util.Collections.emptySet() : voices;
        } catch (Exception e) {
            return java.util.Collections.emptySet();
        }
    }

    /**
     * 中英分开选 voice：
     * - zh：只接受 locale.language=zh；
     * - en：只接受 locale.language=en，优先 en-US，其次 en-GB，最后任意 en。
     * 永不把 en voice 用于中文。
     */
    private Voice pickVoice(String normalized) {
        String wantedLanguage = baseLanguage(normalized);
        String stored = prefs.getString("voice_" + wantedLanguage, "");
        Set<Voice> voices = safeVoices();
        if (stored != null && !stored.isEmpty()) {
            Voice saved = findVoiceByName(stored);
            if (saved != null && languageOf(saved).equals(wantedLanguage)) return saved;
        }
        if (voices.isEmpty()) return null;
        Voice best = null;
        int bestScore = -1;
        for (Voice voice : voices) {
            String language = languageOf(voice);
            if (!wantedLanguage.equals(language)) continue;
            int score;
            if ("zh".equals(wantedLanguage)) {
                score = "CN".equalsIgnoreCase(voice.getLocale().getCountry()) ? 100
                        : "SG".equalsIgnoreCase(voice.getLocale().getCountry()) ? 80 : 60;
                if (voice.isNetworkConnectionRequired()) score -= 25;
            } else {
                String country = voice.getLocale().getCountry();
                score = "US".equalsIgnoreCase(country) ? 100
                        : "GB".equalsIgnoreCase(country) ? 90
                        : "AU".equalsIgnoreCase(country) ? 70 : 60;
                if (voice.isNetworkConnectionRequired()) score -= 25;
            }
            if (score > bestScore) {
                bestScore = score;
                best = voice;
            }
        }
        return best;
    }

    private Voice findVoiceByName(String name) {
        if (name == null || name.isEmpty()) return null;
        for (Voice voice : safeVoices()) {
            if (name.equals(voice.getName())) return voice;
        }
        return null;
    }

    /** 返回 SUCCESS；语言不可用返回 -1。 */
    private int applyVoice(String normalized, Voice voice) {
        if (tts == null) return -1;
        try {
            if (voice != null) {
                int result = tts.setVoice(voice);
                if (result == TextToSpeech.SUCCESS) return result;
                Log.w(TAG, "setVoice rejected " + voice.getName() + " result=" + result);
            }
            int language = tts.setLanguage(localeFor(normalized));
            if (language >= TextToSpeech.LANG_AVAILABLE) return TextToSpeech.SUCCESS;
            if (language == TextToSpeech.LANG_MISSING_DATA
                    || language == TextToSpeech.LANG_NOT_SUPPORTED) return -1;
            return language;
        } catch (Exception e) {
            Log.e(TAG, "applyVoice failed lang=" + normalized + " " + e.getMessage());
            return -1;
        }
    }

    private static String describeVoice(Voice voice) {
        if (voice == null) return "(engine-default)";
        try {
            return voice.getName() + " [" + voice.getLocale().toLanguageTag() + "]";
        } catch (Exception e) {
            return voice.getName();
        }
    }

    private String enginePackage() {
        try { return tts == null ? "UNKNOWN" : tts.getDefaultEngine(); }
        catch (Exception e) { return "UNKNOWN"; }
    }

    private String engineLabel() {
        try {
            String name = enginePackage();
            for (TextToSpeech.EngineInfo info : safeEngines()) {
                if (info.name.equals(name)) return info.label;
            }
        } catch (Exception ignored) { }
        return enginePackage();
    }

    private List<TextToSpeech.EngineInfo> safeEngines() {
        try { return tts == null ? java.util.Collections.emptyList() : tts.getEngines(); }
        catch (Exception e) { return java.util.Collections.emptyList(); }
    }

    /* ------------------------------------------------------------ 文案处理 */

    private static final java.util.regex.Pattern SENTENCE_BREAK =
            java.util.regex.Pattern.compile("(?<=[。！？!?；;])|(?<=\\.)\\s+");

    private static List<String> splitSentences(String text) {
        String flat = text.replace('\r', ' ').replace('\n', ' ').trim();
        List<String> result = new ArrayList<>();
        if (flat.isEmpty()) return result;
        StringBuilder buffer = new StringBuilder();
        for (String piece : SENTENCE_BREAK.split(flat)) {
            String value = piece.trim();
            if (value.isEmpty()) continue;
            if (buffer.length() + value.length() > MAX_SENTENCE_CHARS) {
                if (buffer.length() > 0) result.add(buffer.toString().trim());
                buffer.setLength(0);
            }
            if (buffer.length() > 0) buffer.append(' ');
            buffer.append(value);
            if (buffer.length() >= 160) {
                result.add(buffer.toString().trim());
                buffer.setLength(0);
            }
        }
        if (buffer.length() > 0) result.add(buffer.toString().trim());
        if (result.isEmpty()) result.add(flat);
        return result;
    }

    private static String preview(String text) {
        if (text == null) return "";
        return text.length() <= 40 ? text : text.substring(0, 40) + "…";
    }

    private static int clampLoop(int value) {
        if (value <= 0) return 1;
        return Math.min(value, 10);
    }

    /* ------------------------------------------------------------ JSON/线程 */

    private LooseJson event(String state) {
        return new LooseJson().put("type", "state").put("state", state)
                .put("providerId", PROVIDER_ID).put("fallbackOnly", true);
    }

    private LooseJson okJson() {
        return new LooseJson().put("ok", true).put("code", "OK");
    }

    private LooseJson errorJson(String code, String message, String lang, String missing) {
        return new LooseJson().put("ok", false).put("code", code).put("message", message)
                .put("lang", lang == null ? JSONObject.NULL : lang)
                .put("missingLanguage", missing == null ? JSONObject.NULL : missing)
                .put("providerId", PROVIDER_ID).put("fallbackOnly", true);
    }

    private LooseJson errorEvent(String code, String message, String lang, String missing) {
        return errorJson(code, message, lang, missing)
                .put("type", "state").put("state", "error")
                .put("rate", (double) rate);
    }

    private void emit(LooseJson event) {
        try {
            event.put("type", event.optString("type", "state"));
            event.put("playing", playing);
            event.put("index", cursor);
            event.put("total", jobs.size());
            if (!event.has("rate")) event.put("rate", (double) rate);
        } catch (Exception ignored) { }
        if (listener != null) {
            try { listener.onEvent(event); } catch (Exception ignored) { }
        }
    }

    private void runOnMain(Runnable action) {
        if (Looper.myLooper() == Looper.getMainLooper()) action.run();
        else main.post(action);
    }

    private LooseJson onMain(java.util.concurrent.Callable<LooseJson> task) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            try { return task.call(); } catch (Exception e) { return internalError(e); }
        }
        java.util.concurrent.FutureTask<LooseJson> future = new java.util.concurrent.FutureTask<>(task);
        main.post(future);
        try {
            return future.get(8, java.util.concurrent.TimeUnit.SECONDS);
        } catch (Exception e) {
            return internalError(e);
        }
    }

    private LooseJson internalError(Exception e) {
        Log.e(TAG, "system internal " + e.getClass().getSimpleName() + ": " + e.getMessage());
        return errorJson(TtsError.CODE_INTERNAL,
                e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage(), null, null);
    }
}
