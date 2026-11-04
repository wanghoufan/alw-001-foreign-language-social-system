package app.socialmate.dualmic;

import android.content.Context;

/**
 * 0.8.2 的旧类名，保留为兼容壳（N05 S4 的调用点仍然 `new TtsController(...)`）。
 *
 * 0.8.3 起所有播放调度都在 {@link TtsPlaybackController}：按 providerId 分派
 * fake / remote / system，并统一循环、变速、停止与错误语义。
 * 这里不再有第二套状态，也不做任何改写——它只是同一个控制器的别名。
 *
 * @deprecated 请直接用 {@link TtsPlaybackController}。
 */
@Deprecated
public final class TtsController extends TtsPlaybackController {
    public TtsController(Context context, Listener listener) {
        super(context, listener);
    }
}
