package app.socialmate.dualmic;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.Uri;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.view.ViewGroup;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.ArrayAdapter;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URI;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/**
 * Foreground-only ASR streamer. Sends PCM16 to the local bridge and renders its JSON events.
 * The phone never sees SecretId/SecretKey; without server credentials the bridge replies MOCK.
 */
public final class AsrActivity extends Activity implements AsrClient.Listener {
    private static final int REQUEST_MIC = 201;
    private static final int REQUEST_SAVE_TEXT = 202;
    private static final String DEFAULT_URL = "ws://127.0.0.1:8790/asr";
    private static final String PRIVATE_UI_URL = "http://127.0.0.1:8791/v12";
    private static final String BRIDGE_NAME = "SocialMateAndroid";

    private final List<AsrClient> clients = Collections.synchronizedList(new ArrayList<>());
    private final StringBuilder finals = new StringBuilder();
    private volatile boolean running;
    private volatile AudioRecord recorder;
    private Thread worker;
    private FrameLayout screenRoot;
    private LinearLayout webPanel;
    private LinearLayout advancedTools;
    private WebView socialMateWebView;
    private CheckBox recordingConsent;
    private EditText urlInput;
    private EditText suggestInput;
    private Spinner trackPicker;
    private Button startButton, stopButton, clearButton, suggestButton, reviewButton;
    private TextView status, live, transcript, deviceInfo, suggestionsView;
    private long sessionStartMs;
    private int eventCount;
    private volatile String lastFinal = "";
    private SessionArchive archive;
    private CheckBox retentionConsent;
    private TextView archiveStatusView;
    private TextView retentionHint;
    private TextView webHint;
    private EditText archiveUrlInput, archiveTokenInput, uiUrlInput;
    private SharedPreferences config;
    private ConnectivityManager.NetworkCallback networkCallback;
    /** 待保存的导出文本（SAF 回调时才真正写盘）。 */
    private String pendingSaveName, pendingSaveText;
    private boolean bridgeAttached;
    /** 主线维护的「当前可信页面地址」；JavaBridge 线程只读它，不直接调用 WebView。 */
    private volatile String trustedPageUrl;

