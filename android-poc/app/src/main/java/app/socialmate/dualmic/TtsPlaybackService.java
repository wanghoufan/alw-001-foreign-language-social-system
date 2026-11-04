package app.socialmate.dualmic;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import org.json.JSONObject;

import java.lang.ref.WeakReference;

/**
 * N05 V1.4｜朗读前台服务（mediaPlayback）。
 *
 * 为什么要有它：V1.3 的队列活在网页 JS 里，Activity 一 onStop（熄屏/Home）整条队列就断。
 * 现在队列所有权搬到本服务：{@link TtsQueueRunner} 驱动 {@link TtsPlaybackController}，
 * Activity 只负责显示与下发命令，熄屏/切后台都不再中断。
 *
 * 硬约束（对应 ACCEPTANCE BG01–BG05）：
 *   1. 只用 mediaPlayback 前台服务，不靠屏幕常亮、不做开机自启、不后台录音；
 *   2. 通知栏只显示「第 x/y 轮 · 第 i/N 项」，绝不出现原文/地点/人名；
 *   3. 音频焦点丢失、耳机拔出、蓝牙断连 → 暂停并等用户手动继续，绝不自动恢复；
 *   4. 队列结束/停止立刻退出前台并 stopSelf，不常驻。
 */
public class TtsPlaybackService extends Service {
    private static final String TAG = "SocialMateTtsSvc";

    static final String ACTION_START_QUEUE = "app.socialmate.dualmic.TTS_START_QUEUE";
    static final String ACTION_PAUSE = "app.socialmate.dualmic.TTS_PAUSE";
    static final String ACTION_RESUME = "app.socialmate.dualmic.TTS_RESUME";
    static final String ACTION_STOP = "app.socialmate.dualmic.TTS_STOP";
    static final String EXTRA_PLAN = "plan";
    static final String EXTRA_ORIGIN = "origin";

    private static final String CHANNEL_ID = "socialmate-tts-playback";
    private static final int NOTIFICATION_ID = 4711;

    private static TtsPlaybackController controller;
    private static TtsQueueRunner runner;
    private static WeakReference<TtsPlaybackService> instance = new WeakReference<>(null);
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static volatile Listener uiListener;

    /** Activity 侧监听：服务把队列/控制器事件原样转给页面。 */
    public interface Listener {
        void onTtsEvent(JSONObject event);
    }

    private NotificationManager notificationManager;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private MediaSession mediaSession;
    private PowerManager.WakeLock wakeLock;
    private NoisyReceiver noisyReceiver;
    private boolean foregroundStarted;

    /**
     * 进程内唯一的播放控制器。Activity 在 onCreate 里也会调它，
     * 这样「页面按钮的即时朗读」和「后台队列」共用同一台引擎，绝不会两个队列同时出声。
     */
    static synchronized TtsPlaybackController controller(Context context) {
        if (controller == null) {
            controller = new TtsPlaybackController(context.getApplicationContext(),
                    event -> onControllerEventFromController(event));
        }
        return controller;
    }

    static synchronized TtsQueueRunner runner(Context context) {
        if (runner == null) {
            controller(context);
            // 时间线落在应用私有目录：run-as 可拉取，不上传、不进公开静态路径。
            java.io.File timeline = new java.io.File(context.getApplicationContext().getFilesDir(),
                    "tts-queue-timeline.jsonl");
            runner = new TtsQueueRunner(controller, new TtsQueueRunner.Callback() {
                @Override public void onQueueEvent(JSONObject event) {
                    dispatch(event);
                    TtsPlaybackService svc = instance.get();
                    if (svc != null) svc.refreshNotification();
                }

                @Override public void onQueueIdle(String reason) {
                    TtsPlaybackService svc = instance.get();
                    if (svc != null) svc.teardown(reason);
                }
            }, timeline);
        }
        return runner;
    }

    static synchronized boolean hasActiveQueue() {
        return runner != null && runner.isRunning();
    }

