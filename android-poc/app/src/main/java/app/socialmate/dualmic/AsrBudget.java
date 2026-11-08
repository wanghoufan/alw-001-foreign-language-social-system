package app.socialmate.dualmic;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * 腾讯 ASR 手机直连的本机每日时长闸（仅自用）。
 *
 * 这是本机估算闸，不是厂商硬预算：它只把本机发起的录音时长记进 SharedPreferences，
 * 防止本机误操作把 Key 刷爆。真正的费用保护以厂商控制台的额度与告警为准。
 *
 * - 只计录音时长，不计费金额；
 * - 按 UTC 日期（yyyyMMdd）跨日自动重置；
 * - 不记录、不打印 Key / URL / 正文，也不碰其它服务的账本键。
 */
public final class AsrBudget {
    /** 本机每日上限：30 分钟。 */
    public static final long DAILY_LIMIT_MS = 30L * 60L * 1000L;

    private static final String PREFS = "socialmate-cloud-usage";
    private static final String KEY_DATE = "asr.date";
    private static final String KEY_USED_MS = "asr.used_ms";

    private final SharedPreferences prefs;

    public AsrBudget(Context context) {
        this.prefs = context.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** 今日已用毫秒 */
    public synchronized long usedMs() {
        String today = today();
        if (!today.equals(prefs.getString(KEY_DATE, ""))) return 0L;
        long used = prefs.getLong(KEY_USED_MS, 0L);
        return used < 0L ? 0L : used;
    }

    /** 今日剩余毫秒；已超额返回 0 */
    public synchronized long remainingMs() {
        long left = DAILY_LIMIT_MS - usedMs();
        return left < 0L ? 0L : left;
    }

    /**
     * 开始前检查；剩余不足 minimumMs（调用方按不足 1 分钟处理）返回 false 并给出 reason。
     */
    public synchronized boolean canStart(long minimumMs, JSONObject out) {
        long need = minimumMs < 0L ? 0L : minimumMs;
        long left = remainingMs();
        if (left < need) {
            if (out != null) {
                try {
                    out.put("ok", false)
                            .put("code", "ASR_BUDGET_EXHAUSTED")
                            .put("error", "今日本机 ASR 时长已用完（上限 30 分钟）");
                } catch (Exception ignored) {
                }
            }
            return false;
        }
        if (out != null) {
            try {
                out.put("ok", true);
            } catch (Exception ignored) {
            }
        }
        return true;
    }

    /** 结算本轮毫秒；按 UTC 日期跨日重置；负数按 0 处理 */
    public synchronized void consume(long elapsedMs) {
        long delta = elapsedMs < 0L ? 0L : elapsedMs;
        String today = today();
        String savedDate = prefs.getString(KEY_DATE, "");
        long base = today.equals(savedDate) ? prefs.getLong(KEY_USED_MS, 0L) : 0L;
        if (base < 0L) base = 0L;
        prefs.edit()
                .putString(KEY_DATE, today)
                .putLong(KEY_USED_MS, base + delta)
                .apply();
    }

    /** 只读状态，供页面/日志：usedMs/limitMs/remainingMs/date */
    public synchronized JSONObject status() {
        JSONObject out = new JSONObject();
        try {
            out.put("usedMs", usedMs())
                    .put("limitMs", DAILY_LIMIT_MS)
                    .put("remainingMs", remainingMs())
                    .put("date", today());
        } catch (Exception ignored) {
        }
        return out;
    }

    private static String today() {
        SimpleDateFormat fmt = new SimpleDateFormat("yyyyMMdd", Locale.US);
        fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
        return fmt.format(new Date());
    }
}