package app.socialmate.dualmic;

import android.app.Activity;
import android.content.Intent;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;

/**
 * N05 TTS 自检/设置页（0.8.3）：真机验收「可切换 provider」的最小 UI。
 *
 * 页面职责：
 * - 显示当前 provider（fake / remote / system），并允许现场切换；
 * - 「临时系统声音」默认关闭，打开时明确提示 FALLBACK_ONLY（仅供临时备用）；
 * - 远端失败只显示可读错误 + 重试 / 试听（fake）/ 切换到本地预置，绝不静默降级。
 *
 * 也支持 adb 下发命令（不读任何真实用户数据；仅 debug 构建生效）：
 *   adb shell am start -n app.socialmate.dualmic/.TtsSelfTestActivity \
 *     --es cmd speak --es segment enA --ei loop 5 --es text "..."
 *   adb shell am start -n app.socialmate.dualmic/.TtsSelfTestActivity \
 *     --es cmd serverProvider --es value aws-polly-fake
 *   adb shell am start -n app.socialmate.dualmic/.TtsSelfTestActivity \
 *     --es cmd voice --es locale en-US --es voice Joanna   # voice 传空 = 清除该 locale（0.8.4+）
 *
 * V1.5.1 T-10：release 构建里 exported=false 且本方法直接忽略所有 adb 命令；
 * `cmd base` 还要过 TtsPlaybackController 的 remote_base 白名单。
 */
public final class TtsSelfTestActivity extends Activity {
    private static final String TAG = "SocialMateTts";

    private static final String[][] SEGMENTS = {
            {"中文原文", "cn", "zh-CN", "我们今天沿着龙兴路走一走，顺便看看老街这些年的变化。"},
            {"英文 A", "enA", "en-US", "Let's take a walk along Longxing Road and see how the old street has changed over the years."},
            {"英文 B", "enB", "en-GB", "We could stroll down Longxing Road and check out what's new on the old street."},
            {"常用表达", "phrase", "en-US", "take a walk along / check out what's new"}
    };

    private TtsPlaybackController controller;
    private TextView providerView;
    private CheckBox consentBox;
    private TextView consentView;
    private boolean syncingConsentBox;
    private TextView stateView;
    private TextView errorView;
    private TextView logView;
    private CheckBox listenedBox;
    private CheckBox systemBox;
    private EditText remoteBaseInput;
    private LinearLayout errorActions;
    private int currentSegment;
    private final StringBuilder logs = new StringBuilder();
    private boolean syncingSystemBox;

    private int dp(int v) { return (int) (getResources().getDisplayMetrics().density * v + 0.5f); }