    static synchronized JSONObject queueState() {
        if (runner == null) {
            return new LooseJson().put("ok", true).put("code", "OK").put("running", false);
        }
        JSONObject out = runner.state();
        try {
            out.put("ok", true).put("code", "OK");
        } catch (Exception ignored) {
        }
        return out;
    }

    /** 网页下发播放计划；从这里开始队列归服务所有。 */
    static JSONObject startQueue(Context context, String planJson, String origin) {
        TtsQueueRunner queue = runner(context);
        TtsPlaybackService svc = instance.get();
        if (svc == null) {
            // Activity 在后台时也会有这一支：先把服务拉起来，计划缓存到 EXTRA 里。
            Intent intent = new Intent(context, TtsPlaybackService.class)
                    .setAction(ACTION_START_QUEUE)
                    .putExtra(EXTRA_PLAN, planJson)
                    .putExtra(EXTRA_ORIGIN, origin == null ? "" : origin);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
            else context.startService(intent);
            return new LooseJson().put("ok", true).put("code", "QUEUE_STARTING")
                    .put("detail", "前台服务启动中，队列将在服务就绪后开始");
        }
        JSONObject result = queue.start(planJson, origin);
        if (result.optBoolean("ok", false)) {
            svc.enterForeground();
        }
        return result;
    }

    static JSONObject control(Context context, String action) {
        TtsQueueRunner queue = runner(context);
        if ("pause".equals(action)) {
            if (!queue.pause("ui")) {
                return new LooseJson().put("ok", false).put("code", "TTS_NOT_PLAYING")
                        .put("message", "当前没有正在播放的队列");
            }
            TtsPlaybackService svc = instance.get();
            if (svc != null) svc.refreshNotification();
            return new LooseJson().put("ok", true).put("code", "OK").put("state", "paused");
        }
        if ("resume".equals(action)) {
            if (!queue.resume("ui")) {
                return new LooseJson().put("ok", false).put("code", "TTS_NOT_PAUSED")
                        .put("message", "当前没有已暂停的队列");
            }
            TtsPlaybackService svc = instance.get();
            if (svc != null) svc.refreshNotification();
            return new LooseJson().put("ok", true).put("code", "OK").put("state", "playing");
        }
        if ("stop".equals(action)) {
            queue.stop("ui");
            return new LooseJson().put("ok", true).put("code", "OK").put("state", "stopped");
        }
        return new LooseJson().put("ok", false).put("code", "TTS_BAD_ACTION")
                .put("message", "未知队列命令：" + action);
    }

    static void setUiListener(Listener listener) {
        uiListener = listener;
    }

    static void clearUiListener(Listener listener) {
        // 传 null 表示无条件清除（Activity onStop/onDestroy 用），否则只在同一监听者时才清。
        if (listener == null || uiListener == listener) uiListener = null;
    }

    private static void dispatch(JSONObject event) {
        if (event == null) return;
        Listener listener = uiListener;
        if (listener == null) return;
        try {
            listener.onTtsEvent(event);
        } catch (Exception e) {
            Log.w(TAG, "ui listener failed: " + e.getMessage());
        }
    }

    private static void onControllerEventFromController(JSONObject event) {
        if (event == null) return;
        TtsQueueRunner queue = runner;
        if (queue != null) queue.onControllerEvent(event);
        dispatch(event);
        TtsPlaybackService svc = instance.get();
        if (svc != null) svc.refreshNotification();
    }

    /* ------------------------------------------------------------ 生命周期 */