    private static final String[] TRACK_LABELS = {
            "混音 → 说话人分离 (mix)",
            "A 轨（左声道）→ 16k_en",
            "B 轨（右声道）→ 16k_en",
            "双轨 A+B 同时识别"};

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // Debug builds only: lets the Mac verify the embedded V1.2 page via CDP.
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        config = getSharedPreferences("socialmate-config", MODE_PRIVATE);
        archive = new SessionArchive(this);
        archive.setListener(this::setArchiveStatus);
        buildUi();
        refreshDeviceInfo();
        registerNetworkRecovery();
        // 冷启动/重启后 outbox 里的待传文件会自动补传（幂等键是 sessionId，重复上传不会重复归档）。
        archive.flushAsync(this::setArchiveStatus);
    }

    /** 网络恢复即补传；本 Activity 生命周期内注册，onDestroy 注销，不做常驻轮询。 */
    private void registerNetworkRecovery() {
        try {
            ConnectivityManager manager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (manager == null) return;
            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override public void onAvailable(Network network) {
                    SessionArchive target = archive;
                    if (target != null) target.onNetworkAvailable();
                }
            };
            manager.registerDefaultNetworkCallback(networkCallback);
        } catch (Exception e) {
            networkCallback = null;
        }
    }

    private void unregisterNetworkRecovery() {
        if (networkCallback == null) return;
        try {
            ConnectivityManager manager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (manager != null) manager.unregisterNetworkCallback(networkCallback);
        } catch (Exception ignored) {
        }
        networkCallback = null;
    }

    private void setArchiveStatus(String text) {
        if (archiveStatusView != null) archiveStatusView.setText(text);
    }

    /** 留存开关的即时反馈：改动立刻影响下一次会话，并让「默认不留存」一眼可见。 */
    private void refreshRetentionHint() {
        if (retentionHint == null) return;
        boolean checked = retentionConsent != null && retentionConsent.isChecked();
        String suffix = running ? "（本轮录音中，改动从下一次会话生效）" : "";
        if (checked) {
            retentionHint.setText("当前：本轮原文留存已开 · 停止录音后自动导出到 Mac" + suffix);
            retentionHint.setBackground(surface(0xFFFDF3E4, 0xFFE7CFA6, 12));
        } else {
            retentionHint.setText("当前：不留存（默认）· 本轮 0 条写盘、0 条上传到 Mac" + suffix);
            retentionHint.setBackground(surface(0xFFEEF4F2, 0xFFD5E4DE, 12));
        }
        retentionHint.setTextColor(0xFF1C293A);
        if (archiveStatusView != null && !running && archive != null) setArchiveStatus(archive.describe());
    }

    private int dp(int v) { return (int) (getResources().getDisplayMetrics().density * v + 0.5f); }

    private TextView text(LinearLayout root, String value, int sp) {
        TextView t = new TextView(this);
        t.setText(value);
        t.setTextSize(sp);
        // 页面与卡片底色固定浅色，文字颜色也固定，避免系统深色模式把字变成白色（白字白底看不见）。
        t.setTextColor(0xFF1C293A);
        t.setPadding(0, dp(6), 0, dp(6));
        root.addView(t);
        return t;
    }

    private Button button(LinearLayout root, String caption, View.OnClickListener action) {
        Button b = new Button(this);
        b.setAllCaps(false);
        b.setText(caption);
        b.setTextSize(16);
        b.setTextColor(0xFF1C293A);
        b.setOnClickListener(action);
        root.addView(b, new LinearLayout.LayoutParams(-1, dp(52)));
        return b;
    }

    private android.graphics.drawable.GradientDrawable surface(int color, int border, int cornerDp) {
        android.graphics.drawable.GradientDrawable drawable = new android.graphics.drawable.GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(cornerDp));
        if (border != 0) drawable.setStroke(dp(1), border);
        return drawable;
    }

    private LinearLayout section(LinearLayout parent) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(17), dp(17), dp(17), dp(17));
        card.setBackground(surface(0xFFFFFFFF, 0xFFE2E9EA, 18));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.bottomMargin = dp(14);
        parent.addView(card, params);
        return card;
    }

    private void stylePrimary(Button button) {
        button.setTextColor(0xFFFFFFFF);
        button.setBackground(surface(0xFF176E63, 0, 15));
        button.setElevation(dp(2));
    }

    private static void applyInsets(View scroller) {
        scroller.setOnApplyWindowInsetsListener((v, insets) -> {
            int top, bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                top = bars.top;
                bottom = bars.bottom;
            } else {
                top = insets.getSystemWindowInsetTop();
                bottom = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(0, top, 0, bottom);
            return insets;
        });
    }

    /** 聊天页容器：底部取「导航栏 / 软键盘」的较大值，键盘弹出时不遮住输入框。 */
    private void applyWebInsets(View container) {
        container.setOnApplyWindowInsetsListener((v, insets) -> {
            int top, bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                top = bars.top;
                bottom = Math.max(bars.bottom, ime.bottom);
            } else {
                top = insets.getSystemWindowInsetTop();
                bottom = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(0, top, 0, bottom);
            return insets;
        });
        container.requestApplyInsets();
    }

    private void buildUi() {
        ScrollView scroller = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(20), dp(20), dp(25));
        scroller.addView(root);
        applyInsets(scroller);
        screenRoot = new FrameLayout(this);
        screenRoot.addView(scroller, new FrameLayout.LayoutParams(-1, -1));
        setContentView(screenRoot);

        root.setBackgroundColor(0xFFF5F7F8);
        LinearLayout hero = section(root);
        text(hero, "SocialMate · 实时对话", 24).setTextColor(0xFF176E63);
        text(hero, "实时字幕、自然接话与可靠资料推荐", 16);
        text(hero, "开始录音前请先确认录音同意。原文留存默认关闭，AI 文字上传在聊天页单独授权，三项互不代替。", 14);
        text(hero, "版本 " + appVersion(), 13);

        LinearLayout recordingCard = section(root);
        // 三项同意彼此独立：①录音知情 ②原文留存（默认关） ③云端 AI 传文字（在聊天页，本轮不在此处开关）。
        text(recordingCard, "① 录音知情同意（每次开始录音前都要勾选）", 15).setTextColor(0xFF176E63);
        recordingConsent = new CheckBox(this);
        recordingConsent.setText("我已告知并获得同行者同意录音，且了解音频会发送到自己配置的腾讯云 ASR 服务。");
        recordingConsent.setTextSize(16);
        recordingConsent.setTextColor(0xFF1C293A);
        recordingConsent.setPadding(0, dp(2), 0, dp(10));
        recordingCard.addView(recordingConsent, new LinearLayout.LayoutParams(-1, -2));

        text(recordingCard, "② 本轮原文留存（默认不留存，可随时改）", 15).setTextColor(0xFF176E63);
        retentionConsent = new CheckBox(this);
        retentionConsent.setText("允许把本轮已定稿原文先存到手机，再导出到我自己的 Mac。不勾选＝不留存：0 条写盘、0 条上传。");
        retentionConsent.setTextSize(15);
        retentionConsent.setTextColor(0xFF1C293A);
        retentionConsent.setChecked(false);
        retentionConsent.setPadding(0, dp(2), 0, dp(6));
        recordingCard.addView(retentionConsent, new LinearLayout.LayoutParams(-1, -2));
        retentionHint = new TextView(this);
        retentionHint.setTextSize(14);
        retentionHint.setTextColor(0xFF1C293A);
        retentionHint.setPadding(dp(12), dp(9), dp(12), dp(9));
        retentionHint.setBackground(surface(0xFFEEF4F2, 0xFFD5E4DE, 12));
        recordingCard.addView(retentionHint, new LinearLayout.LayoutParams(-1, -2));
        retentionConsent.setOnCheckedChangeListener((v, checked) -> refreshRetentionHint());
        refreshRetentionHint();

        text(recordingCard, "③ 向云端 AI 发送文字（在聊天页单独授权，默认关闭；录音权限不等于这两项同意）", 13);

        Button advancedToggle = button(root, "高级设置与转写诊断  ▾", v -> {
            if (advancedTools == null) return;
            boolean expanded = advancedTools.getVisibility() != View.VISIBLE;
            advancedTools.setVisibility(expanded ? View.VISIBLE : View.GONE);
            ((Button) v).setText(expanded ? "收起高级设置  ▴" : "高级设置与转写诊断  ▾");
        });
        advancedToggle.setTextColor(0xFF176E63);
        advancedTools = new LinearLayout(this);
        advancedTools.setOrientation(LinearLayout.VERTICAL);
        advancedTools.setVisibility(View.GONE);
        root.addView(advancedTools, new LinearLayout.LayoutParams(-1, -2));
        advancedTools.setPadding(dp(12), dp(12), dp(12), dp(12));
        advancedTools.setBackground(surface(0xFFFFFFFF, 0xFFE2E9EA, 16));
        text(advancedTools, "仅调试时需要修改服务地址或音轨。普通使用保持默认混音。", 14);
        urlInput = new EditText(this);
        urlInput.setText(config.getString("asr_url", DEFAULT_URL));
        urlInput.setTextSize(16);
        urlInput.setTextColor(0xFF1C293A);
        urlInput.setHintTextColor(0xFF6B7889);
        urlInput.setSingleLine(true);
        advancedTools.addView(urlInput, new LinearLayout.LayoutParams(-1, dp(54)));
        text(advancedTools, "聊天页地址（本机或 Tailscale HTTPS）", 14);
        uiUrlInput = new EditText(this);
        uiUrlInput.setText(config.getString("ui_url", PRIVATE_UI_URL));
        uiUrlInput.setTextSize(14);
        uiUrlInput.setTextColor(0xFF1C293A);
        uiUrlInput.setHintTextColor(0xFF6B7889);
        uiUrlInput.setSingleLine(true);
        advancedTools.addView(uiUrlInput, new LinearLayout.LayoutParams(-1, dp(52)));

        trackPicker = new Spinner(this);
        trackPicker.setBackgroundColor(0xFFFFFFFF);
        trackPicker.setAdapter(new ArrayAdapter<String>(this,
                android.R.layout.simple_spinner_dropdown_item, TRACK_LABELS) {
            @Override public View getView(int position, View convertView, ViewGroup parent) {
                TextView v = (TextView) super.getView(position, convertView, parent);
                v.setTextColor(0xFF1C293A);
                v.setTextSize(15);
                return v;
            }
            @Override public View getDropDownView(int position, View convertView, ViewGroup parent) {
                TextView v = (TextView) super.getDropDownView(position, convertView, parent);
                v.setTextColor(0xFF1C293A);
                v.setTextSize(15);
                return v;
            }
        });
        advancedTools.addView(trackPicker, new LinearLayout.LayoutParams(-1, dp(58)));

        text(advancedTools, "原文归档接收端（只存本机；令牌不写入日志）", 15);
        archiveUrlInput = new EditText(this);
        archiveUrlInput.setText(archive.archiveUrl());
        archiveUrlInput.setTextSize(14);
        archiveUrlInput.setTextColor(0xFF1C293A);
        archiveUrlInput.setHintTextColor(0xFF6B7889);
        archiveUrlInput.setSingleLine(true);
        advancedTools.addView(archiveUrlInput, new LinearLayout.LayoutParams(-1, dp(52)));
        archiveTokenInput = new EditText(this);
        archiveTokenInput.setText(archive.token());
        archiveTokenInput.setHint("归档令牌（只存本机）");
        archiveTokenInput.setTextSize(14);
        archiveTokenInput.setTextColor(0xFF1C293A);
        archiveTokenInput.setHintTextColor(0xFF6B7889);
        archiveTokenInput.setSingleLine(true);
        archiveTokenInput.setInputType(android.text.InputType.TYPE_CLASS_TEXT
                | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
        advancedTools.addView(archiveTokenInput, new LinearLayout.LayoutParams(-1, dp(52)));
        button(advancedTools, "立即重试导出", v -> {
            if (archiveUrlInput != null) archive.setArchiveUrl(archiveUrlInput.getText().toString());
            if (archiveTokenInput != null) archive.setToken(archiveTokenInput.getText().toString());
            archive.flushAsync(this::setArchiveStatus);
        });
        deviceInfo = text(advancedTools, "输入设备待读取", 14);
        startButton = button(recordingCard, "开始实时对话", v -> startStreaming());
        stylePrimary(startButton);
        button(recordingCard, "查看聊天与推荐", v -> showSocialMatePanel());
        stopButton = button(recordingCard, "停止录音", v -> stopStreaming("用户停止"));
        stopButton.setEnabled(false);
        // 停止录音后的入口：本机归档原文 → 会后复盘 → 逐条确认后写档案。
        reviewButton = button(recordingCard, "本轮原文与复盘", v -> openReview());
        reviewButton.setEnabled(false);
        clearButton = button(advancedTools, "清空转写", v -> {
            finals.setLength(0);
            transcript.setText("");
            live.setText("");
        });

        status = text(recordingCard, "状态：待连接", 17);
        archiveStatusView = text(recordingCard, archive.describe(), 14);
        archiveStatusView.setLineSpacing(dp(2), 1f);
        live = text(advancedTools, "实时（未定稿）：—", 17);
        text(advancedTools, "已定稿转写（按句累积，不会被实时结果覆盖）", 15);
        transcript = new TextView(this);
        transcript.setTextSize(17);
        transcript.setPadding(0, dp(6), 0, dp(6));
        advancedTools.addView(transcript);

        text(advancedTools, "手动语料检索（备用调试功能）", 15);
        suggestInput = new EditText(this);
        suggestInput.setTextSize(16);
        suggestInput.setSingleLine(true);
        suggestInput.setHint("输入话题，可留空以使用最近一句定稿");
        advancedTools.addView(suggestInput, new LinearLayout.LayoutParams(-1, dp(54)));
        button(advancedTools, "填入示例话题（personality quiz）",
                v -> suggestInput.setText("personality quiz"));
        suggestButton = button(advancedTools, "获取 2–3 条英文建议", v -> requestSuggestions());
        suggestButton.setEnabled(false);
        suggestionsView = text(advancedTools, "英文建议：—", 16);

        text(advancedTools, "诊断说明：A/B 轨需硬件真正输出独立声道；混音说话人识别不保证身份准确。MOCK 事件不是实际腾讯云识别。", 14);
    }

    /**
     * Local-only Android integration of the approved HTML UI.
     * Same Activity stays foreground; AudioRecord worker continues while WebView is shown.
     * Requires adb reverse for BOTH tcp:8790 (ASR) and tcp:8791 (private UI).
     */
    private void showSocialMatePanel() {
        if (screenRoot == null) return;
        if (webPanel == null) {
            webPanel = new LinearLayout(this);
            webPanel.setOrientation(LinearLayout.VERTICAL);
            webPanel.setBackgroundColor(0xFFFFFFFF);
            applyWebInsets(webPanel); // 顶栏避开状态栏，底部同时避开导航栏与软键盘。

            LinearLayout toolbar = new LinearLayout(this);
            toolbar.setOrientation(LinearLayout.HORIZONTAL);
            Button back = new Button(this);
            back.setText("← 录音控制");
            back.setTextSize(16);
            back.setAllCaps(false);
            back.setOnClickListener(v -> webPanel.setVisibility(View.GONE));
            toolbar.addView(back, new LinearLayout.LayoutParams(0, dp(52), 1f));
            Button retry = new Button(this);
            retry.setText("刷新界面");
            retry.setTextSize(16);
            retry.setAllCaps(false);
            retry.setOnClickListener(v -> {
                if (socialMateWebView != null) socialMateWebView.reload();
            });
            toolbar.addView(retry, new LinearLayout.LayoutParams(0, dp(52), 1f));
            Button stopInChat = new Button(this);
            stopInChat.setText("停止录音");
            stopInChat.setTextSize(15);
            stopInChat.setAllCaps(false);
            stopInChat.setOnClickListener(v -> stopStreaming("用户停止"));
            toolbar.addView(stopInChat, new LinearLayout.LayoutParams(0, dp(52), 1f));
            stopInChat.setTextColor(0xFF9C3434);
            webPanel.addView(toolbar, new LinearLayout.LayoutParams(-1, dp(52)));

            // 导出结果的中文提示条（深色字 + 浅底，深色模式下依然可读）。
            webHint = new TextView(this);
            webHint.setTextSize(13);
            webHint.setTextColor(0xFF1C293A);
            webHint.setBackgroundColor(0xFFF5F7F8);
            webHint.setPadding(dp(14), dp(8), dp(14), dp(8));
            webHint.setText("导出：文件会保存到你选择的目录（不需要存储权限）。");
            webPanel.addView(webHint, new LinearLayout.LayoutParams(-1, -2));

            socialMateWebView = new WebView(this);
            WebSettings settings = socialMateWebView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(false);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            // 只在私有 origin 可用的导出桥；其他 origin 既不注入也直接返回 false。
            socialMateWebView.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri uri = request.getUrl();
                    if (isPrivatePanelUrl(uri)) return false;
                    // Maps/share links open in the device's normal browser; not an untrusted WebView.
                    if ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme())) {
                        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                        catch (Exception ignored) { }
                    }
                    return true;
                }

                @Override public void onPageFinished(WebView view, String url) {
                    super.onPageFinished(view, url);
                    Uri parsed = url == null ? null : Uri.parse(url);
                    if (isPrivatePanelUrl(parsed)) {
                        trustedPageUrl = url;
                        attachSaveBridge(true);
                    } else {
                        trustedPageUrl = null;
                        attachSaveBridge(false);
                    }
                }
            });
            socialMateWebView.setDownloadListener(new DownloadListener() {
                @Override public void onDownloadStart(String url, String userAgent,
                                                      String contentDisposition, String mimeType, long contentLength) {
                    handleWebDownload(url, contentDisposition);
                }
            });
            attachSaveBridge(true);
            webPanel.addView(socialMateWebView, new LinearLayout.LayoutParams(-1, 0, 1f));
            screenRoot.addView(webPanel, new FrameLayout.LayoutParams(-1, -1));
            socialMateWebView.loadUrl(privateUiUrl());
        }
        webPanel.setVisibility(View.VISIBLE);
        if (socialMateWebView != null) {
            socialMateWebView.onResume();
            // If the panel was opened manually before recording, switch it to live mode now.
            String current = socialMateWebView.getUrl();
            if (running && (current == null || !current.contains("live=1"))) {
                socialMateWebView.loadUrl(privateUiUrl());
            }
        }
    }

    /** 配置的聊天页基地址；默认本机，可改为 Tailscale HTTPS。 */
    private String privateUiBase() {
        String value = config.getString("ui_url", PRIVATE_UI_URL);
        if (value == null) value = PRIVATE_UI_URL;
        value = value.trim();
        while (value.endsWith("/")) value = value.substring(0, value.length() - 1);
        if (value.endsWith("/v12")) value = value.substring(0, value.length() - 4);
        return value;
    }

    /** Recording start passes live=1 so the page auto-opens a session and reconnects subtitles after refresh. */
    private String privateUiUrl() {
        return privateUiBase() + "/v12" + (running ? "?live=1" : "");
    }

    /**
     * 停止录音后的入口：打开本机归档里这一轮的原文与复盘页。
     * 复用同一个 WebView，不新增底部一级 Tab；原文尚未上传时先重试上传再放行。
     */
    private void openReview() {
        String id = archive.lastSessionId();
        if (id == null || id.isEmpty()) {
            status.setText("本轮没有可复盘的内容（未开启原文留存，或没有定稿句子）。");
            return;
        }
        if (!archive.isExported(id)) {
            status.setText("本轮原文还没上传到 Mac，正在重试上传…");
            archive.flushAsync(text -> {
                setArchiveStatus(text);
                runOnUiThread(this::updateReviewEntry);
            });
            return;
        }
        showSocialMatePanel();
        if (socialMateWebView != null) {
            socialMateWebView.loadUrl(privateUiBase() + "/v12/history?session=" + Uri.encode(id));
        }
    }

    /** 复盘入口只在「本轮有留存内容且已停止」时可用，避免让用户点进空会话。 */
    private void updateReviewEntry() {
        if (reviewButton == null) return;
        String id = archive.lastSessionId();
        boolean has = id != null && !id.isEmpty();
        boolean exported = has && archive.isExported(id);
        reviewButton.setEnabled(has && !running);
        reviewButton.setText(exported || !has ? "本轮原文与复盘" : "本轮原文与复盘（待上传）");
    }

    /** 只允许停留在配置的同一 origin；其他链接交给系统浏览器。 */
    private boolean isPrivatePanelUrl(Uri uri) {
        if (uri == null) return false;
        try {
            Uri base = Uri.parse(privateUiBase());
            return uri.getScheme() != null && base.getScheme() != null
                    && uri.getScheme().equalsIgnoreCase(base.getScheme())
                    && uri.getHost() != null && base.getHost() != null
                    && uri.getHost().equalsIgnoreCase(base.getHost())
                    && uri.getPort() == base.getPort();
        } catch (Exception e) {
            return false;
        }
    }

    /** 注入导出桥；非私有 origin 一律撤掉（fail closed）。 */
    private void attachSaveBridge(boolean allow) {
        if (socialMateWebView == null) return;
        if (allow) {
            if (bridgeAttached) return;
            socialMateWebView.addJavascriptInterface(new SaveTextBridge(), BRIDGE_NAME);
            bridgeAttached = true;
        } else if (bridgeAttached) {
            socialMateWebView.removeJavascriptInterface(BRIDGE_NAME);
            bridgeAttached = false;
        }
    }

    /**
     * 前端 window.SocialMateAndroid.saveText(filename, text)。
     * 返回 true＝已受理（随后请用户选保存位置）；false＝拒绝（非白名单 origin 或参数不合法）。
     * 不使用 WRITE_EXTERNAL_STORAGE，全部走 SAF，由用户决定落地位置。
     */
    private final class SaveTextBridge {
        @JavascriptInterface
        public boolean saveText(String filename, String text) {
            // 注意：@JavascriptInterface 运行在 JavaBridge 线程，绝不能碰 WebView 的任何方法。
            // 这里只读主线缓存下来的「已确认可信」页面地址做 origin 校验。
            String page = trustedPageUrl;
            if (page == null || !isPrivatePanelUrl(Uri.parse(page))) return false;
            if (text == null || text.isEmpty()) return false;
            final String name = safeFileName(filename);
            final String body = text;
            runOnUiThread(() -> requestSaveText(name, body));
            return true;
        }
    }

    private void handleWebDownload(String url, String contentDisposition) {
        if (url == null || url.isEmpty()) {
            setExportStatus("下载失败：链接为空");
            return;
        }
        String pageUrl = socialMateWebView == null ? null : socialMateWebView.getUrl();
        if (!isPrivatePanelUrl(pageUrl == null ? null : Uri.parse(pageUrl))) {
            setExportStatus("已拒绝下载：当前页面不是本机私有界面");
            return;
        }
        String name = safeFileName(filenameFromDisposition(contentDisposition, url));
        if (name == null) name = "SocialMate-导出.md";
        if (url.startsWith("blob:")) {
            setExportStatus("正在读取网页内容…");
            // Fetch the blob inside the page and hand the bytes to the SAF bridge (no file:// tricks).
            String js = "(function(){try{fetch(" + JSONObject.quote(url) + ")"
                    + ".then(function(r){return r.text()})"
                    + ".then(function(t){try{window." + BRIDGE_NAME + ".saveText("
                    + JSONObject.quote(name) + ",t)}catch(e){}});}catch(e){}})();";
            socialMateWebView.evaluateJavascript(js, null);
            return;
        }
        if (url.startsWith("data:")) {
            try {
                int comma = url.indexOf(',');
                if (comma < 0) throw new IllegalArgumentException("数据链接格式不正确");
                String meta = url.substring(5, comma);
                String payload = url.substring(comma + 1);
                String text = meta.endsWith(";base64")
                        ? new String(android.util.Base64.decode(payload, android.util.Base64.DEFAULT),
                        java.nio.charset.StandardCharsets.UTF_8)
                        : Uri.decode(payload);
                requestSaveText(name, text);
            } catch (Exception e) {
                setExportStatus("保存失败：" + (e.getMessage() == null ? "数据链接无法解析" : e.getMessage()));
            }
            return;
        }
        if (url.startsWith("http://") || url.startsWith("https://")) {
            // 交给系统浏览器/下载器处理，自己绝不申请全盘存储权限。
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                setExportStatus("已交给系统浏览器下载：" + name);
            } catch (Exception e) {
                setExportStatus("没有可用的下载器，请长按复制文本");
            }
            return;
        }
        setExportStatus("这种链接暂不支持直接保存");
    }

    private void requestSaveText(String name, String body) {
        if (name == null || name.isEmpty()) name = "SocialMate-导出.md";
        if (isFinishing()) {
            setExportStatus("保存失败：界面已关闭");
            return;
        }
        pendingSaveName = name;
        pendingSaveText = body;
        try {
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            // MIME 要与扩展名一致，否则 DocumentsUI 会给你加个 .txt 后缀。
            intent.setType(mimeForName(name));
            intent.putExtra(Intent.EXTRA_TITLE, name);
            startActivityForResult(intent, REQUEST_SAVE_TEXT);
            setExportStatus("请选择保存位置：" + name);
        } catch (Exception e) {
            pendingSaveName = null;
            pendingSaveText = null;
            setExportStatus("保存失败：本机没有可用的文件选择器");
        }
    }

    private void setExportStatus(String text) {
        if (webHint != null) {
            webHint.setTextColor(0xFF1C293A);
            webHint.setText(text);
        }
        if (status != null && !running) status.setText(text);
    }

    private static String mimeForName(String name) {
        String lower = name == null ? "" : name.toLowerCase(Locale.US);
        if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "text/markdown";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".csv")) return "text/csv";
        return "text/plain";
    }

    /** 去掉路径分隔符与控制字符，避免写坏文件名。 */
    private static String safeFileName(String raw) {        if (raw == null) return null;
        String value = raw.trim().replaceAll("[\\\\/:*?\"<>|\\r\\n\\t]", "_");
        while (value.startsWith(".")) value = value.substring(1);
        if (value.length() > 80) value = value.substring(0, 80);
        return value.isEmpty() ? null : value;
    }

    private static String filenameFromDisposition(String disposition, String url) {
        if (disposition != null) {
            int mark = disposition.toLowerCase(Locale.US).indexOf("filename=");
            if (mark >= 0) {
                String value = disposition.substring(mark + "filename=".length()).trim();
                if (value.startsWith("\"") && value.length() > 1) {
                    int end = value.indexOf('"', 1);
                    value = end > 0 ? value.substring(1, end) : value.substring(1);
                } else {
                    int semi = value.indexOf(';');
                    if (semi > 0) value = value.substring(0, semi);
                }
                if (!value.trim().isEmpty()) return value.trim();
            }
        }
        try {
            String path = Uri.parse(url).getLastPathSegment();
            if (path != null && !path.trim().isEmpty()) return path.trim();
        } catch (Exception ignored) {
        }
        return "SocialMate-导出.md";
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_SAVE_TEXT) return;
        String name = pendingSaveName;
        String body = pendingSaveText;
        pendingSaveName = null;
        pendingSaveText = null;
        String label = name == null ? "导出文件" : name;
        if (resultCode != RESULT_OK || data == null || data.getData() == null) {
            setExportStatus("已取消保存：" + label);
            return;
        }
        Uri target = data.getData();
        try (java.io.OutputStream out = getContentResolver().openOutputStream(target, "wt")) {
            if (out == null) throw new java.io.IOException("无法写入目标文件");
            out.write((body == null ? "" : body).getBytes(java.nio.charset.StandardCharsets.UTF_8));
            out.flush();
            setExportStatus("已保存到手机：" + label);
        } catch (Exception e) {
            setExportStatus("保存失败：" + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
        }
    }

    @Override public void onBackPressed() {
        if (webPanel != null && webPanel.getVisibility() == View.VISIBLE) {
            webPanel.setVisibility(View.GONE);
            return;
        }
        super.onBackPressed();
    }

    private String appVersion() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "未知";
        }
    }

    private void refreshDeviceInfo() {
        AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
        AudioDeviceInfo usb = AudioInputs.preferredUsb(am);
        if (usb == null) {
            deviceInfo.setText("未发现 USB 音频输入：将使用系统默认麦克风。双麦验证请先插好博雅接收器。");
        } else {
            deviceInfo.setText("输入： " + AudioInputs.describe(usb) + "\n声明声道/采样率： "
                    + numbers(usb.getChannelCounts()) + " / " + numbers(usb.getSampleRates())
                    + "\n点「开始实时对话」时才会打开麦克风。");
        }
    }

    private static String numbers(int[] values) {
        if (values == null || values.length == 0) return "未声明";
        StringBuilder b = new StringBuilder();
        for (int v : values) {
            if (b.length() > 0) b.append(",");
            b.append(v);
        }
        return b.toString();
    }

    private void startStreaming() {
        if (running) return;
        if (recordingConsent == null || !recordingConsent.isChecked()) {
            status.setText("请在开启录音前先确认已获得同行者的录音同意。");
            return;
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_MIC);
            return;
        }
        String base = urlInput.getText().toString().trim();
        config.edit().putString("asr_url", base)
                .putString("ui_url", uiUrlInput == null ? PRIVATE_UI_URL : uiUrlInput.getText().toString().trim())
                .apply();
        if (!base.startsWith("ws://") && !base.startsWith("wss://")) {
            status.setText("服务端地址必须以 ws:// 或 wss:// 开头");
            return;
        }
        String clean = base;
        int q = clean.indexOf('?');
        if (q >= 0) clean = clean.substring(0, q);
        while (clean.endsWith("/")) clean = clean.substring(0, clean.length() - 1);

        int mode = trackPicker.getSelectedItemPosition();
        boolean dual = mode == 3;
        String[] tracks = dual ? new String[]{"A", "B"}
                : new String[]{mode == 0 ? "mix" : (mode == 1 ? "A" : "B")};

        if (archiveUrlInput != null) archive.setArchiveUrl(archiveUrlInput.getText().toString());
        if (archiveTokenInput != null) archive.setToken(archiveTokenInput.getText().toString());
        // 只认「原文留存」复选框；录音权限本身不代表同意留存。
        archive.begin(retentionConsent != null && retentionConsent.isChecked(), appVersion());
        setArchiveStatus(archive.describe());
        running = true;
        refreshRetentionHint();
        eventCount = 0;
        lastFinal = "";
        suggestionsView.setText("英文建议：—");
        suggestButton.setEnabled(false);
        startButton.setEnabled(false);
        stopButton.setEnabled(true);
        if (reviewButton != null) {
            reviewButton.setEnabled(false);
            reviewButton.setText("本轮原文与复盘");
        }
        urlInput.setEnabled(false);
        trackPicker.setEnabled(false);
        status.setText("正在打开麦克风并连接服务端…");
        // Same foreground Activity: show the approved UI immediately after recording starts.
        showSocialMatePanel();
        if (finals.length() > 0) finals.append("\n— 新会话 —\n");
        transcript.setText(finals.toString());

        final String baseUrl = clean;
        final String[] useTracks = tracks;
        Thread t = new Thread(() -> stream(baseUrl, useTracks), "asr-stream");
        worker = t;
        t.start();
    }

    private void stream(String baseUrl, String[] tracks) {
        AudioRecord rec = null;
        try {
            AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
            AudioDeviceInfo usb = AudioInputs.preferredUsb(am);
            rec = AudioInputs.open(usb);
            recorder = rec;
            int rate = rec.getSampleRate();
            int channels = rec.getChannelCount();
            String suffix = "?rate=" + rate + "&channels=" + channels;
            ArrayList<AsrClient> opened = new ArrayList<>();
            for (String track : tracks) {
                URI uri = new URI(baseUrl + suffix + "&track=" + track);
                AsrClient client = new AsrClient(uri, track, this);
                clients.add(client);
                opened.add(client);
                if (!client.awaitOpen()) throw new Exception("无法连接 " + uri + "（检查服务端与 adb reverse）");
            }
            sessionStartMs = SystemClock.elapsedRealtime();
            runOnUiThread(() -> {
                status.setText("已连接 · " + rate + " Hz · " + channels + " 声道 · 正在发送音频（"
                        + String.join("+", tracks) + "）");
                suggestButton.setEnabled(true);
            });
            rec.startRecording();
            if (rec.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING)
                throw new Exception("startRecording 未启动");
            int frameBytes = rate / 10 * channels * 2;
            byte[] buffer = new byte[frameBytes];
            while (running) {
                int got = rec.read(buffer, 0, buffer.length, AudioRecord.READ_BLOCKING);
                if (got < 0) {
                    if (!running) break;
                    throw new Exception("音频读取失败：" + got);
                }
                int whole = got - got % (channels * 2);
                if (whole == 0) continue;
                byte[] frame = whole == buffer.length ? buffer : java.util.Arrays.copyOf(buffer, whole);
                synchronized (clients) {
                    for (AsrClient client : clients) client.sendPcm(frame);
                }
            }
        } catch (Exception e) {
            String msg = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            runOnUiThread(() -> status.setText("连接/录音失败：" + msg));
            appendLine("[错误] " + msg);
        } finally {
            running = false;
            if (rec != null) {
                try {
                    if (rec.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) rec.stop();
                } catch (IllegalStateException ignored) {}
                rec.release();
            }
            recorder = null;
            synchronized (clients) {
                for (AsrClient client : clients) client.finish();
            }
            if (!clients.isEmpty()) {
                try { Thread.sleep(1500); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
            }
            synchronized (clients) {
                for (AsrClient client : clients) {
                    try { client.closeBlocking(); } catch (Exception ignored) {}
                }
                clients.clear();
            }
            archive.end();
            runOnUiThread(() -> {
                setArchiveStatus(archive.describe());
                updateReviewEntry();
            });
            archive.flushAsync(text -> {
                setArchiveStatus(text);
                updateReviewEntry();
            });
            runOnUiThread(() -> {
                startButton.setEnabled(true);
                stopButton.setEnabled(false);
                if (recordingConsent != null) recordingConsent.setChecked(false);
                suggestButton.setEnabled(false);
                urlInput.setEnabled(true);
                trackPicker.setEnabled(true);
                live.setText("实时（未定稿）：—");
                refreshRetentionHint();
                if (!status.getText().toString().startsWith("连接/录音失败"))
                    status.setText("状态：已停止 · 收到事件 " + eventCount + " 条"
                            + (archive.lastSessionId() == null ? "" : " · 可点「本轮原文与复盘」"));
                updateReviewEntry();
            });
        }
    }

    private void stopStreaming(String reason) {
        if (!running) return;
        running = false;
        status.setText("正在停止…（" + reason + "）");
        AudioRecord r = recorder;
        if (r != null) {
            try { r.stop(); } catch (IllegalStateException ignored) {}
        }
    }

    @Override public void onRequestPermissionsResult(int code, String[] names, int[] results) {
        super.onRequestPermissionsResult(code, names, results);
        if (code == REQUEST_MIC && results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            startStreaming();
        } else if (code == REQUEST_MIC) {
            status.setText("没有麦克风权限，无法识别。");
        }
    }

    @Override public void onAsrState(AsrClient client, String state) {
        runOnUiThread(() -> {
            if (state.startsWith("error")) appendLine("[" + client.label() + "] " + state);
            else if (state.equals("connected") && eventCount == 0) status.setText("已连接（" + client.label() + "），等待音频事件…");
        });
    }

    @Override public void onAsrEvent(AsrClient client, JSONObject event) {
        String type = event.optString("type", "");
        if ("session".equals(type)) {
            String s = event.optString("status", "");
            if ("error".equals(s) || "ended".equals(s)) {
                appendLine("[会话] " + s + (event.has("message") ? "：" + event.optString("message") : ""));
            }
            return;
        }
        if ("error".equals(type)) {
            appendLine("[错误] " + event.optString("text", event.optString("message", "unknown")));
            return;
        }
        if ("suggestions".equals(type)) {
            renderSuggestions(event);
            return;
        }
        if (!"interim".equals(type) && !"final".equals(type)) return;
        eventCount++;
        if ("final".equals(type)) {
            archive.addFinal(
                    event.optString("text", ""),
                    (long) event.optDouble("startMs", 0),
                    (long) event.optDouble("endMs", 0),
                    event.optString("speaker", ""),
                    client.label(),
                    event.optString("provider", "tencent"),
                    event.optBoolean("mock", false));
        }
        String line = format(event);
        runOnUiThread(() -> {
            if ("interim".equals(type)) {
                live.setText("实时（未定稿）：" + line);
            } else {
                live.setText("实时（未定稿）：—");
                finals.append(line).append('\n');
                transcript.setText(finals.toString());
                String finalText = event.optString("text", "").trim();
                if (!finalText.isEmpty() && !event.optBoolean("mock", false)) lastFinal = finalText;
                // 每条 final 落盘后立刻刷新「手机已保存 N 条 / 待上传 N 条」。
                setArchiveStatus(archive.describe());
            }
        });
    }

    private void requestSuggestions() {
        if (!running) {
            status.setText("请先连接并开始识别");
            return;
        }
        String topic = suggestInput.getText().toString().trim();
        if (topic.isEmpty()) topic = lastFinal;
        if (topic.isEmpty()) {
            suggestionsView.setText("请先输入一个话题，或等一句定稿转写。");
            return;
        }
        AsrClient target;
        synchronized (clients) {
            target = clients.isEmpty() ? null : clients.get(0);
        }
        if (target == null) {
            suggestionsView.setText("连接尚未就绪。");
            return;
        }
        suggestionsView.setText("正在检索 V1.4 / 海南 115 地点…");
        target.sendSuggest(topic, 3);
    }

    private void renderSuggestions(JSONObject event) {
        JSONArray array = event.optJSONArray("suggestions");
        if (array == null || array.length() == 0) {
            runOnUiThread(() -> suggestionsView.setText("没有匹配的正式语料；请换一个话题。"));
            return;
        }
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < array.length(); i++) {
            JSONObject item = array.optJSONObject(i);
            if (item == null) continue;
            builder.append(i + 1).append(". [")
                    .append(item.optString("ref", "")).append(" · ")
                    .append(item.optString("title", "")).append("] ")
                    .append(item.optString("text", "")).append('\n');
        }
        builder.append("来源：V1.4 / 海南 115 / 已确认故事；确定性检索，不是大模型。");
        String text = builder.toString();
        runOnUiThread(() -> suggestionsView.setText(text));
    }

    private String format(JSONObject e) {
        StringBuilder b = new StringBuilder();
        if (e.optBoolean("mock", false)) b.append("[MOCK] ");
        String track = e.optString("track", "");
        String speaker = e.optString("speaker", "");
        if (!track.isEmpty()) b.append(track);
        if (!speaker.isEmpty() && !speaker.equals(track)) b.append('/').append(speaker);
        if (b.length() > 0) b.append("  ");
        double s = e.optDouble("startMs", -1);
        double t = e.optDouble("endMs", -1);
        if (s >= 0 && t >= 0) b.append(String.format(Locale.US, "%.1f–%.1f s  ", s / 1000, t / 1000));
        b.append(e.optString("text", ""));
        return b.toString();
    }

    private void appendLine(String line) {
        runOnUiThread(() -> {
            finals.append(line).append('\n');
            transcript.setText(finals.toString());
        });
    }

    @Override protected void onStop() {
        super.onStop();
        // No foreground service: background capture is deliberately impossible.
        stopStreaming("切到后台");
    }

    @Override protected void onDestroy() {
        running = false;
        unregisterNetworkRecovery();
        if (archive != null) archive.setListener(null);
        pendingSaveName = null;
        pendingSaveText = null;
        if (socialMateWebView != null) {
            if (bridgeAttached) {
                socialMateWebView.removeJavascriptInterface(BRIDGE_NAME);
                bridgeAttached = false;
            }
            socialMateWebView.stopLoading();
            ViewGroup parent = (ViewGroup) socialMateWebView.getParent();
            if (parent != null) parent.removeView(socialMateWebView);
            socialMateWebView.destroy();
            socialMateWebView = null;
        }
        super.onDestroy();
    }
}
