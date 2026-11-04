package app.socialmate.dualmic;

import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * N05 V1.4｜后台朗读队列（由前台服务持有，Activity 停掉后继续跑）。
 *
 * 与网页 {@code SMQ} 的分工：
 *   - 顺序/间隙/轮次与 V1.3 完全一致：间隙由每项 {@code gapBeforeMs} 决定，轮末 320ms；
 *   - 每个元素仍然只调一次 {@link TtsPlaybackController#speak}（loop=1），
 *     真实音频完成回调（state=finished）是唯一推进依据，绝不用固定时长猜测；
 *   - 超时/可重试错误沿用 V1.3 的 12s 首项上限、4200+230×字数（封顶 30s）与最多 3 次重试。
 *
 * 所有事件通过 {@link Callback} 上报：页面显示 + 通知栏状态共用同一份真相。
 */
final class TtsQueueRunner {
    private static final String TAG = "SocialMateTtsQueue";

    interface Callback {
        /** 队列事件（含 item_start/item_done/round_done/queue_finished/queue_* / error）。 */
        void onQueueEvent(JSONObject event);

        /** 队列彻底结束（完成/失败/用户停止），服务据此收尾。 */
        void onQueueIdle(String reason);
    }

    private static final int MAX_RETRY = 3;
    private static final int FIRST_TIMEOUT_MS = 12000;
    private static final int ITEM_BASE_MS = 4200;
    private static final int ITEM_PER_CHAR_MS = 230;
    private static final int ITEM_TIMEOUT_CAP_MS = 30000;
    private static final int ROUND_GAP_MS = 320;

    private static final String K_QUEUE_START = "queue_start";
    private static final String K_ITEM_START = "item_start";
    private static final String K_ITEM_DONE = "item_done";
    private static final String K_ROUND_DONE = "round_done";
    private static final String K_QUEUE_FINISHED = "queue_finished";
    private static final String K_QUEUE_STOPPED = "queue_stopped";
    private static final String K_QUEUE_PAUSED = "queue_paused";
    private static final String K_QUEUE_RESUMED = "queue_resumed";

    static final class Item {
        final String kind;
        final String lang;
        final String label;
        final String text;
        final long gapBeforeMs;

        Item(String kind, String lang, String label, String text, long gapBeforeMs) {
            this.kind = kind == null ? "" : kind;
            this.lang = lang == null ? "zh" : lang;
            this.label = label == null ? "" : label;
            this.text = text == null ? "" : text;
            this.gapBeforeMs = Math.max(0, gapBeforeMs);
        }

        /**
         * 段类型必须沿用 V1.3 的推导：网页对每个元素传入的是 lang（zh/en），
         * 控制器再用 segmentOfLang 得到 cn / enA。若按 kind 强行映射成 phrase，
         * 中文词组会被 en-US 声线朗读（真机已复现「晚上散步」被英文引擎读）。
         */
        String segmentType() {
            return SpeakRequest.segmentOfLang(lang);
        }
    }

    private final TtsPlaybackController controller;
    private final Callback callback;
    private final Handler main = new Handler(Looper.getMainLooper());
    /** V1.4 验收证据：每项开始/结束/轮次/收尾都追加一行 JSONL；logcat 在休眠时不可靠。 */
    private java.io.File timelineFile;

    private final List<Item> items = new ArrayList<>();
    private String queueId = "";
    private String mode = "";
    private String label = "";
    private String recordId = "";
    private String blockId = "";
    private int revision;
    private int loopTotal = 1;
    private int idx;
    private int round;
    private int retries;
    private boolean awaiting;
    private boolean running;
    private boolean paused;
    private boolean pausedInGap;
    /** 最近一次收尾结论：finished / stopped / failed；页面回到前台时据此对齐显示。 */
    private String lastOutcome = "";
    private long queueStartMs;
    private long itemStartMs;
    private Runnable pendingGap;
    private Runnable watchdog;

    TtsQueueRunner(TtsPlaybackController controller, Callback callback) {
        this(controller, callback, null);
    }

    TtsQueueRunner(TtsPlaybackController controller, Callback callback, java.io.File timelineFile) {
        this.controller = controller;
        this.callback = callback;
        this.timelineFile = timelineFile;
    }

    void setTimelineFile(java.io.File file) {
        this.timelineFile = file;
    }

    /** 单行 JSONL 追加；写失败不打断播放（证据失败不能变成功能失败）。 */
    private void trace(String event, JSONObject extra) {
        if (timelineFile == null) return;
        try {
            JSONObject row = new JSONObject();
            row.put("at", System.currentTimeMillis());
            row.put("elapsedMs", queueStartMs > 0 ? SystemClock.elapsedRealtime() - queueStartMs : 0);
            row.put("ev", event);
            row.put("queueId", queueId);
            row.put("idx", idx);
            row.put("round", round);
            row.put("total", items.size());
            row.put("loopTotal", loopTotal);
            if (extra != null) {
                java.util.Iterator<String> keys = extra.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    row.put(key, extra.opt(key));
                }
            }
            java.io.FileWriter writer = new java.io.FileWriter(timelineFile, true);
            writer.write(row.toString());
            writer.write("\n");
            writer.close();
        } catch (Exception ignored) {
        }
    }

    boolean isRunning() {
        return running;
    }

    boolean isPaused() {
        return paused;
    }

    /** 解析网页下发计划并开跑。返回 {ok:false,code,message} 表示没有启动。 */
    JSONObject start(String planJson) {
        return start(planJson, "");
    }

    JSONObject start(String planJson, String origin) {
        JSONObject plan;
        try {
            plan = new JSONObject(planJson == null ? "{}" : planJson);
        } catch (Exception e) {
            return error("TTS_BAD_PLAN", "播放计划不是合法 JSON");
        }
        JSONArray raw = plan.optJSONArray("items");
        if (raw == null || raw.length() == 0) {
            return error("TTS_EMPTY_PLAN", "播放计划里没有可朗读元素");
        }
        List<Item> parsed = new ArrayList<>();
        for (int i = 0; i < raw.length(); i++) {
            JSONObject o = raw.optJSONObject(i);
            if (o == null) continue;
            String text = o.optString("text", "");
            if (text.trim().isEmpty()) continue;
            parsed.add(new Item(o.optString("kind", ""), o.optString("lang", "zh"),
                    o.optString("label", ""), text, o.optLong("gapBeforeMs", 0)));
        }
        if (parsed.isEmpty()) {
            return error("TTS_EMPTY_PLAN", "播放计划里没有可朗读元素");
        }
        stopInternal("restart", false);
        items.clear();
        items.addAll(parsed);
        mode = plan.optString("mode", "");
        label = plan.optString("label", "");
        recordId = plan.optString("recordId", "");
        blockId = plan.optString("blockId", "");
        revision = Math.max(0, plan.optInt("revision", 0));
        loopTotal = Math.max(1, Math.min(20, plan.optInt("loopTotal", 1)));
        queueId = "q-" + System.currentTimeMillis();
        idx = 0;
        round = 0;
        retries = 0;
        paused = false;
        pausedInGap = false;
        awaiting = false;
        running = true;
        queueStartMs = SystemClock.elapsedRealtime();
        double rate = plan.optDouble("rate", 0);
        if (rate > 0) controller.setRate(rate);
        Log.i(TAG, "queue_start id=" + queueId + " mode=" + mode + " items=" + items.size()
                + " loop=" + loopTotal + " origin=" + origin);
        emit(K_QUEUE_START, null);
        trace("queue_start", new LooseJson().put("mode", mode).put("items", items.size())
                .put("loopTotal", loopTotal).put("origin", origin == null ? "" : origin));
        speakCurrent();
        return ok("queue_started");
    }

    private void speakCurrent() {
        if (!running) return;
        if (idx >= items.size()) {
            roundDone();
            return;
        }
        Item item = items.get(idx);
        awaiting = true;
        itemStartMs = SystemClock.elapsedRealtime();
        JSONObject ev = event(K_ITEM_START);
        put(ev, "idx", idx);
        put(ev, "round", round + 1);
        put(ev, "total", items.size());
        put(ev, "kind", item.kind);
        put(ev, "lang", item.lang);
        put(ev, "chars", item.text.length());
        callback.onQueueEvent(ev);
        trace("item_start", new LooseJson().put("kind", item.kind).put("lang", item.lang)
                .put("chars", item.text.length()).put("segment", item.segmentType()));
        SpeakRequest request = new SpeakRequest("req-" + System.currentTimeMillis(),
                recordId, blockId, revision, item.segmentType(), item.text,
                SpeakRequest.defaultLocale(item.segmentType()), "",
                "", "", 0, "");
        JSONObject result;
        try {
            result = controller.speak(request);
        } catch (Exception e) {
            result = null;
        }
        if (result == null || !result.optBoolean("ok", false)) {
            awaiting = false;
            String code = result == null ? "TTS_INTERNAL_ERROR" : result.optString("code", "TTS_FAILED");
            String message = result == null ? "朗读请求异常" : result.optString("message", "");
            onItemError(code, message, false);
            return;
        }
        armWatchdog(item);
    }

    private void armWatchdog(Item item) {
        clearWatchdog();
        boolean first = (round == 0 && idx == 0);
        final int cap = first ? FIRST_TIMEOUT_MS
                : Math.min(ITEM_TIMEOUT_CAP_MS, ITEM_BASE_MS + item.text.length() * ITEM_PER_CHAR_MS);
        watchdog = () -> {
            if (!running || paused) return;
            if (!awaiting) return;
            onItemError("TTS_ITEM_TIMEOUT", "第 " + (idx + 1) + " 项 " + cap + "ms 内无完成回调", true);
        };
        main.postDelayed(watchdog, cap);
    }

    private void clearWatchdog() {
        if (watchdog != null) {
            main.removeCallbacks(watchdog);
            watchdog = null;
        }
    }

    private void clearGap() {
        if (pendingGap != null) {
            main.removeCallbacks(pendingGap);
            pendingGap = null;
        }
    }

    /** 控制器事件入口：只有 finished 推进队列，其余只做透传与中断识别。 */
    void onControllerEvent(JSONObject event) {
        if (event == null) return;
        String state = event.optString("state", event.optString("type", ""));
        if ("error".equals(state)) {
            if (!running || !awaiting) return;
            awaiting = false;
            clearWatchdog();
            onItemError(event.optString("code", "TTS_FAILED"),
                    event.optString("message", ""), event.optBoolean("retryable", false));
            return;
        }
        if ("finished".equals(state) && awaiting && running) {
            awaiting = false;
            clearWatchdog();
            long elapsed = itemStartMs > 0 ? SystemClock.elapsedRealtime() - itemStartMs : 0;
            JSONObject done = event(K_ITEM_DONE);
            put(done, "idx", idx);
            put(done, "round", round + 1);
            put(done, "elapsedMs", elapsed);
            put(done, "kind", items.get(Math.min(idx, items.size() - 1)).kind);
            callback.onQueueEvent(done);
            trace("item_done", new LooseJson().put("elapsedMs", elapsed)
                    .put("kind", items.get(Math.min(idx, items.size() - 1)).kind));
            retries = 0;
            idx++;
            if (idx >= items.size()) {
                roundDone();
            } else {
                scheduleNext();
            }
            return;
        }
        if ("stopped".equals(state) && awaiting && running) {
            // 外部 stop（例如另一处调用 controller.stop）。不空等超时，直接如实收尾。
            awaiting = false;
            clearWatchdog();
            stopInternal("controller_stopped", true);
        }
    }

    private void scheduleNext() {
        if (!running) return;
        if (paused) {
            pausedInGap = true;
            return;
        }
        long lead = items.get(idx).gapBeforeMs;
        if (lead <= 0) {
            speakCurrent();
            return;
        }
        clearGap();
        pendingGap = () -> {
            pendingGap = null;
            if (!running) return;
            if (paused) {
                pausedInGap = true;
                return;
            }
            speakCurrent();
        };
        main.postDelayed(pendingGap, lead);
    }

    private void roundDone() {
        if (!running) return;
        round++;
        JSONObject ev = event(K_ROUND_DONE);
        put(ev, "round", round);
        put(ev, "total", loopTotal);
        put(ev, "items", items.size());
        callback.onQueueEvent(ev);
        trace("round_done", new LooseJson().put("round", round).put("total", loopTotal));
        if (round >= loopTotal) {
            long durationMs = SystemClock.elapsedRealtime() - queueStartMs;
            JSONObject done = event(K_QUEUE_FINISHED);
            put(done, "rounds", round);
            put(done, "items", items.size());
            put(done, "durationMs", durationMs);
            Log.i(TAG, "queue_finished rounds=" + round + " items=" + items.size()
                    + " durationMs=" + durationMs);
            running = false;
            lastOutcome = "finished";
            trace("queue_finished", new LooseJson().put("rounds", round).put("durationMs", durationMs));
            callback.onQueueEvent(done);
            callback.onQueueIdle("finished");
            return;
        }
        idx = 0;
        if (paused) {
            pausedInGap = true;
            return;
        }
        clearGap();
        pendingGap = () -> {
            pendingGap = null;
            if (!running || paused) {
                if (running) pausedInGap = true;
                return;
            }
            speakCurrent();
        };
        main.postDelayed(pendingGap, ROUND_GAP_MS);
    }

    private void onItemError(String code, String message, boolean retryable) {
        if (!running) return;
        boolean canRetry = retryable || "TTS_REMOTE_REJECTED".equals(code)
                || "TTS_REMOTE_TIMEOUT".equals(code) || "TTS_REMOTE_UNAVAILABLE".equals(code)
                || "TTS_ITEM_TIMEOUT".equals(code);
        retries++;
        if (canRetry && retries <= MAX_RETRY) {
            long wait = Math.min(9000, 900L * retries);
            JSONObject ev = event("item_retry");
            put(ev, "idx", idx);
            put(ev, "attempt", retries);
            put(ev, "waitMs", wait);
            put(ev, "code", code);
            callback.onQueueEvent(ev);
            Log.w(TAG, "item_retry idx=" + idx + " attempt=" + retries + " code=" + code);
            trace("item_retry", new LooseJson().put("code", code).put("attempt", retries));
            clearGap();
            pendingGap = () -> {
                pendingGap = null;
                if (!running) return;
                if (paused) {
                    pausedInGap = true;
                    return;
                }
                speakCurrent();
            };
            main.postDelayed(pendingGap, wait);
            return;
        }
        JSONObject err = event("error");
        put(err, "code", code);
        put(err, "message", message);
        put(err, "retryable", false);
        put(err, "idx", idx);
        put(err, "round", round + 1);
        callback.onQueueEvent(err);
        Log.e(TAG, "queue_failed code=" + code + " idx=" + idx + " message=" + message);
        stopInternal("failed", true);
    }

    /** 通知栏/耳机拔出/来电等中断：暂停但绝不自动恢复。 */
    boolean pause(String reason) {
        if (!running) return false;
        if (paused) return false;
        paused = true;
        clearWatchdog();
        if (awaiting) {
            try {
                controller.pause();
            } catch (Exception ignored) {
            }
        } else {
            pausedInGap = true;
            clearGap();
        }
        JSONObject ev = event(K_QUEUE_PAUSED);
        put(ev, "reason", reason == null ? "" : reason);
        put(ev, "idx", idx);
        put(ev, "round", round + 1);
        callback.onQueueEvent(ev);
        Log.i(TAG, "queue_paused reason=" + reason + " idx=" + idx);
        return true;
    }

    boolean resume(String reason) {
        if (!running || !paused) return false;
        paused = false;
        if (awaiting) {
            JSONObject result;
            try {
                result = controller.resume();
            } catch (Exception e) {
                result = null;
            }
            if (result == null || !result.optBoolean("ok", false)) {
                // 播放器已不在暂停态：按「重新读这一项」处理，避免卡死。
                awaiting = false;
                pausedInGap = false;
                speakCurrent();
            } else {
                Item item = items.get(Math.min(idx, items.size() - 1));
                itemStartMs = SystemClock.elapsedRealtime();
                armWatchdog(item);
            }
        } else if (pausedInGap) {
            pausedInGap = false;
            speakCurrent();
        } else {
            speakCurrent();
        }
        JSONObject ev = event(K_QUEUE_RESUMED);
        put(ev, "reason", reason == null ? "" : reason);
        put(ev, "idx", idx);
        put(ev, "round", round + 1);
        callback.onQueueEvent(ev);
        Log.i(TAG, "queue_resumed reason=" + reason + " idx=" + idx);
        return true;
    }

    void stop(String reason) {
        stopInternal(reason, true);
    }

    private void stopInternal(String reason, boolean notify) {
        boolean wasRunning = running || awaiting;
        running = false;
        awaiting = false;
        paused = false;
        pausedInGap = false;
        clearWatchdog();
        clearGap();
        try {
            controller.stop();
        } catch (Exception ignored) {
        }
        if (notify && wasRunning) {
            JSONObject ev = event(K_QUEUE_STOPPED);
            put(ev, "reason", reason == null ? "" : reason);
            put(ev, "idx", idx);
            put(ev, "round", round + 1);
            callback.onQueueEvent(ev);
            callback.onQueueIdle(reason == null ? "stopped" : reason);
        }
        lastOutcome = reason == null ? "stopped" : reason;
        Log.i(TAG, "queue_stopped reason=" + reason);
        if (wasRunning) trace("queue_stopped", new LooseJson().put("reason", reason == null ? "" : reason));
    }

    /** 供页面/通知栏显示的实时状态（不含任何私人正文）。 */
    JSONObject state() {
        JSONObject out = event("queue_state");
        put(out, "queueId", queueId);
        put(out, "mode", mode);
        put(out, "label", label);
        put(out, "running", running);
        put(out, "paused", paused);
        put(out, "idx", idx);
        put(out, "round", Math.min(round + (running ? 1 : 0), loopTotal));
        put(out, "roundsDone", round);
        put(out, "total", items.size());
        put(out, "loopTotal", loopTotal);
        put(out, "outcome", lastOutcome);
        if (idx >= 0 && idx < items.size()) {
            Item item = items.get(idx);
            put(out, "kind", item.kind);
            put(out, "itemLabel", item.label);
        }
        return out;
    }

    /* -------------------------------------------------------- 事件小工具 */

    private JSONObject error(String code, String message) {
        JSONObject out = new LooseJson().put("ok", false).put("code", code).put("message", message);
        return out;
    }

    private JSONObject ok(String code) {
        return new LooseJson().put("ok", true).put("code", code);
    }

    private JSONObject event(String state) {
        return new LooseJson().put("type", "state").put("state", state);
    }

    private void emit(String state, String reason) {
        JSONObject ev = event(state);
        put(ev, "idx", idx);
        put(ev, "round", round + 1);
        put(ev, "total", items.size());
        put(ev, "loopTotal", loopTotal);
        put(ev, "label", label);
        if (reason != null) put(ev, "reason", reason);
        callback.onQueueEvent(ev);
    }

    @SuppressWarnings("unchecked")
    private static void put(JSONObject target, String key, Object value) {
        try {
            target.put(key, value);
        } catch (Exception ignored) {
        }
    }

    /** 供服务计算通知文案：不暴露任何正文。 */
    String progressText() {
        if (!running && !paused) return "";
        int shownRound = Math.min(round + 1, loopTotal);
        return "第 " + shownRound + "/" + loopTotal + " 轮 · 第 " + Math.min(idx + 1, items.size())
                + "/" + items.size() + " 项";
    }
}