    @Override public void onCreate() {
        super.onCreate();
        instance = new WeakReference<>(this);
        notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        createChannel();
        controller(this);
        runner(this);
        noisyReceiver = new NoisyReceiver(this::pauseFromSystem);
        registerReceiver(noisyReceiver, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
        Log.i(TAG, "service created");
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_START_QUEUE.equals(action)) {
            String plan = intent.getStringExtra(EXTRA_PLAN);
            enterForeground();
            JSONObject result = runner(this).start(plan == null ? "{}" : plan,
                    intent.getStringExtra(EXTRA_ORIGIN));
            if (!result.optBoolean("ok", false)) {
                Log.w(TAG, "queue rejected: " + result.optString("code"));
                dispatch(result);
                teardown("start_failed");
            }
            return START_NOT_STICKY;
        }
        if (ACTION_PAUSE.equals(action)) {
            pauseFromSystem("notification");
            return START_NOT_STICKY;
        }
        if (ACTION_RESUME.equals(action)) {
            if (runner(this).resume("notification")) refreshNotification();
            return START_NOT_STICKY;
        }
        if (ACTION_STOP.equals(action)) {
            runner(this).stop("notification");
            return START_NOT_STICKY;
        }
        // 被系统重建时没有计划可恢复：直接收尾，不假装还在播。
        if (!runner(this).isRunning()) teardown("restarted_empty");
        else enterForeground();
        return START_NOT_STICKY;
    }

    @Override public IBinder onBind(Intent intent) {
        return null;
    }

    @Override public void onDestroy() {
        releaseWakeLock();
        abandonFocus();
        releaseMediaSession();
        try {
            if (noisyReceiver != null) unregisterReceiver(noisyReceiver);
        } catch (Exception ignored) {
        }
        if (foregroundStarted) {
            stopForeground(true);
            foregroundStarted = false;
        }
        instance = new WeakReference<>(null);
        Log.i(TAG, "service destroyed");
        super.onDestroy();
    }

