package app.socialmate.dualmic;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

/**
 * 录音前台服务（P1-5）：让 4G 出门时切后台/锁屏仍能继续收音与归档。
 *
 * 只负责保活与通知，麦克风读写仍由 AsrActivity 的 worker 线程持有。
 * Android 14+ 需要 FOREGROUND_SERVICE_MICROPHONE 权限与 microphone 类型。
 * 通知点击回到 AsrActivity；停止录音时由 stopStreaming 关闭服务。
 */
public class AsrForegroundService extends Service {
    private static final String CHANNEL = "sm-asr-record";
    private static final int NOTIFICATION_ID = 2001;

    public static void start(Context context) {
        Intent intent = new Intent(context, AsrForegroundService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    public static void stop(Context context) {
        try {
            context.stopService(new Intent(context, AsrForegroundService.class));
        } catch (Exception ignored) {
        }
    }

    @Override public void onCreate() {
        super.onCreate();
        createChannel();
        Intent open = new Intent(this, AsrActivity.class);
        PendingIntent pending = PendingIntent.getActivity(this, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(this, CHANNEL)
                .setContentTitle("SocialMate 正在录音")
                .setContentText("实时字幕与归档在本机运行；点按回到对话")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)
                .setContentIntent(pending)
                .build();
        startForeground(NOTIFICATION_ID, notification);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override public IBinder onBind(Intent intent) {
        return null;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "实时录音",
                    NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("录音时保持字幕与归档运行");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }
}