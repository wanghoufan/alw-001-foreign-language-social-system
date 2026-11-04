package app.socialmate.dualmic;

import java.io.File;

/**
 * 音频文件型 TTS 适配器（换 provider 只换这一层，不动学习页面/播放控制/复盘数据）。
 *
 * 约束：
 * - prepare() 必须异步（网络/磁盘），回调只允许在调用方给的回调线程里触发一次；
 * - 同一段重复播放必须先命中本地缓存，绝不为「循环第 N 次」再发一次合成请求；
 * - providerId 是内部逻辑名（fake/remote），不是厂商名；厂商鉴权只在服务端。
 */
public interface TtsProviderAdapter {

    /** 内部逻辑 provider 名。 */
    String providerId();

    /** 预取一段音频；回调只会触发一次。 */
    void prepare(SpeakRequest request, Callback callback);

    /** 释放缓存/线程之类的资源（不删演员缓存文件）。 */
    void release();

    interface Callback {
        void onReady(Prepared prepared);

        void onFailed(TtsError error);
    }

    /** 适配器只写不落盘的行日志（供 logcat/自检页取证），不含令牌与绝对路径。 */
    interface Logger {
        void log(String line);
    }

    /** 已就绪、可直接交给 MediaPlayer 的音频。 */
    final class Prepared {
        public final File file;
        public final String mimeType;
        public final boolean cacheHit;
        public final String audioId;
        public final String voiceId;
        public final String modelVersion;
        public final String source;
        public final String warning;

        public Prepared(File file, String mimeType, boolean cacheHit, String audioId,
                        String voiceId, String modelVersion, String source, String warning) {
            this.file = file;
            this.mimeType = mimeType == null ? "audio/wav" : mimeType;
            this.cacheHit = cacheHit;
            this.audioId = audioId == null ? "" : audioId;
            this.voiceId = voiceId == null ? "" : voiceId;
            this.modelVersion = modelVersion == null ? "" : modelVersion;
            this.source = source == null ? "" : source;
            this.warning = warning == null ? "" : warning;
        }
    }
}