    private GradientDrawable surface(int color, int border, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radius));
        if (border != 0) drawable.setStroke(dp(1), border);
        return drawable;
    }

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        buildUi();
        controller = new TtsPlaybackController(this, this::onEvent);
        controller.setPlaylist(playlistJson().toString());
        refreshProvider();
        applyIntent(getIntent());
        stateView.postDelayed(this::refreshState, 600);
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        applyIntent(intent);
    }

    @Override protected void onStop() {
        super.onStop();
        if (controller != null) controller.onStop();
    }

    @Override protected void onDestroy() {
        if (controller != null) {
            controller.shutdown();
            controller = null;
        }
        super.onDestroy();
    }

    private JSONArray playlistJson() {
        JSONArray playlist = new JSONArray();
        for (String[] segment : SEGMENTS) {
            try {
                playlist.put(new JSONObject().put("label", segment[0])
                        .put("segmentType", segment[1]).put("text", segment[3]));
            } catch (Exception ignored) { }
        }
        return playlist;
    }

    private void buildUi() {
        ScrollView scroller = new ScrollView(this);
        scroller.setOnApplyWindowInsetsListener((v, insets) -> {
            android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
            v.setPadding(0, bars.top, 0, bars.bottom);
            return insets;
        });
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xFFF5F7F8);
        root.setPadding(dp(20), dp(18), dp(20), dp(28));
        scroller.addView(root);
        setContentView(scroller);

        TextView title = new TextView(this);
        title.setText("朗读语音设置与自检");
        title.setTextSize(24);
        title.setTextColor(0xFF12232E);
        root.addView(title, new LinearLayout.LayoutParams(-1, -2));

        TextView version = new TextView(this);
        version.setText("SocialMate " + versionName() + " · provider 可切换");
        version.setTextSize(15);
        version.setTextColor(0xFF6B7A85);
        version.setPadding(0, dp(2), 0, dp(12));
        root.addView(version);

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(16), dp(14), dp(16), dp(14));
        card.setBackground(surface(0xFFFFFFFF, 0xFFE2E9EA, 16));
        providerView = new TextView(this);
        providerView.setTextSize(17);
        providerView.setTextColor(0xFF1C293A);
        providerView.setText("当前 provider：读取中…");
        card.addView(providerView, new LinearLayout.LayoutParams(-1, -2));
        stateView = new TextView(this);
        stateView.setTextSize(14);
        stateView.setTextColor(0xFF3C4A5A);
        stateView.setPadding(0, dp(8), 0, 0);
        stateView.setText("状态：读取中…");
        card.addView(stateView, new LinearLayout.LayoutParams(-1, -2));
        LinearLayout.LayoutParams cardLp = new LinearLayout.LayoutParams(-1, -2);
        cardLp.bottomMargin = dp(12);
        root.addView(card, cardLp);

        addSectionLabel(root, "切换朗读来源");
        LinearLayout providerRow = new LinearLayout(this);
        providerRow.setOrientation(LinearLayout.HORIZONTAL);
        root.addView(providerRow, new LinearLayout.LayoutParams(-1, -2));
        addProviderButton(providerRow, "本地预置\n(fake)", TtsPlaybackController.PROVIDER_FAKE);
        addProviderButton(providerRow, "远端神经\n(remote)", TtsPlaybackController.PROVIDER_REMOTE);
        addProviderButton(providerRow, "系统声音\n(本机)", TtsPlaybackController.PROVIDER_SYSTEM);

        TextView fallbackNote = new TextView(this);
        fallbackNote.setText("当前默认用本机系统语音朗读（音质一般，胜在不联网、不计费）；"
                + "Amazon Polly 凭据到位后可切到云端声线。远端失败不会自动切过来。");
        fallbackNote.setTextSize(13);
        fallbackNote.setTextColor(0xFF7A5A2E);
        fallbackNote.setPadding(0, dp(8), 0, dp(4));
        root.addView(fallbackNote, new LinearLayout.LayoutParams(-1, -2));

        systemBox = new CheckBox(this);
        systemBox.setText("本机系统声音（默认开启）");
        systemBox.setTextSize(16);
        systemBox.setTextColor(0xFF12232E);
        systemBox.setOnCheckedChangeListener((v, checked) -> {
            if (syncingSystemBox) return; // 只是刷新显示，不是用户点击
            log("system fallback → " + controller.setSystemFallback(checked));
            refreshProvider();
        });
        root.addView(systemBox, new LinearLayout.LayoutParams(-1, -2));

        LinearLayout remoteRow = new LinearLayout(this);
        remoteRow.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams remoteLp = new LinearLayout.LayoutParams(-1, -2);
        remoteLp.topMargin = dp(8);
        root.addView(remoteRow, remoteLp);
        remoteBaseInput = new EditText(this);
        remoteBaseInput.setTextSize(14);
        remoteBaseInput.setHint("远端基地址，如 http://127.0.0.1:8791");
        remoteBaseInput.setSingleLine(true);
        remoteRow.addView(remoteBaseInput, new LinearLayout.LayoutParams(0, dp(52), 1f));
        Button saveBase = plainButton("保存地址");
        saveBase.setTextSize(14);
        saveBase.setOnClickListener(v -> {
            log("remote base → " + controller.setRemoteBase(remoteBaseInput.getText().toString()));
        });
        remoteRow.addView(saveBase, new LinearLayout.LayoutParams(dp(96), dp(52)));

        Button probe = plainButton("检查远端是否就绪");
        probe.setTextColor(0xFF0C7766);
        probe.setOnClickListener(v -> {
            JSONObject result = controller.probeRemote();
            log("probe → " + result);
            errorView.setText("远端探测：" + result.toString());
        });
        LinearLayout.LayoutParams probeLp = new LinearLayout.LayoutParams(-1, dp(52));
        probeLp.topMargin = dp(4);
        root.addView(probe, probeLp);

        addSectionLabel(root, "远端服务商（只影响 provider=remote）");
        LinearLayout serverProviderRow = new LinearLayout(this);
        serverProviderRow.setOrientation(LinearLayout.HORIZONTAL);
        root.addView(serverProviderRow, new LinearLayout.LayoutParams(-1, -2));
        addRemoteProviderButton(serverProviderRow, "fake", "fake");
        addRemoteProviderButton(serverProviderRow, "aws-polly-fake", "aws-polly-fake");
        addRemoteProviderButton(serverProviderRow, "aws-polly", "aws-polly");

        addSectionLabel(root, "云端朗读授权（本次运行有效）");
        consentBox = new CheckBox(this);
        consentBox.setText("允许把学习文本发送到云端朗读（AWS）");
        consentBox.setTextSize(16);
        consentBox.setTextColor(0xFF12232E);
        consentBox.setOnCheckedChangeListener((v, checked) -> {
            if (syncingConsentBox) return;
            JSONObject info = controller.setCloudConsent(checked);
            log("cloud consent → " + checked);
            refreshConsent(info);
        });
        root.addView(consentBox, new LinearLayout.LayoutParams(-1, -2));

        consentView = new TextView(this);
        consentView.setTextSize(13);
        consentView.setTextColor(0xFF6B7A85);
        consentView.setPadding(dp(2), dp(4), 0, dp(8));
        consentView.setText("授权状态：读取中…");
        root.addView(consentView, new LinearLayout.LayoutParams(-1, -2));

        Button revoke = plainButton("撤销授权（下次云端朗读重新确认）");
        revoke.setTextSize(14);
        revoke.setOnClickListener(v -> {
            JSONObject info = controller.setCloudConsent(false);
            log("cloud consent revoked");
            refreshConsent(info);
        });
        root.addView(revoke, new LinearLayout.LayoutParams(-1, dp(48)));

        addSectionLabel(root, "远端声音（默认 = 服务端按 locale 决定）");
        LinearLayout remoteVoiceRow = new LinearLayout(this);
        remoteVoiceRow.setOrientation(LinearLayout.HORIZONTAL);
        root.addView(remoteVoiceRow, new LinearLayout.LayoutParams(-1, -2));
        addRemoteVoiceButton(remoteVoiceRow, "默认", "", "");
        addRemoteVoiceButton(remoteVoiceRow, "Zhiyu", "zh-CN", "Zhiyu");
        addRemoteVoiceButton(remoteVoiceRow, "Ruth", "en-US", "Ruth");
        addRemoteVoiceButton(remoteVoiceRow, "Joanna", "en-US", "Joanna");
        addRemoteVoiceButton(remoteVoiceRow, "Amy", "en-GB", "Amy");
        addRemoteVoiceButton(remoteVoiceRow, "Brian", "en-GB", "Brian");

        addSectionLabel(root, "错误提示（可读）");
        errorView = new TextView(this);
        errorView.setTextSize(14);
        errorView.setTextColor(0xFF9C3434);
        errorView.setPadding(dp(12), dp(10), dp(12), dp(10));
        errorView.setBackground(surface(0xFFFFFAFA, 0xFFE7C7C7, 14));
        errorView.setText("暂无错误");
        root.addView(errorView, new LinearLayout.LayoutParams(-1, -2));

        errorActions = new LinearLayout(this);
        errorActions.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams actionLp = new LinearLayout.LayoutParams(-1, -2);
        actionLp.topMargin = dp(6);
        root.addView(errorActions, actionLp);
        Button retry = plainButton("重试");
        retry.setOnClickListener(v -> log("retry → " + controller.retry()));
        errorActions.addView(retry, new LinearLayout.LayoutParams(0, dp(48), 1f));
        Button preview = plainButton("试听(本地)");
        preview.setOnClickListener(v -> {
            controller.setProvider(TtsPlaybackController.PROVIDER_FAKE);
            refreshProvider();
            speakSegment(currentSegment);
        });
        errorActions.addView(preview, new LinearLayout.LayoutParams(0, dp(48), 1f));
        Button switchProvider = plainButton("切到 fake");
        switchProvider.setOnClickListener(v -> {
            controller.setProvider(TtsPlaybackController.PROVIDER_FAKE);
            refreshProvider();
            errorView.setText("已切换到本地预置音频，可重新朗读本段。");
        });
        errorActions.addView(switchProvider, new LinearLayout.LayoutParams(0, dp(48), 1f));

        addSectionLabel(root, "倍速（保音高）");
        LinearLayout rateRow = new LinearLayout(this);
        rateRow.setOrientation(LinearLayout.HORIZONTAL);
        root.addView(rateRow, new LinearLayout.LayoutParams(-1, -2));
        addRateButton(rateRow, "0.75×", 0.75);
        addRateButton(rateRow, "0.9×", 0.9);
        addRateButton(rateRow, "1.0×", 1.0);

        addSectionLabel(root, "循环次数（循环只重放缓存）");
        LinearLayout loopRow = new LinearLayout(this);
        loopRow.setOrientation(LinearLayout.HORIZONTAL);
        root.addView(loopRow, new LinearLayout.LayoutParams(-1, -2));
        addLoopButton(loopRow, "1 次", 1);
        addLoopButton(loopRow, "3 次", 3);
        addLoopButton(loopRow, "5 次", 5);
        addLoopButton(loopRow, "20 次", 20);

        addSectionLabel(root, "单项朗读");
        addSpeakButton(root, "朗读中文原文", 0);
        addSpeakButton(root, "朗读英文 A", 1);
        addSpeakButton(root, "朗读英文 B", 2);
        addSpeakButton(root, "朗读常用表达", 3);

        LinearLayout navRow = new LinearLayout(this);
        navRow.setOrientation(LinearLayout.HORIZONTAL);
        root.addView(navRow, new LinearLayout.LayoutParams(-1, -2));
        Button prev = plainButton("← 上一段");
        prev.setOnClickListener(v -> {
            JSONObject result = controller.previousSegment();
            if (result.optBoolean("ok")) currentSegment = Math.max(0, currentSegment - 1);
            log("上一段 → " + result);
            refreshListened();
        });
        navRow.addView(prev, new LinearLayout.LayoutParams(0, dp(52), 1f));
        Button next = plainButton("下一段 →");
        next.setOnClickListener(v -> {
            JSONObject result = controller.nextSegment();
            if (result.optBoolean("ok")) currentSegment = Math.min(SEGMENTS.length - 1, currentSegment + 1);
            log("下一段 → " + result);
            refreshListened();
        });
        navRow.addView(next, new LinearLayout.LayoutParams(0, dp(52), 1f));

        Button stop = plainButton("停止");
        stop.setTextColor(0xFF9C3434);
        stop.setOnClickListener(v -> log("stop → " + controller.stop()));
        LinearLayout.LayoutParams stopLp = new LinearLayout.LayoutParams(-1, dp(52));
        stopLp.topMargin = dp(4);
        root.addView(stop, stopLp);

        addSectionLabel(root, "进度与故障演示");
        listenedBox = new CheckBox(this);
        listenedBox.setText("本段已听熟（本地保存）");
        listenedBox.setTextSize(16);
        listenedBox.setTextColor(0xFF12232E);
        listenedBox.setOnCheckedChangeListener((v, checked) -> log("已听熟 → "
                + controller.setListened(segmentKey(), checked)));
        root.addView(listenedBox, new LinearLayout.LayoutParams(-1, -2));

        Button missing = plainButton("测试缺失语言 ja-JP（走系统引擎）");
        missing.setTextColor(0xFF7A5A2E);
        missing.setOnClickListener(v -> {
            JSONObject result = controller.diagnose("ja-JP");
            log("ja-JP → " + result);
            errorView.setText("ja-JP：" + result.optString("message", result.toString()));
        });
        root.addView(missing, new LinearLayout.LayoutParams(-1, dp(52)));

        addSectionLabel(root, "状态日志（最近 24 条）");
        logView = new TextView(this);
        logView.setTextSize(13);
        logView.setTextColor(0xFF3C4A5A);
        logView.setPadding(dp(12), dp(10), dp(12), dp(10));
        logView.setBackground(surface(0xFFFFFFFF, 0xFFE2E9EA, 14));
        logView.setText("");
        root.addView(logView, new LinearLayout.LayoutParams(-1, -2));
    }

    private void addSectionLabel(LinearLayout root, String text) {
        TextView label = new TextView(this);
        label.setText(text);
        label.setTextSize(18);
        label.setTextColor(0xFF12232E);
        label.setPadding(0, dp(16), 0, dp(6));
        root.addView(label);
    }

    private Button plainButton(String caption) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(caption);
        button.setTextSize(15);
        button.setTextColor(0xFF1C293A);
        button.setBackground(surface(0xFFFFFFFF, 0xFFE2E9EA, 14));
        return button;
    }

    private void addProviderButton(LinearLayout row, String caption, String providerId) {
        Button button = plainButton(caption);
        button.setTextSize(14);
        button.setOnClickListener(v -> {
            JSONObject result = controller.setProvider(providerId);
            log("provider " + providerId + " → " + result);
            refreshProvider();
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(58), 1f);
        lp.rightMargin = dp(6);
        row.addView(button, lp);
    }

    private void addRemoteProviderButton(LinearLayout row, String caption, String providerId) {
        Button button = plainButton(caption);
        button.setTextSize(12);
        button.setOnClickListener(v -> {
            JSONObject result = controller.setRemoteProvider(providerId);
            log("serverProvider " + providerId + " → 当前 "
                    + result.optString("remoteServerProvider", "fake"));
            refreshProvider();
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(52), 1f);
        lp.rightMargin = dp(6);
        row.addView(button, lp);
    }

    /** 远端声线按钮：voiceId 为空 = 清空该 locale（这里清空三个 locale）。 */
    private void addRemoteVoiceButton(LinearLayout row, String caption, String locale, String voiceId) {
        Button button = plainButton(caption);
        button.setTextSize(11);
        button.setOnClickListener(v -> {
            if (voiceId == null || voiceId.isEmpty()) {
                for (String each : new String[]{"zh-CN", "en-US", "en-GB"}) {
                    controller.setRemoteVoice(each, "");
                }
                log("remote voice → 默认（已清除 zh-CN/en-US/en-GB）");
            } else {
                JSONObject result = controller.setRemoteVoice(locale, voiceId);
                log("remote voice " + locale + "/" + voiceId + " → code="
                        + result.optString("code", "?")
                        + (result.optInt("httpStatus", 200) == 400
                        ? " httpStatus=400 message=" + result.optString("message") : ""));
            }
            refreshProvider();
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(48), 1f);
        lp.rightMargin = dp(4);
        row.addView(button, lp);
    }

    private void addRateButton(LinearLayout row, String caption, double value) {
        Button button = plainButton(caption);
        button.setOnClickListener(v -> log("rate " + value + " → " + controller.setRate(value)));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(52), 1f);
        lp.rightMargin = dp(6);
        row.addView(button, lp);
    }

    private void addLoopButton(LinearLayout row, String caption, int loop) {
        Button button = plainButton(caption);
        button.setOnClickListener(v -> log("loop " + loop + " → " + controller.setLoop(loop)));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(52), 1f);
        lp.rightMargin = dp(6);
        row.addView(button, lp);
    }

    private void addSpeakButton(LinearLayout root, String caption, int segmentIndex) {
        Button button = plainButton(caption);
        button.setTextColor(0xFF0C7766);
        button.setOnClickListener(v -> speakSegment(segmentIndex));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(52));
        lp.bottomMargin = dp(4);
        root.addView(button, lp);
    }

    private void speakSegment(int segmentIndex) {
        currentSegment = segmentIndex;
        String[] segment = SEGMENTS[segmentIndex];
        // blockId 必须是服务端 ID_PATTERN 允许的 ASCII（[A-Za-z0-9._:-]）；
        // 不能用 segment[0] 的中文标签，否则远端 provider 会 400 INVALID_BLOCK_ID。
        SpeakRequest request = new SpeakRequest("req-" + System.currentTimeMillis(),
                "selftest", "selftest-" + segment[1], 1, segment[1], segment[3], segment[2], "",
                controller.currentProvider(), "", controller.rateSetting(), "");
        JSONObject result = controller.speak(request);
        log("朗读「" + segment[0] + "」→ " + result);
        if (!result.optBoolean("ok")) {
            showError(result);
        }
        refreshListened();
        refreshProvider();
    }

    private String segmentKey() {
        return "selftest:" + SEGMENTS[currentSegment][0];
    }

    private void refreshListened() {
        if (listenedBox == null) return;
        listenedBox.setChecked(controller.isListened(segmentKey()).optBoolean("listened"));
    }

    private void refreshProvider() {
        JSONObject info = controller.providerInfo();
        String provider = info.optString("providerId", "fake");
        String label = info.optString("providerLabel", provider);
        providerView.setText("当前 provider：" + label + "（" + provider + "）"
                + (TtsPlaybackController.PROVIDER_SYSTEM.equals(provider) ? " · FALLBACK_ONLY" : ""));
        syncingSystemBox = true;
        systemBox.setChecked(info.optBoolean("systemFallbackEnabled", false));
        syncingSystemBox = false;
        refreshConsent(info);
        String base = controller.remoteBase();
        if (remoteBaseInput != null && remoteBaseInput.getText().length() == 0) {
            remoteBaseInput.setHint("远端基地址，如 " + base);
        }
        log("provider → " + provider + " · 远端 " + base + " / serverProvider "
                + info.optString("remoteServerProvider", "fake")
                + " / voice zh-CN=" + voiceOr(info, "zh-CN")
                + " en-US=" + voiceOr(info, "en-US")
                + " en-GB=" + voiceOr(info, "en-GB")
                + " | " + info.optString("note", ""));
    }

    /** 同步「云端朗读授权」复选框与状态文案。 */
    private void refreshConsent(JSONObject info) {
        if (consentBox == null || consentView == null) return;
        boolean granted = info != null && info.optBoolean("cloudConsent", false);
        syncingConsentBox = true;
        consentBox.setChecked(granted);
        syncingConsentBox = false;
        String server = info == null ? "?" : info.optString("remoteServerProvider", "fake");
        consentView.setText("授权状态：" + (granted ? "已授权（本次运行不再弹窗）" : "未授权（首次云端朗读会先询价确认）")
                + " · 远端服务商 " + server
                + ("aws-polly".equals(server) ? "" : "（当前非真实 Polly，不会外传）"));
    }

    /** 从 providerInfo().remoteVoices 里取当前选中声线；空 = 服务端默认。 */
    private String voiceOr(JSONObject info, String locale) {
        JSONArray voices = info.optJSONArray("remoteVoices");
        if (voices == null) return "(默认)";
        for (int i = 0; i < voices.length(); i++) {
            JSONObject item = voices.optJSONObject(i);
            if (item == null || !locale.equals(item.optString("locale"))) continue;
            if (item.optBoolean("selected", false)) {
                String id = item.optString("voiceId", "");
                return id.isEmpty() ? "(默认)" : id;
            }
        }
        return "(默认)";
    }

    private void refreshState() {
        JSONObject state = controller.state();
        stateView.setText("阶段：" + state.optString("phase", "idle")
                + " · 倍速 " + state.optDouble("rate", 0.9)
                + " · 循环 " + state.optInt("loopTotal", 1)
                + "\n最近一次播放：" + state.optLong("lastWallMs", 0) + " ms（音频 "
                + state.optLong("lastFileMs", 0) + " ms）"
                + "\n合成请求 " + state.optInt("synthRequests", 0)
                + " · 预置准备 " + state.optInt("fakePrepares", 0)
                + (state.has("lastError") ? "\n错误 " + state.optJSONObject("lastError").optString("code") : ""));
        log("state → " + state);
    }

    private void showError(JSONObject result) {
        errorView.setText("错误 " + result.optString("code") + "\n"
                + result.optString("message")
                + (result.optBoolean("retryable", false) ? "\n可重试。" : ""));
    }

    private void onEvent(JSONObject event) {
        String state = event.optString("state");
        if ("consent_required".equals(state)) {
            errorView.setText("等待确认：尚未发送任何文本。");
            TtsConsentDialog.show(this, controller, event);
            return;
        }
        if ("consent_cancelled".equals(state)) {
            errorView.setText("已取消发送；没有产生任何云请求。");
            return;
        }
        if ("error".equals(state)) {
            showError(event);
        }
        if ("adapter_log".equals(state)) {
            log("adapter " + event.optString("line"));
            return;
        }
        if ("finished".equals(state) || "loop_done".equals(state)) {
            refreshState();
        }
        log("event " + state + " loop=" + event.optInt("loopIndex", 0)
                + "/" + event.optInt("loopTotal", 0));
    }

    private void log(String line) {
        String stamp = new java.text.SimpleDateFormat("HH:mm:ss", Locale.US)
                .format(new java.util.Date());
        logs.append(stamp).append(' ').append(line).append('\n');
        int lines = 0;
        for (int i = 0; i < logs.length(); i++) if (logs.charAt(i) == '\n') lines++;
        while (lines > 24) {
            int end = logs.indexOf("\n");
            if (end < 0) break;
            logs.delete(0, end + 1);
            lines--;
        }
        if (logView != null) logView.setText(logs.toString());
        android.util.Log.i(TAG, "selftest " + line);
    }

    private String versionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "未知";
        }
    }

    /* ---------------------------------------------------- adb 测试命令 */

    private void applyIntent(Intent intent) {
        if (!BuildConfig.DEBUG) {
            // release 不执行任何 adb 命令；只记一条不含 intent extras 的日志。
            if (intent != null && intent.hasExtra("cmd")) {
                android.util.Log.i(TAG, "adb command ignored in release build");
            }
            return;
        }
        if (intent == null) return;
        String cmd = intent.getStringExtra("cmd");
        if (cmd == null) return;
        switch (cmd) {
            case "speak": {
                String text = intent.getStringExtra("text");
                String segmentType = intent.getStringExtra("segment");
                if (segmentType == null) segmentType = SpeakRequest.segmentOfLang(intent.getStringExtra("lang"));
                int loop = intent.getIntExtra("loop", 0);
                float rate = intent.getFloatExtra("rate", 0f);
                String provider = intent.getStringExtra("provider");
                if (rate > 0) controller.setRate(rate);
                if (loop > 0) controller.setLoop(loop);
                if (provider != null) controller.setProvider(provider);
                String locale = intent.getStringExtra("locale");
                SpeakRequest request = new SpeakRequest("req-adb-" + System.currentTimeMillis(),
                        intent.getStringExtra("record") == null ? "selftest" : intent.getStringExtra("record"),
                        segmentType, 1, segmentType, text,
                        locale == null ? SpeakRequest.defaultLocale(segmentType) : locale, "",
                        controller.currentProvider(), "", controller.rateSetting(), "");
                JSONObject result = controller.speak(request);
                log("adb speak segment=" + segmentType + " loop=" + loop + " rate=" + rate
                        + " provider=" + controller.currentProvider() + " → " + result);
                if (!result.optBoolean("ok")) showError(result);
                refreshProvider();
                break;
            }
            case "stop":
                log("adb stop → " + controller.stop());
                break;
            case "rate":
                log("adb rate → " + controller.setRate(intent.getFloatExtra("rate", 0.9f)));
                break;
            case "loop":
                log("adb loop → " + controller.setLoop(intent.getIntExtra("loop", 1)));
                break;
            case "segment":
                speakSegment(intent.getIntExtra("index", 0));
                break;
            case "provider":
                log("adb provider → " + controller.setProvider(intent.getStringExtra("provider")));
                refreshProvider();
                break;
            case "system":
                log("adb system fallback → "
                        + controller.setSystemFallback(intent.getBooleanExtra("value", true)));
                refreshProvider();
                break;
            case "consent":
                log("adb consent → " + controller.confirmConsent());
                refreshState();
                break;
            case "cancelConsent":
                log("adb cancelConsent → " + controller.cancelConsent());
                refreshState();
                break;
            case "retry":
                log("adb retry → " + controller.retry());
                break;
            case "probe":
                log("adb probe → " + controller.probeRemote());
                break;
            case "base": {
                String value = intent.getStringExtra("value");
                String reason = TtsPlaybackController.rejectRemoteBase(value);
                if (reason != null) {
                    log("adb base → " + TtsPlaybackController.CODE_REMOTE_BASE_REJECTED
                            + "（" + reason + "），已保留原地址");
                    break;
                }
                log("adb base → " + controller.setRemoteBase(value));
                break;
            }
            case "serverProvider":
                // --es value aws-polly-fake|aws-polly|fake
                log("adb serverProvider → "
                        + controller.setRemoteProvider(intent.getStringExtra("value")));
                refreshProvider();
                break;
            case "voice":
                // --es locale en-US --es voice Joanna（voice 为空 → 清除该 locale 偏好）
                log("adb voice locale=" + intent.getStringExtra("locale")
                        + " voice=" + intent.getStringExtra("voice") + " → "
                        + controller.setRemoteVoice(intent.getStringExtra("locale"),
                        intent.getStringExtra("voice")));
                refreshProvider();
                break;
            case "next":
                log("adb next → " + controller.nextSegment());
                currentSegment = Math.min(SEGMENTS.length - 1, currentSegment + 1);
                refreshListened();
                break;
            case "previous":
                log("adb previous → " + controller.previousSegment());
                currentSegment = Math.max(0, currentSegment - 1);
                refreshListened();
                break;
            case "listen":
                log("adb listen → " + controller.setListened(segmentKey(),
                        intent.getBooleanExtra("value", true)));
                refreshListened();
                break;
            case "status":
                refreshProvider();
                refreshState();
                break;
            default:
                break;
        }
    }
}