    /* ---------------------------------------------------------------- 前台 */

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || notificationManager == null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID,
                "朗读播放", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("锁屏/后台继续播放学习队列时的控制条");
        channel.setShowBadge(false);
        channel.setSound(null, null);
        channel.enableVibration(false);
        notificationManager.createNotificationChannel(channel);
    }

    private void enterForeground() {
        if (foregroundStarted) {
            refreshNotification();
            return;
        }
        Notification notification = buildNotification();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            foregroundStarted = true;
        } catch (Exception e) {
            Log.e(TAG, "startForeground failed: " + e.getMessage());
            return;
        }
        acquireWakeLock();
        requestFocus();
        ensureMediaSession();
        Log.i(TAG, "foreground started type=mediaPlayback");
    }

    private void refreshNotification() {
        if (!foregroundStarted || notificationManager == null) return;
        try {
            notificationManager.notify(NOTIFICATION_ID, buildNotification());
            updateMediaSessionState();
        } catch (Exception ignored) {
        }
    }

    /** 通知文案只放轮次与序号：绝不出现原文、地点或人名。 */
    private Notification buildNotification() {
        TtsQueueRunner queue = runner(this);
        boolean paused = queue.isPaused();
        String progress = queue.progressText();
        String title = paused ? "朗读已暂停" : "正在朗读";
        String text = progress.isEmpty() ? "点按返回 SocialMate" : progress;

        Intent open = new Intent(this, AsrActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent content = PendingIntent.getActivity(this, 0, open, pendingFlags());

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        builder.setContentTitle(title)
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setContentIntent(content)
                .setVisibility(Notification.VISIBILITY_PRIVATE);

        if (paused) {
            builder.addAction(new Notification.Action.Builder(
                    android.R.drawable.ic_media_play, "继续",
                    serviceIntent(ACTION_RESUME, 31)).build());
        } else {
            builder.addAction(new Notification.Action.Builder(
                    android.R.drawable.ic_media_pause, "暂停",
                    serviceIntent(ACTION_PAUSE, 32)).build());
        }
        builder.addAction(new Notification.Action.Builder(
                android.R.drawable.ic_menu_close_clear_cancel, "停止",
                serviceIntent(ACTION_STOP, 33)).build());
        builder.setStyle(new Notification.MediaStyle()
                .setShowActionsInCompactView(0, 1)
                .setMediaSession(mediaSession == null ? null : mediaSession.getSessionToken()));
        return builder.build();
    }

    private PendingIntent serviceIntent(String action, int code) {
        Intent intent = new Intent(this, TtsPlaybackService.class).setAction(action);
        return PendingIntent.getService(this, code, intent, pendingFlags());
    }

    private int pendingFlags() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                : PendingIntent.FLAG_UPDATE_CURRENT;
    }

    private void teardown(String reason) {
        Log.i(TAG, "teardown reason=" + reason);
        releaseWakeLock();
        abandonFocus();
        releaseMediaSession();
        if (foregroundStarted) {
            stopForeground(true);
            foregroundStarted = false;
        }
        stopSelf();
    }

    /* ------------------------------------------------------------ 系统中断 */

    private void pauseFromSystem(String reason) {
        if (runner(this).pause(reason)) refreshNotification();
    }

    private void requestFocus() {
        if (audioManager == null) return;
        AudioAttributes attributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build();
        AudioManager.OnAudioFocusChangeListener listener = change -> {
            Log.i(TAG, "audio focus change=" + change);
            if (change == AudioManager.AUDIOFOCUS_LOSS
                    || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT
                    || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
                // 来电/其它媒体抢占：暂停而不是硬停，但绝不自动恢复——由用户决定。
                pauseFromSystem("audio_focus_" + change);
            }
        };
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(attributes)
                    .setWillPauseWhenDucked(true)
                    .setOnAudioFocusChangeListener(listener, MAIN)
                    .build();
            audioManager.requestAudioFocus(focusRequest);
        } else {
            audioManager.requestAudioFocus(listener, AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN);
        }
    }

    private void abandonFocus() {
        if (audioManager == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
                audioManager.abandonAudioFocusRequest(focusRequest);
                focusRequest = null;
            }
        } catch (Exception ignored) {
        }
    }

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        try {
            PowerManager power = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (power == null) return;
            wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SocialMate:tts-queue");
            wakeLock.setReferenceCounted(false);
            // 兜底上限：即使逻辑异常也不会整夜占着 CPU。
            wakeLock.acquire(90 * 60 * 1000L);
        } catch (Exception e) {
            Log.w(TAG, "wakelock failed: " + e.getMessage());
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {
        }
        wakeLock = null;
    }

    private void ensureMediaSession() {
        if (mediaSession != null) return;
        try {
            mediaSession = new MediaSession(this, "SocialMateTts");
            // 不设 metadata：锁屏不需要、也不应该出现任何私人文本。
            mediaSession.setCallback(new MediaSession.Callback() {
                @Override public void onPlay() {
                    if (runner(TtsPlaybackService.this).resume("media_session")) refreshNotification();
                }

                @Override public void onPause() {
                    pauseFromSystem("media_session");
                }

                @Override public void onStop() {
                    runner(TtsPlaybackService.this).stop("media_session");
                }
            });
            mediaSession.setActive(true);
            updateMediaSessionState();
        } catch (Exception e) {
            Log.w(TAG, "media session failed: " + e.getMessage());
            mediaSession = null;
        }
    }

    private void updateMediaSessionState() {
        if (mediaSession == null) return;
        try {
            TtsQueueRunner queue = runner(this);
            int state = queue.isPaused() ? PlaybackState.STATE_PAUSED : PlaybackState.STATE_PLAYING;
            mediaSession.setPlaybackState(new PlaybackState.Builder()
                    .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                            | PlaybackState.ACTION_STOP | PlaybackState.ACTION_PLAY_PAUSE)
                    .setState(state, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1.0f)
                    .build());
        } catch (Exception ignored) {
        }
    }

    private void releaseMediaSession() {
        if (mediaSession == null) return;
        try {
            mediaSession.setActive(false);
            mediaSession.release();
        } catch (Exception ignored) {
        }
        mediaSession = null;
    }

    /** 耳机拔出/蓝牙断连：平台要求立刻停，交给用户决定何时继续。 */
    private static final class NoisyReceiver extends android.content.BroadcastReceiver {
        private final java.util.function.Consumer<String> onNoisy;

        NoisyReceiver(java.util.function.Consumer<String> onNoisy) {
            this.onNoisy = onNoisy;
        }

        @Override public void onReceive(Context context, Intent intent) {
            if (!AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) return;
            if (onNoisy != null) onNoisy.accept("audio_becoming_noisy");
        }
    }
}
