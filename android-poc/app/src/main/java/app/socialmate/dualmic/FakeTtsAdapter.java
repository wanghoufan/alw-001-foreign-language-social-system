package app.socialmate.dualmic;

import android.content.Context;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 无后端验收用的本地预置音频适配器（默认 provider）。
 *
 * 读取 res/raw/tts_preset_{cn,en}.wav，首次使用时复制到私有 cacheDir/tts-local/，
 * 之后同一段永远读同一个文件：循环 5 次 = 1 次准备 + 5 次磁盘重放，0 次网络。
 *
 * 诚实声明：这是纯音预置，不是人声、不是神经 TTS；结果里必然带 FAKE_PRESET_AUDIO 标记，
 * UI 不得把它当成「音质通过」。
 */
public final class FakeTtsAdapter implements TtsProviderAdapter {
    public static final String PROVIDER_ID = "fake";
    private static final String TAG = "SocialMateTts";
    public static final String WARNING = "FAKE_PRESET_AUDIO";

    private final Context appContext;
    private final File dir;
    private final Logger logger;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final AtomicInteger prepares = new AtomicInteger();

    public FakeTtsAdapter(Context context, Logger logger) {
        this.appContext = context.getApplicationContext();
        this.dir = new File(appContext.getCacheDir(), "tts-local");
        this.logger = logger;
    }

    @Override public String providerId() {
        return PROVIDER_ID;
    }

    /** 累计准备次数（= 合成请求次数；fake 恒为本地文件）。 */
    public int prepareCount() {
        return prepares.get();
    }

    @Override public void prepare(SpeakRequest request, Callback callback) {
        io.execute(() -> {
            try {
                int rawId = SpeakRequest.SEG_CN.equals(request.segmentType)
                        ? R.raw.tts_preset_cn : R.raw.tts_preset_en;
                String name = SpeakRequest.SEG_CN.equals(request.segmentType)
                        ? "tts_preset_cn.wav" : "tts_preset_en.wav";
                File target = new File(dir, name);
                boolean existed = target.isFile() && target.length() > 0;
                if (!existed) {
                    if (!dir.isDirectory() && !dir.mkdirs()) {
                        throw new IllegalStateException("无法创建本地预置目录");
                    }
                    File temp = new File(dir, name + ".tmp");
                    try (InputStream in = appContext.getResources().openRawResource(rawId);
                         FileOutputStream out = new FileOutputStream(temp)) {
                        byte[] buffer = new byte[8192];
                        int read;
                        while ((read = in.read(buffer)) > 0) out.write(buffer, 0, read);
                    }
                    if (!temp.renameTo(target)) throw new IllegalStateException("预置音频落盘失败");
                }
                int count = prepares.incrementAndGet();
                Log.i(TAG, "fake prepare segment=" + request.segmentType + " file=" + name
                        + " cacheHit=" + existed + " prepares=" + count);
                if (logger != null) {
                    logger.log("fake prepare segment=" + request.segmentType + " cacheHit=" + existed
                            + " prepares=" + count);
                }
                callback.onReady(new Prepared(target, "audio/wav", existed, "fake-" + name,
                        "fake-preset", "fake-preset-v1", "local-preset", WARNING));
            } catch (Exception e) {
                Log.e(TAG, "fake prepare failed " + e.getClass().getSimpleName());
                callback.onFailed(new TtsError(TtsError.CODE_INTERNAL,
                        "本地预置音频读取失败：" + e.getClass().getSimpleName(), false));
            }
        });
    }

    @Override public void release() {
        io.shutdownNow();
    }
}
