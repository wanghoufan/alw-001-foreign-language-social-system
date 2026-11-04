package app.socialmate.dualmic;

/**
 * 朗读失败的可读错误（不含令牌、不含服务端绝对路径、不含厂商 Key）。
 *
 * retryable=false 表示重试也没用（未配对、语音包缺失、路由未加载），
 * UI 应给「切换 provider / 去配对」而不是「重试」。
 */
public final class TtsError {
    public static final String CODE_EMPTY_TEXT = "TTS_EMPTY_TEXT";
    public static final String CODE_BAD_SEGMENT = "TTS_BAD_SEGMENT_TYPE";
    public static final String CODE_BAD_RATE = "TTS_BAD_RATE";
    public static final String CODE_NOT_PAIRED = "TTS_NOT_PAIRED";
    public static final String CODE_REMOTE_UNREACHABLE = "TTS_REMOTE_UNREACHABLE";
    public static final String CODE_REMOTE_TIMEOUT = "TTS_REMOTE_TIMEOUT";
    public static final String CODE_REMOTE_ROUTE_MISSING = "TTS_REMOTE_ROUTE_MISSING";
    public static final String CODE_REMOTE_UNAUTHORIZED = "TTS_REMOTE_UNAUTHORIZED";
    public static final String CODE_REMOTE_REJECTED = "TTS_REMOTE_REJECTED";
    public static final String CODE_AUDIO_SHA_MISMATCH = "TTS_AUDIO_SHA_MISMATCH";
    public static final String CODE_AUDIO_EMPTY = "TTS_AUDIO_EMPTY";
    public static final String CODE_FALLBACK_ONLY = "TTS_FALLBACK_ONLY";
    public static final String CODE_SYSTEM_NOT_ENABLED = "TTS_SYSTEM_FALLBACK_NOT_ENABLED";
    public static final String CODE_NO_PENDING_CONSENT = "TTS_NO_PENDING_CONSENT";
    public static final String CODE_PROVIDER_NOT_CONFIGURED = "TTS_PROVIDER_NOT_CONFIGURED";
    public static final String CODE_SYSTEM_FAILED = "TTS_SYSTEM_FAILED";
    public static final String CODE_PLAYBACK_FAILED = "TTS_PLAYBACK_FAILED";
    public static final String CODE_INTERNAL = "TTS_INTERNAL_ERROR";

    public final String code;
    public final String message;
    public final boolean retryable;
    public final int httpStatus;

    public TtsError(String code, String message, boolean retryable, int httpStatus) {
        this.code = code == null ? CODE_INTERNAL : code;
        this.message = message == null ? "" : message;
        this.retryable = retryable;
        this.httpStatus = httpStatus;
    }

    public TtsError(String code, String message, boolean retryable) {
        this(code, message, retryable, 0);
    }

    @Override public String toString() {
        return code + (httpStatus > 0 ? "(HTTP " + httpStatus + ")" : "") + ": " + message;
    }
}
