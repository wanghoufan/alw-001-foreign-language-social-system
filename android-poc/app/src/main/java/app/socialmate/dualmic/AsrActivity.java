package app.socialmate.dualmic;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
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
import android.os.Looper;
import android.os.SystemClock;
import android.provider.MediaStore;
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

import app.socialmate.dualmic.local.CloudKeys;
import app.socialmate.dualmic.local.DirectCloud;
import app.socialmate.dualmic.local.LocalBackup;
import app.socialmate.dualmic.local.LocalServer;
import app.socialmate.dualmic.local.LocalStore;
import app.socialmate.dualmic.local.LocalSync;

import java.net.URI;
import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Foreground-only ASR streamer. Sends PCM16 to the local bridge and renders its JSON events.
 * The phone never sees SecretId/SecretKey; without server credentials the bridge replies MOCK.
 */
public final class AsrActivity extends Activity implements AsrClient.Listener {
    private static final int REQUEST_MIC = 201;
    private static final int REQUEST_SAVE_TEXT = 202;
    private static final int REQUEST_EXPORT_BACKUP = 203;
    private static final int REQUEST_IMPORT_BACKUP = 204;
    private static final int REQUEST_CAPTURE_PHOTO = 205;
    private static final String DEFAULT_URL = "ws://127.0.0.1:8790/asr";
    private static final String PRIVATE_UI_URL = "http://127.0.0.1:8791/v12";
    private static final String LOCAL_ARCHIVE_URL = "http://127.0.0.1:8781/api/archive/session";
    /* T4 外出模式：Tailscale 私有入口（tailnet only，不是公网域名；无 HTTP 明文）。 */
    private static final String TRAVEL_ASR_URL = "wss://mac-mini.tail4e4317.ts.net:10000/asr";
    private static final String TRAVEL_UI_URL = "http://100.125.100.15:8791/v12";
    private static final String TRAVEL_ARCHIVE_URL = "https://mac-mini.tail4e4317.ts.net/alw/api/archive/session";
    /** T4 只读降级的本地快照（成功加载在线界面时刷新；离线时读它渲染）。 */
    private static final String OFFLINE_DIR = "offline";
    private static final String OFFLINE_SNAPSHOT = "snapshot.json";
    private static final String BRIDGE_NAME = "SocialMateAndroid";
    /** S4：原生 TextToSpeech 桥。与导出桥同步挂载/撤销，只对私有 origin 生效。 */
    private static final String TTS_BRIDGE_NAME = "SocialMateTts";
    /** N05 V1.3：网页 → logcat 的播放队列时间线通道（只允许私有页面）。 */
    private static final String JS_LOG_BRIDGE_NAME = "SocialMateLog";

    private final List<AsrClient> clients = Collections.synchronizedList(new ArrayList<>());
    /** 每个 track 同一时刻只允许一个重连线程，避免断线抖动时建立多条重复会话。 */
    private final java.util.Set<String> reconnecting = java.util.Collections.synchronizedSet(new java.util.HashSet<>());
    /**
     * T6：本轮 ASR 上游「会话已结束」信号。初值 = 本轮 tracks 数量（最少 1），
     * onAsrEvent 每收到一条 type=session/status=ended 就 countDown；停止流程最多等 3s。
     */
    private volatile CountDownLatch asrEndedLatch;
    /** 只有用户/上限主动停止后，session/ended 才能放行收尾；中途 VAD 自动结束不算本轮结束。 */
    private volatile boolean stopRequested = false;
    /** 断线重连窗口内保留最近 2 秒音频（20×100ms），重连成功后补发，避免整段对话缺字。 */
    private static final int RECONNECT_BUFFER_FRAMES = 20;
    private final java.util.Map<String, java.util.ArrayDeque<byte[]>> reconnectBuffers =
            new java.util.concurrent.ConcurrentHashMap<>();
    /** 同一 client 可能重复上报 ended，按对象身份去重，避免提前放行。 */
    private final java.util.Set<AsrClient> asrEndedClients =
            java.util.Collections.synchronizedSet(java.util.Collections.newSetFromMap(new IdentityHashMap<>()));
    private volatile String asrLink = "";
    private final StringBuilder finals = new StringBuilder();
    private volatile boolean running;
    private volatile AudioRecord recorder;
    private Thread worker;
    private FrameLayout screenRoot;
    private LinearLayout webPanel;
    /** 面板文案双语：setLanguage 由网页调用后立刻生效。 */
    private boolean uiEn = false;
    private final java.util.List<Object[]> langPairs = new java.util.ArrayList<>();
    private void reg(TextView tv, String zh, String en) { langPairs.add(new Object[]{tv, zh, en}); }
    private String L(String zh, String en) { return uiEn ? en : zh; }
    private void applySheetLanguage() {
        for (Object[] pair : langPairs) {
            TextView tv = (TextView) pair[0];
            tv.setText(uiEn ? (String) pair[2] : (String) pair[1]);
        }
        if (titleView != null) titleView.setText(L("开始录音", "Start recording"));
        if (startButton != null) startButton.setText(L("开始录音", "Record"));
        try { refreshRetentionHint(); } catch (Exception ignored) { }
    }
    private TextView titleView;

    /** 录音底部面板与其遮罩。 */
    private LinearLayout sheet;
    private View sheetScrim;
    private LinearLayout advancedTools;
    private WebView socialMateWebView;
    /** V1.6 图片上传：网页 <input type="file"> 的系统选择器回调（仅相册/文档，不接管其它 JS 对话框）。 */
    private ValueCallback<Uri[]> fileChooserCallback;
    private static final int REQUEST_FILE_CHOOSER = 4102;
    private CheckBox recordingConsent;
    private EditText urlInput;
    private EditText suggestInput;
    private Spinner trackPicker;
    private Button startButton, clearButton, suggestButton;
    private TextView stopButton, reviewButton;
    private TextView status, live, transcript, deviceInfo, suggestionsView;
    private long sessionStartMs;
    private int eventCount;
    private volatile String lastFinal = "";
    private SessionArchive archive;
    private DevicePairing pairing;
    /** V1.7：手机内置本地 origin（127.0.0.1:随机端口），首屏不依赖 Mac。 */
    private LocalServer localServer;
    private volatile String localBaseUrl = "";
    /** 本地模式下的随机访问令牌，只注入页面 sessionStorage，不写盘、不进日志。 */
    private volatile String localToken = "";
    /** 加密备份口令：只在一次导出过程中驻留内存，完成后立即清空。 */
    private volatile String pendingBackupPassword = "";
    private android.net.Uri pendingCaptureUri;
    private String pendingCaptureKind = "";
    private String pendingCaptureCardId = "";
    private CheckBox retentionConsent;
    private TextView archiveStatusView;
    private TextView retentionHint;
    private TextView webHint;
    private EditText archiveUrlInput, uiUrlInput, pairCodeInput;
    private TextView pairingStatus;
    private SharedPreferences config;
    private ConnectivityManager.NetworkCallback networkCallback;
    /** 待保存的导出文本（SAF 回调时才真正写盘）。 */
    private String pendingSaveName, pendingSaveText;
    private boolean bridgeAttached;
    private boolean ttsBridgeAttached;
    private boolean jsLogBridgeAttached;
    /** S4 原生 TTS 控制器（中英分 voice、句级队列、本地进度）。 */
    private TtsPlaybackController ttsController;
    private boolean tokenWarming;
    /** 本次导航是否已经发生过主框架加载错误：一旦失败，本页绝不挂桥。 */
    private volatile boolean pageLoadFailed;
    /** 主线维护的「当前可信页面地址」；JavaBridge 线程只读它，不直接调用 WebView。 */
    private volatile String trustedPageUrl;
    /** T4 只读降级面板：服务不可达时替代白屏，永远只读。 */
    private ScrollView offlinePanel;
    private TextView offlineBody;
    private TextView modeHint;
    private String offlineReason = "";

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
    uiEn = config.getBoolean("ui_en", false);
        pairing = new DevicePairing(this);
        archive = new SessionArchive(this);
        archive.setListener(this::setArchiveStatus);
        // 上传令牌不再是编译期常量：没有配对就取不到令牌，flushAsync 直接 fail closed。
        archive.setTokenProvider(this::currentAccessToken);
        // 401（短期令牌过期）只刷新一次再重试一次；403 撤销不刷新。
        archive.setTokenRefresher(() -> {
            DevicePairing target = pairing;
            return target == null ? "" : target.refreshToken(privateUiBase(), line -> { });
        });
        // S4：原生 TTS 必须在主线程创建；页面加载前先 init，用户点朗读时已就绪。
        // V1.4：控制器改为进程内单例（TtsPlaybackService 持有），本页只是使用者——
        // 否则后台队列与页面各有一台引擎，熄屏后会互相打断。
        ttsController = TtsPlaybackService.controller(this);
        ttsController.ensureReady();
        // V1.7：先把本机 origin 起来。页面、数据、图片都从这里出，Mac 是否可达不再阻塞首屏。
        startLocalOrigin();
        showConnectingUi();
        // 首屏不等待网络：立刻构建五 Tab 主界面。
        buildUi();
        refreshDeviceInfo();
        registerNetworkRecovery();
        showSocialMatePanel();
        // 冷启动/重启后 outbox 里的待传文件会自动补传（幂等键是 sessionId，重复上传不会重复归档）。
        archive.flushAsync(this::setArchiveStatus);
        // LAN 发现只用于同步/ASR 地址提示，找到后只更新地址，不再重建界面。
        new Thread(() -> {
            EndpointResolver.LanEndpoint lan = EndpointResolver.discoverLan(900);
            runOnUiThread(() -> applyAutoEndpoint(lan));
        }, "sm-lan-discovery").start();
    }

    /**
     * 启动手机内置本地 origin。失败时保持 Mac 模式（旧行为），并明确记录原因；
     * 页面永远有兜底，不会因为本地服务异常白屏。
     */
    private void startLocalOrigin() {
        try {
            // 首次升级：若用户已把迁移备份放到 files/migration/backup.json，这里导入一次。
            try {
                Object result = LocalStore.get(this).importMigrationIfPresent();
                if (result != null) android.util.Log.i("SocialMateLocal", "migration: " + result);
            } catch (Exception e) {
                android.util.Log.e("SocialMateLocal", "migration skipped: " + e.getMessage());
            }
            LocalServer server = new LocalServer(this);
            server.start();
            localServer = server;
            localBaseUrl = server.baseUrl();
            localToken = server.token();
            android.util.Log.i("SocialMateLocal", "local origin ready " + localBaseUrl);
        } catch (Exception e) {
            localServer = null;
            localBaseUrl = "";
            localToken = "";
            android.util.Log.e("SocialMateLocal", "local origin failed: " + e.getMessage());
        }
    }

    /** 发现完成前只显示一句中文状态，不暴露任何服务地址或调试控件。 */
    private void showConnectingUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFFF5F7F8);
        TextView label = new TextView(this);
        label.setText(localServer == null ? "正在连接 Mac…" : "正在打开本机资料…");
        label.setTextSize(19);
        label.setTextColor(0xFF12232E);
        label.setGravity(android.view.Gravity.CENTER);
        root.addView(label, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
    }

    private void applyAutoEndpoint(EndpointResolver.LanEndpoint lan) {
        if (lan != null) {
            // 本地模式下页面来源恒为本机 origin；这里只更新 ASR/归档地址，绝不把页面切回 Mac。
            applyEndpointValues(lan.asr, localUiMode() ? null : lan.base + "/v12", lan.archive);
        } else if (EndpointResolver.tailscaleUp()) {
            applyEndpointValues(TRAVEL_ASR_URL, localUiMode() ? null : TRAVEL_UI_URL, TRAVEL_ARCHIVE_URL);
        }
    }

    private void applyEndpointValues(String asr, String ui, String archiveUrl) {
        if (urlInput != null) urlInput.setText(asr);
        if (ui != null && uiUrlInput != null) uiUrlInput.setText(ui);
        if (archiveUrlInput != null) archiveUrlInput.setText(archiveUrl);
        if (archive != null) archive.setArchiveUrl(archiveUrl);
        SharedPreferences.Editor editor = config.edit().putString("asr_url", asr);
        if (ui != null) editor.putString("ui_url", ui);
        editor.apply();
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
                    // 网络恢复：只重载真的加载失败过的页面；ASR 半开连接由 AsrClient 探测后重连。
                    if (pageLoadFailed && socialMateWebView != null) {
                        pageLoadFailed = false;
                        runOnUiThread(() -> socialMateWebView.loadUrl(privateUiUrl()));
                    }
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
        String suffix = running ? L("（本轮录音中，改动从下一次会话生效）"," (applies from the next session)") : "";
        if (checked) {
            retentionHint.setText(L("当前：本轮原文留存已开 · 停止录音后自动导出到 Mac","Currently: transcript kept · exported to your Mac after stop") + suffix);
            retentionHint.setBackground(surface(0xFFFDF3E4, 0xFFE7CFA6, 12));
        } else {
            retentionHint.setText(L("当前：不留存（默认）· 本轮 0 条写盘、0 条上传到 Mac","Currently: not kept (default) · 0 written, 0 uploaded") + suffix);
            retentionHint.setBackground(surface(0xFFEEF4F2, 0xFFD5E4DE, 12));
        }
        retentionHint.setTextColor(0xFF1C293A);
        if (archiveStatusView != null && !running && archive != null) setArchiveStatus(archive.describe());
    }

    private int dp(int v) { return (int) (getResources().getDisplayMetrics().density * v + 0.5f); }

    private void toast(String text) {
        try {
            android.widget.Toast.makeText(this, text, android.widget.Toast.LENGTH_SHORT).show();
        } catch (Exception ignored) {
        }
    }

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
        screenRoot = new FrameLayout(this);
        setContentView(screenRoot);
        buildRecordingSheet();
    }

    /** 浅灰说明行：一句一条，不做成长说明书。 */
    private TextView hintRow(LinearLayout parent, String zh, String en) {
        String value = L(zh, en);
        TextView t = new TextView(this);
        t.setText(value);
        t.setTextSize(14);
        t.setTextColor(0xFF3C4A5A);
        t.setPadding(dp(12), dp(10), dp(12), dp(10));
        t.setBackground(surface(0xFFF3F7F6, 0, 12));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.bottomMargin = dp(8);
        parent.addView(t, lp);
        reg(t, zh, en);
        return t;
    }

    private TextView chip(LinearLayout parent, String zh, String en, int bg, int fg) {
        String value = L(zh, en);
        TextView t = new TextView(this);
        t.setText(value);
        t.setTextSize(12);
        t.setTextColor(fg);
        t.setPadding(dp(10), dp(5), dp(10), dp(5));
        t.setBackground(surface(bg, 0, 999));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
        lp.bottomMargin = dp(10);
        parent.addView(t, lp);
        reg(t, zh, en);
        return t;
    }

    /**
     * 录音 = 底部面板（sheet），不是另一个页面：
     * 主界面永远是五个 Tab，点「开始录音」才浮起这张卡，做完就收起。
     */
    private void buildRecordingSheet() {
        sheetScrim = new View(this);
        sheetScrim.setBackgroundColor(0x66000000);
        sheetScrim.setVisibility(View.GONE);
        sheetScrim.setOnClickListener(v -> hideRecordingSheet());
        screenRoot.addView(sheetScrim, new FrameLayout.LayoutParams(-1, -1));

        sheet = new LinearLayout(this);
        sheet.setOrientation(LinearLayout.VERTICAL);
        sheet.setBackground(surface(0xFFFFFFFF, 0, 26));
        sheet.setElevation(dp(18));
        sheet.setVisibility(View.GONE);
        sheet.setPadding(0, dp(8), 0, dp(10));

        View handle = new View(this);
        handle.setBackground(surface(0xFFE3E9E8, 0, 999));
        LinearLayout.LayoutParams handleLp = new LinearLayout.LayoutParams(dp(38), dp(4));
        handleLp.gravity = android.view.Gravity.CENTER_HORIZONTAL;
        handleLp.bottomMargin = dp(8);
        sheet.addView(handle, handleLp);

        LinearLayout titleRow = new LinearLayout(this);
        titleRow.setOrientation(LinearLayout.HORIZONTAL);
        titleRow.setGravity(android.view.Gravity.CENTER_VERTICAL);
        titleRow.setPadding(dp(20), dp(4), dp(12), dp(4));
        TextView title = new TextView(this);
        title.setText(L("开始录音", "Start recording"));reg(title,"开始录音", "Start recording");titleView=title;
        title.setTextSize(19);
        title.setTextColor(0xFF12232E);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        titleRow.addView(title, new LinearLayout.LayoutParams(0, -2, 1f));
        TextView close = new TextView(this);
        close.setText(L("关闭", "Close"));reg(close,"关闭","Close");
        close.setTextSize(14);
        close.setTextColor(0xFF6B7A85);
        close.setPadding(dp(12), dp(10), dp(12), dp(10));
        close.setOnClickListener(v -> hideRecordingSheet());
        titleRow.addView(close, new LinearLayout.LayoutParams(-2, -2));
        sheet.addView(titleRow, new LinearLayout.LayoutParams(-1, -2));

        ScrollView bodyScroll = new ScrollView(this);
        LinearLayout body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(20), dp(6), dp(20), dp(4));
        bodyScroll.addView(body);
        sheet.addView(bodyScroll, new LinearLayout.LayoutParams(-1, -2));

        // 一句话说清边界，代替原来的长段落
        LinearLayout chips = new LinearLayout(this);
        chips.setOrientation(LinearLayout.HORIZONTAL);
        chips.setPadding(0, dp(2), 0, dp(10));
        chip(chips, "本轮原文留存", "Kept this round", 0xFFE9F5F1, 0xFF0C7766);
        chip(chips, "云端 AI 默认不发", "Cloud off by default", 0xFFF5F1EA, 0xFF7A5A2E);
        body.addView(chips, new LinearLayout.LayoutParams(-1, -2));

        retentionConsent = new CheckBox(this);
        retentionConsent.setText(L("本轮保存原文，停止后自动同步到我的 Mac","Keep this transcript and sync to my Mac"));reg(retentionConsent,"本轮保存原文，停止后自动同步到我的 Mac","Keep this transcript and sync to my Mac");
        retentionConsent.setTextSize(15);
        retentionConsent.setTextColor(0xFF12232E);
        retentionConsent.setChecked(true);
        retentionConsent.setPadding(0, dp(8), 0, dp(2));
        body.addView(retentionConsent, new LinearLayout.LayoutParams(-1, -2));
        retentionHint = new TextView(this);
        retentionHint.setTextSize(13);
        retentionHint.setTextColor(0xFF3C4A5A);
        retentionHint.setPadding(dp(12), dp(8), dp(12), dp(8));
        retentionHint.setBackground(surface(0xFFF3F7F6, 0, 12));
        body.addView(retentionHint, new LinearLayout.LayoutParams(-1, -2));
        retentionConsent.setOnCheckedChangeListener((v, checked) -> refreshRetentionHint());

        status = new TextView(this);
        status.setTextSize(14);
        status.setTextColor(0xFF12232E);
        status.setPadding(0, dp(12), 0, dp(2));
        status.setText(L("等待开始","Ready when you are"));reg(status,"等待开始","Ready when you are");
        body.addView(status, new LinearLayout.LayoutParams(-1, -2));
        archiveStatusView = new TextView(this);
        archiveStatusView.setTextSize(12);
        archiveStatusView.setTextColor(0xFF6B7A85);
        archiveStatusView.setLineSpacing(dp(1), 1f);
        archiveStatusView.setText(archive.describe());
        body.addView(archiveStatusView, new LinearLayout.LayoutParams(-1, -2));

        LinearLayout secondary = new LinearLayout(this);
        secondary.setOrientation(LinearLayout.HORIZONTAL);
        secondary.setPadding(0, dp(12), 0, 0);
        reviewButton = new TextView(this);
        reviewButton.setText(L("本轮原文与复盘","Transcript & review"));reg(reviewButton,"本轮原文与复盘","Transcript & review");
        reviewButton.setTextSize(14);
        reviewButton.setTextColor(0xFF0C7766);
        reviewButton.setPadding(dp(2), dp(8), dp(14), dp(8));
        reviewButton.setOnClickListener(v -> openReview());
        reviewButton.setEnabled(false);
        reviewButton.setAlpha(0.45f);
        secondary.addView(reviewButton, new LinearLayout.LayoutParams(0, -2, 1f));
        stopButton = new TextView(this);
        stopButton.setText(L("停止录音","Stop"));reg(stopButton,"停止录音","Stop");
        stopButton.setTextSize(14);
        stopButton.setTextColor(0xFF9C3434);
        stopButton.setPadding(dp(14), dp(8), dp(2), dp(8));
        stopButton.setOnClickListener(v -> stopStreaming("用户停止"));
        stopButton.setEnabled(false);
        stopButton.setAlpha(0.45f);
        secondary.addView(stopButton, new LinearLayout.LayoutParams(-2, -2));
        body.addView(secondary, new LinearLayout.LayoutParams(-1, -2));

        // 高级：默认折叠，普通用户看不到服务地址、音轨、令牌
        TextView advancedToggle = new TextView(this);
        advancedToggle.setText(L("高级设置  ›","Advanced  ›"));reg(advancedToggle,"高级设置  ›","Advanced  ›");
        advancedToggle.setTextSize(13);
        advancedToggle.setTextColor(0xFF6B7A85);
        advancedToggle.setPadding(0, dp(12), 0, dp(8));
        body.addView(advancedToggle, new LinearLayout.LayoutParams(-1, -2));
        advancedTools = new LinearLayout(this);
        advancedTools.setOrientation(LinearLayout.VERTICAL);
        advancedTools.setVisibility(View.GONE);
        body.addView(advancedTools, new LinearLayout.LayoutParams(-1, -2));
        advancedToggle.setOnClickListener(v -> {
            boolean show = advancedTools.getVisibility() != View.VISIBLE;
            advancedTools.setVisibility(show ? View.VISIBLE : View.GONE);
            advancedToggle.setText(show ? "高级设置  ⌄" : "高级设置  ›");
        });

        /* T4：外出（Tailscale 私有 HTTPS）/ 本机（adb reverse）一键切换。
           用户不需要终端、不需要手抄地址：点一下就把三个地址一起改掉并持久化。 */
        LinearLayout modeRow = new LinearLayout(this);
        modeRow.setOrientation(LinearLayout.HORIZONTAL);
        Button travelMode = new Button(this);
        travelMode.setAllCaps(false);
        travelMode.setText("外出模式");
        travelMode.setTextSize(14);
        travelMode.setTextColor(0xFF0C7766);
        travelMode.setOnClickListener(v -> applyEndpointPreset(true));
        Button localMode = new Button(this);
        localMode.setAllCaps(false);
        localMode.setText("本机 USB");
        localMode.setTextSize(14);
        localMode.setTextColor(0xFF1C293A);
        localMode.setOnClickListener(v -> applyEndpointPreset(false));
        modeRow.addView(travelMode, new LinearLayout.LayoutParams(0, dp(48), 1f));
        modeRow.addView(localMode, new LinearLayout.LayoutParams(0, dp(48), 1f));
        advancedTools.addView(modeRow, new LinearLayout.LayoutParams(-1, -2));
        modeHint = text(advancedTools, endpointModeHint(), 12);

        text(advancedTools, "语音识别服务地址", 13);
        urlInput = new EditText(this);
        urlInput.setText(config.getString("asr_url", DEFAULT_URL));
        urlInput.setTextSize(14);
        urlInput.setTextColor(0xFF12232E);
        urlInput.setSingleLine(true);
        advancedTools.addView(urlInput, new LinearLayout.LayoutParams(-1, dp(50)));
        text(advancedTools, "聊天页地址", 13);
        uiUrlInput = new EditText(this);
        uiUrlInput.setText(config.getString("ui_url", PRIVATE_UI_URL));
        uiUrlInput.setTextSize(13);
        uiUrlInput.setTextColor(0xFF12232E);
        uiUrlInput.setSingleLine(true);
        advancedTools.addView(uiUrlInput, new LinearLayout.LayoutParams(-1, dp(48)));
        trackPicker = new Spinner(this);
        trackPicker.setBackgroundColor(0xFFFFFFFF);
        trackPicker.setAdapter(new ArrayAdapter<String>(this,
                android.R.layout.simple_spinner_dropdown_item, TRACK_LABELS) {
            @Override public View getView(int position, View convertView, ViewGroup parent) {
                TextView v = (TextView) super.getView(position, convertView, parent);
                v.setTextColor(0xFF12232E);
                v.setTextSize(14);
                return v;
            }
            @Override public View getDropDownView(int position, View convertView, ViewGroup parent) {
                TextView v = (TextView) super.getDropDownView(position, convertView, parent);
                v.setTextColor(0xFF12232E);
                v.setTextSize(14);
                return v;
            }
        });
        advancedTools.addView(trackPicker, new LinearLayout.LayoutParams(-1, dp(52)));
        text(advancedTools, "原文同步地址（只存本机）", 13);
        archiveUrlInput = new EditText(this);
        archiveUrlInput.setText(archive.archiveUrl());
        archiveUrlInput.setTextSize(13);
        archiveUrlInput.setTextColor(0xFF12232E);
        archiveUrlInput.setSingleLine(true);
        advancedTools.addView(archiveUrlInput, new LinearLayout.LayoutParams(-1, dp(48)));
        pairingStatus = text(advancedTools, "", 12);
        pairCodeInput = new EditText(this);
        pairCodeInput.setHint("6 位配对码（Mac 上生成）");
        pairCodeInput.setTextSize(15);
        pairCodeInput.setTextColor(0xFF12232E);
        pairCodeInput.setSingleLine(true);
        pairCodeInput.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        advancedTools.addView(pairCodeInput, new LinearLayout.LayoutParams(-1, dp(48)));
        /* 设备配对（T1-3）：APK 不含长期令牌；首次在本机生成一次性配对码，输入一次即可。
           之后每次上传/注入都用设备 secret 换 ≤24h 的短期令牌，撤销后立即失效。
           T3：手填长期令牌的入口已移除，令牌只来自配对，未配对时上传 fail closed。 */
        Button pairButton = button(advancedTools, "配对这台手机", v -> {
            if (pairing == null) return;
            String code = pairCodeInput == null ? "" : pairCodeInput.getText().toString();
            if (archiveUrlInput != null) archive.setArchiveUrl(archiveUrlInput.getText().toString());
            // 配对是网络请求，绝不能放在主线程（曾因此抛 NetworkOnMainThreadException）。
            if (pairingStatus != null) pairingStatus.setText("配对中…");
            new Thread(() -> {
                // 配对接口挂在私有 UI 服务（8791）上，不能用归档地址（8781）当基址。
                String error = pairing.pair(uiBaseForPairing(), code);
                runOnUiThread(() -> {
                    if (!error.isEmpty()) {
                        // 配对失败必须当场在面板里可见（只写网页提示会被面板遮住）。
                        android.util.Log.w("SocialMatePairing", "pair failed: " + error);
                        if (pairingStatus != null) pairingStatus.setText("配对失败：" + error);
                        setExportStatus("配对失败：" + error);
                        return;
                    }
                    android.util.Log.i("SocialMatePairing", "paired device=" + pairing.deviceId());
                    if (pairCodeInput != null) pairCodeInput.setText("");
                    refreshPairingStatus();
                    warmTokenAsync();
                    archive.flushAsync(this::setArchiveStatus);
                });
            }, "pairing-claim").start();
        });
        pairButton.setTextSize(14);
        Button unpairButton = button(advancedTools, "清除本机配对", v -> {
            if (pairing == null) return;
            pairing.unpair();
            refreshPairingStatus();
            setExportStatus("已清除本机配对（服务端撤销请在本机执行 pair/revoke）");
        });
        unpairButton.setTextSize(14);
        refreshPairingStatus();
        Button retryExport = button(advancedTools, "立即补传", v -> {
            if (archiveUrlInput != null) archive.setArchiveUrl(archiveUrlInput.getText().toString());
            // 重启退避预算（6 次已用完时这是恢复入口），原文始终留在 outbox。
            archive.retryNow();
            setArchiveStatus(archive.describe());
        });
        retryExport.setTextSize(14);
        deviceInfo = text(advancedTools, "输入设备待读取", 12);
        clearButton = button(advancedTools, "清空本页转写", v -> {
            finals.setLength(0);
            if (transcript != null) transcript.setText("");
            if (live != null) live.setText("");
        });
        clearButton.setTextSize(14);

        live = new TextView(this);
        live.setTextSize(13);
        live.setTextColor(0xFF6B7A85);
        transcript = new TextView(this);
        transcript.setTextSize(14);
        transcript.setTextColor(0xFF12232E);
        advancedTools.addView(live);
        advancedTools.addView(transcript);
        suggestInput = new EditText(this);
        suggestInput.setSingleLine(true);
        suggestInput.setHint("输入话题，取建议");
        advancedTools.addView(suggestInput, new LinearLayout.LayoutParams(-1, dp(48)));
        suggestButton = button(advancedTools, "获取建议", v -> requestSuggestions());
        suggestButton.setEnabled(false);
        suggestionsView = text(advancedTools, "", 13);

        // 底部固定主按钮：与拇指距离最近，且不会被内容滚走
        LinearLayout footer = new LinearLayout(this);
        footer.setOrientation(LinearLayout.VERTICAL);
        footer.setPadding(dp(20), dp(8), dp(20), dp(12));
        startButton = new Button(this);
        startButton.setText(L("开始录音","Record"));
        startButton.setTextSize(16);
        startButton.setAllCaps(false);
        startButton.setTextColor(0xFFFFFFFF);
        startButton.setBackground(surface(0xFF0C7766, 0, 26));
        startButton.setOnClickListener(v -> startStreaming());
        footer.addView(startButton, new LinearLayout.LayoutParams(-1, dp(52)));
        TextView privacy = new TextView(this);
        privacy.setText(L("开始后保持本页在前台；切到后台会自动停止录音。","Keep this screen open while recording; switching apps stops it."));reg(privacy,"开始后保持本页在前台；切到后台会自动停止录音。","Keep this screen open while recording; switching apps stops it.");
        privacy.setTextSize(11);
        privacy.setTextColor(0xFF8A97A0);
        privacy.setPadding(0, dp(8), 0, 0);
        privacy.setGravity(android.view.Gravity.CENTER);
        footer.addView(privacy, new LinearLayout.LayoutParams(-1, -2));
        // 主按钮跟着内容走（面板高度=内容高度），避免面板被撑高后中间留一大片空白。
        body.addView(footer, new LinearLayout.LayoutParams(-1, -2));

        FrameLayout.LayoutParams sheetLp = new FrameLayout.LayoutParams(-1, -2);
        sheetLp.bottomMargin = 0;
        sheetLp.gravity = android.view.Gravity.BOTTOM;
        screenRoot.addView(sheet, sheetLp);
        refreshRetentionHint();
    }

    private void showRecordingSheet() {
        if (sheet == null) return;
        sheet.setVisibility(View.VISIBLE);
        if (sheetScrim != null) sheetScrim.setVisibility(View.VISIBLE);
        sheet.setTranslationY(dp(24));
        sheet.animate().translationY(0).setDuration(180).start();
        updateReviewEntry();
    }

    private void hideRecordingSheet() {
        if (sheet == null) return;
        sheet.setVisibility(View.GONE);
        if (sheetScrim != null) sheetScrim.setVisibility(View.GONE);
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

            // 不再有原生顶栏：品牌与页标题都在网页里，再加一条只会浪费一行高度。
            // 次级动作（录音设置 / 刷新 / 服务地址）从网页设置面板回调原生桥触发。

            // 导出结果的中文提示条（深色字 + 浅底，深色模式下依然可读）。
            webHint = new TextView(this);
            webHint.setTextSize(13);
            webHint.setTextColor(0xFF1C293A);
            webHint.setBackgroundColor(0xFFF5F7F8);
            webHint.setPadding(dp(14), dp(8), dp(14), dp(8));
            // 提示条默认不出现：这是调试期的常驻说明，产品里只在真的导出/失败时弹一句。
            webHint.setText("");
            webHint.setVisibility(View.GONE);
            webPanel.addView(webHint, new LinearLayout.LayoutParams(-1, -2));

            socialMateWebView = new WebView(this);
            WebSettings settings = socialMateWebView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(false);
            settings.setAllowFileAccessFromFileURLs(false);
            settings.setAllowUniversalAccessFromFileURLs(false);
            settings.setJavaScriptCanOpenWindowsAutomatically(false);
            settings.setSupportMultipleWindows(false);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            /* V1.6 图片上传：只补 onShowFileChooser，让网页的 <input type="file"> 能打开系统
               相册/文档选择器；App 仍不接管 alert/confirm 等其它 JS 对话框（行为与之前一致）。 */
            socialMateWebView.setWebChromeClient(new WebChromeClient() {
                @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                                           FileChooserParams params) {
                    if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                    fileChooserCallback = callback;
                    try {
                        Intent intent = params.createIntent();
                        /* accept="image/*" 时要明确把类型收窄到图片：默认 createIntent() 在部分 MIUI
                           上会打开「下载内容」（通配类型），用户找不到相册入口。 */
                        String[] types = params.getAcceptTypes();
                        boolean wantsImage = types == null || types.length == 0;
                        if (types != null) {
                            for (String type : types) {
                                if (type != null && type.toLowerCase(Locale.US).startsWith("image/")) {
                                    wantsImage = true;
                                    break;
                                }
                            }
                        }
                        if (wantsImage) {
                            intent.setType("image/*");
                            boolean multiple = params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE;
                            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
                            /* MIUI 的 DocumentsUI 默认停在「下载内容」，侧栏没有相册入口；
                               统一给一个选择器：默认「图库」（ACTION_PICK 直接进相册），备选「文件」。 */
                            Intent gallery = new Intent(Intent.ACTION_PICK,
                                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI);
                            gallery.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
                            Intent chooser = Intent.createChooser(gallery, "选择图片");
                            chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{intent});
                            startActivityForResult(chooser, REQUEST_FILE_CHOOSER);
                        } else {
                            startActivityForResult(intent, REQUEST_FILE_CHOOSER);
                        }
                        return true;
                    } catch (Exception e) {
                        fileChooserCallback = null;
                        setExportStatus("无法打开图片选择器：" + e.getMessage());
                        return false;
                    }
                }
            });
            // 只有一个 WebViewClient：URL 白名单、桥的挂载/撤销、令牌注入都在这里，
            // 避免第二次 setWebViewClient 把安全回调整个覆盖掉（N04 V1.3 T1-2 缺陷根因）。
            socialMateWebView.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri uri = request.getUrl();
                    if (isPrivatePanelUrl(uri)) return false;
                    // 子框架（iframe）一律不许离开私有 origin：直接取消，不交给系统浏览器，
                    // 也不让它在 WebView 里加载——非私有 frame 拿不到桥，也拿不到 DOM。
                    if (!request.isForMainFrame()) {
                        return true;
                    }
                    // 主框架的外部链接交给系统浏览器，WebView 自身不进入不可信页面。
                    if ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme())) {
                        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                        catch (Exception ignored) { }
                    }
                    return true;
                }

                /**
                 * 子资源也按 origin 过滤：跨源 iframe/脚本/图片在这里就被挡掉，
                 * 因此「恶意 iframe 调到桥」在加载阶段即不可能发生（而不是靠事后判断）。
                 */
                @Override public android.webkit.WebResourceResponse shouldInterceptRequest(
                        WebView view, WebResourceRequest request) {
                    Uri uri = request.getUrl();
                    if (uri == null) return null;
                    String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.US);
                    if (!("http".equals(scheme) || "https".equals(scheme))) return null;
                    if (isPrivatePanelUrl(uri)) return null;
                    // 其余 http(s) 子资源一律空响应：跨源 iframe/脚本连加载机会都没有。
                    // 同主机不同端口也算跨源（origin = scheme+host+port），不放行。
                    return new android.webkit.WebResourceResponse("text/plain", "utf-8",
                            new java.io.ByteArrayInputStream(new byte[0]));
                }

                @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                    super.onPageStarted(view, url, favicon);
                    pageLoadFailed = false;
                    // 页面一开始离开私有 origin 就先收桥：不等到 onPageFinished。
                    if (!isPrivatePanelUrl(url == null ? null : Uri.parse(url))) {
                        trustedPageUrl = null;
                        attachSaveBridge(false);
                    }
                }

                @Override public void onPageFinished(WebView view, String url) {
                    super.onPageFinished(view, url);
                    Uri parsed = url == null ? null : Uri.parse(url);
                    android.util.Log.i("SocialMateBridge", "onPageFinished url=" + url
                            + " private=" + isPrivatePanelUrl(parsed) + " failed=" + pageLoadFailed);
                    if (!isPrivatePanelUrl(parsed) || pageLoadFailed) {
                        // 加载失败时 WebView 仍会用「请求的 URL」回调 onPageFinished，
                        // 但内容其实是错误页；此时必须不挂桥（fail closed）。
                        trustedPageUrl = null;
                        attachSaveBridge(false);
                        return;
                    }
                    trustedPageUrl = url;
                    attachSaveBridge(true);
                    injectAccessToken(view, url);
                    hideOfflinePanel();
                    refreshOfflineSnapshotAsync(url);
                }

                /** 主框架加载失败（DNS/TLS/连接被拒）：立刻撤桥，避免停留在半加载的不可信状态。 */
                @Override public void onReceivedError(WebView view, WebResourceRequest request,
                                                      android.webkit.WebResourceError error) {
                    super.onReceivedError(view, request, error);
                    if (request != null && !request.isForMainFrame()) return;
                    pageLoadFailed = true;
                    trustedPageUrl = null;
                    attachSaveBridge(false);
                    setExportStatus("界面加载失败：已关闭原生桥，请检查私有服务是否在线");
                    showOfflinePanel("主界面加载失败（服务或网络不可达）");
                }

                @Override public void onReceivedHttpError(WebView view, WebResourceRequest request,
                                                         android.webkit.WebResourceResponse response) {
                    super.onReceivedHttpError(view, request, response);
                    if (request == null || !request.isForMainFrame()) return;
                    if (response != null && response.getStatusCode() >= 400) {
                        pageLoadFailed = true;
                        trustedPageUrl = null;
                        attachSaveBridge(false);
                        showOfflinePanel("私有界面返回 HTTP " + response.getStatusCode());
                    }
                }
            });
            socialMateWebView.setDownloadListener(new DownloadListener() {
                @Override public void onDownloadStart(String url, String userAgent,
                                                      String contentDisposition, String mimeType, long contentLength) {
                    handleWebDownload(url, contentDisposition);
                }
            });
            // 只有一个 WebViewClient：URL 白名单、桥的挂载/撤销、令牌注入都在这里，
            // 导出统一走 DownloadListener + SAF（ACTION_CREATE_DOCUMENT，用户显式选位置）。
            // 首次加载的目标恒为私有 origin，因此在 loadUrl 之前挂桥：
            // WebView 的 Java 桥只在文档创建时注入，事后再 add 对已存在文档无效（实测）。
            // 一旦离开私有 origin 或加载失败，onPageStarted/onReceivedError 会立刻撤桥。
            attachSaveBridge(true);
            webPanel.addView(socialMateWebView, new LinearLayout.LayoutParams(-1, 0, 1f));

            /* T4 只读降级：服务不可达时用这个原生面板替代 WebView 的错误页（不白屏、不伪报成功）。 */
            offlinePanel = new ScrollView(this);
            offlinePanel.setBackgroundColor(0xFFF5F7F8);
            LinearLayout offlineBox = new LinearLayout(this);
            offlineBox.setOrientation(LinearLayout.VERTICAL);
            offlineBox.setPadding(dp(20), dp(16), dp(20), dp(20));
            offlineBody = new TextView(this);
            offlineBody.setTextSize(14);
            offlineBody.setTextColor(0xFF1C293A);
            offlineBox.addView(offlineBody, new LinearLayout.LayoutParams(-1, -2));
            Button retryConnect = new Button(this);
            retryConnect.setAllCaps(false);
            retryConnect.setText("重试连接");
            retryConnect.setTextSize(15);
            retryConnect.setTextColor(0xFFFFFFFF);
            retryConnect.setBackground(surface(0xFF0C7766, 0, 22));
            retryConnect.setOnClickListener(v -> {
                if (socialMateWebView == null) return;
                offlineReason = "";
                pageLoadFailed = false;
                hideOfflinePanel();
                socialMateWebView.loadUrl(privateUiUrl());
            });
            LinearLayout.LayoutParams retryLp = new LinearLayout.LayoutParams(-1, dp(48));
            retryLp.topMargin = dp(12);
            offlineBox.addView(retryConnect, retryLp);
            offlinePanel.addView(offlineBox, new LinearLayout.LayoutParams(-1, -2));
            offlinePanel.setVisibility(View.GONE);
            webPanel.addView(offlinePanel, new LinearLayout.LayoutParams(-1, 0, 1f));

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

    /** 配置的聊天页基地址（原样，未做网络适配）；默认本机，可改为 Tailscale HTTPS。 */
    private String rawUiBase() {
        String value = config.getString("ui_url", PRIVATE_UI_URL);
        if (value == null) value = PRIVATE_UI_URL;
        return normalizeBase(value);
    }

    private static String normalizeBase(String value) {
        String v = value == null ? "" : value.trim();
        while (v.endsWith("/")) v = v.substring(0, v.length() - 1);
        if (v.endsWith("/v12")) v = v.substring(0, v.length() - 4);
        return v;
    }

    /**
     * 离开 WiFi 且配置的是局域网地址时，局域网 IP 必然不可达；继续用它会让 WebView
     * 等 TCP 超时（真机表现为「进软件加载半天」）。此时直接改用 Tailscale 私有入口；
     * 回环地址不动（USB + adb reverse 场景仍然可用）。
     */
    private String effectiveUiBase() {
        String base = rawUiBase();
        if (isOnWifi()) return base;
        try {
            String host = Uri.parse(base).getHost();
            if (isPrivateLanHost(host)) {
                android.util.Log.i("SocialMateBridge", "off-wifi lan base -> tailscale");
                return normalizeBase(TRAVEL_UI_URL);
            }
        } catch (Exception ignored) { }
        return base;
    }

    private static boolean isPrivateLanHost(String host) {
        if (host == null) return false;
        if (host.startsWith("192.168.") || host.startsWith("10.")) return true;
        if (host.startsWith("172.")) {
            String[] parts = host.split("\\.");
            if (parts.length >= 2) {
                try {
                    int second = Integer.parseInt(parts[1]);
                    return second >= 16 && second <= 31;
                } catch (NumberFormatException ignored) { }
            }
        }
        return false;
    }

    private boolean isOnWifi() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            Network network = cm.getActiveNetwork();
            if (network == null) return false;
            NetworkCapabilities caps = cm.getNetworkCapabilities(network);
            return caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI);
        } catch (Exception ignored) {
            return false;
        }
    }

    /** 页面实际加载的 origin：默认本机；仅当用户显式切到 mac 模式才回旧行为。 */
    private String privateUiBase() {
        if (localUiMode()) return localBaseUrl;
        return macUiBase();
    }

    /** V1.7：本机页面优先；本地服务没起来或用户选择 mac 模式时为 false。 */
    private boolean localUiMode() {
        return localServer != null && !"mac".equals(config.getString("ui_mode", "local"));
    }

    /** Mac 私有服务基地址：只用于配对、令牌刷新、归档、ASR 与同步，页面不再依赖它。 */
    private String macUiBase() {
        return effectiveUiBase();
    }

    /** Recording start passes live=1 so the page auto-opens a session and reconnects subtitles after refresh. */
    private String privateUiUrl() {
        return privateUiBase() + "/v12" + (running ? "?live=1" : "");
    }

    /* ------------------------------------------------------------------ T4 */

    /** 当前是否处于「外出（Tailscale）」入口；只按地址判断，不看网络类型。 */
    private boolean isTravelMode() {
        return privateUiBase().startsWith("https://");
    }

    private String endpointModeHint() {
        if (localUiMode()) {
            return "当前：本机资料库 · 页面与数据都在手机上，Mac 关机也能用";
        }
        return isTravelMode()
                ? "当前：外出模式 · 走 Tailscale 私有 HTTPS（不需要 USB，不经过公网）"
                : "当前：本机模式 · 需要 USB + adb reverse（仅开发用）";
    }

    /**
     * 一键切换三种地址（ASR/UI/归档）并持久化，然后重载界面。
     * 用户不需要终端：这是「拔掉 USB 之后」唯一要做的图形界面动作。
     */
    private void applyEndpointPreset(boolean travel) {
        config.edit().putString("ui_mode", travel ? "mac" : "local").apply();
        String asr = travel ? TRAVEL_ASR_URL : DEFAULT_URL;
        String ui = travel ? TRAVEL_UI_URL : PRIVATE_UI_URL;
        String archiveUrl = travel ? TRAVEL_ARCHIVE_URL : LOCAL_ARCHIVE_URL;
        applyEndpointValues(asr, ui, archiveUrl);
        pageLoadFailed = false;
        offlineReason = "";
        if (modeHint != null) modeHint.setText(endpointModeHint());
        hideOfflinePanel();
        if (socialMateWebView != null) socialMateWebView.loadUrl(privateUiUrl());
        setExportStatus(travel
                ? "已切到外出模式：Tailscale 私有 HTTPS（请确认手机 Tailscale 已授权并开启）"
                : "已切回本机模式：需要 USB 连接与 adb reverse");
    }

    private void showOfflinePanel(String reason) {
        if (offlinePanel == null) return;
        offlineReason = reason == null ? "" : reason;
        // 加载失败时 WebView 停在错误页：隐藏它，改成只读面板，绝不留白屏。
        if (socialMateWebView != null) socialMateWebView.setVisibility(View.GONE);
        offlinePanel.setVisibility(View.VISIBLE);
        renderOfflinePanel();
    }

    private void renderOfflinePanel() {
        if (offlineBody == null) return;
        offlineBody.setText(buildOfflineText());
    }

    private void hideOfflinePanel() {
        if (offlinePanel == null) return;
        offlinePanel.setVisibility(View.GONE);
        if (socialMateWebView != null) socialMateWebView.setVisibility(View.VISIBLE);
    }

    private java.io.File snapshotFile() {
        java.io.File dir = new java.io.File(getFilesDir(), OFFLINE_DIR);
        if (!dir.exists()) dir.mkdirs();
        return new java.io.File(dir, OFFLINE_SNAPSHOT);
    }

    /** 在线加载成功后刷新本地快照：只存「演示 + 计数」，不存逐字原文、不存令牌。 */
    private void refreshOfflineSnapshotAsync(String pageUrl) {
        if (pageUrl == null) return;
        // 本地 origin 自身就是离线真源，不需要再拉「只读快照」。
        if (localUiMode()) return;
        final String base = macUiBase();
        if (base.isEmpty()) return;
        new Thread(() -> {
            try {
                String people = httpGetText(base + "/v12/api/demo/people", 6000);
                String live = httpGetText(base + "/v12/api/live/status", 4000);
                if (people == null || people.isEmpty()) return;
                JSONObject snap = new JSONObject();
                snap.put("savedAt", new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.US)
                        .format(new java.util.Date()));
                snap.put("uiBase", base);
                snap.put("demo", new JSONObject(people));
                snap.put("live", live == null ? new JSONObject() : new JSONObject(live));
                java.io.File tmp = new java.io.File(snapshotFile().getParentFile(), OFFLINE_SNAPSHOT + ".tmp");
                try (java.io.FileOutputStream out = new java.io.FileOutputStream(tmp)) {
                    out.write(snap.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
                }
                //noinspection ResultOfMethodCallIgnored
                tmp.renameTo(snapshotFile());
            } catch (Exception ignored) {
                // 快照只是离线兜底，失败不影响在线使用，也不改任何状态。
            }
        }, "offline-snapshot").start();
    }

    private static String httpGetText(String url, int timeoutMs) {
        java.net.HttpURLConnection conn = null;
        try {
            conn = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(timeoutMs);
            conn.setReadTimeout(timeoutMs);
            conn.setInstanceFollowRedirects(false);
            if (conn.getResponseCode() != 200) return null;
            java.io.InputStream in = conn.getInputStream();
            java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int n;
            while ((n = in.read(chunk)) > 0) {
                buf.write(chunk, 0, n);
                if (buf.size() > 512 * 1024) break;
            }
            in.close();
            return new String(buf.toByteArray(), java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** 离线只读文本：本机缓存 + 本机历史；明确写出「写操作不可用、不显示成功」。 */
    private String buildOfflineText() {
        StringBuilder b = new StringBuilder();
        b.append("离线只读模式\n");
        b.append(offlineReason.isEmpty() ? "Mac 私有服务暂不可用。" : "Mac 私有服务暂不可用：" + offlineReason).append("\n");
        b.append(isTravelMode() ? "连接方式：外出模式（Tailscale 私有 HTTPS）\n"
                : "连接方式：本机模式（USB / adb reverse）\n");
        b.append("下面显示的是手机上一次成功加载时留下的本地缓存，不是新拉取的数据。\n\n");

        JSONObject snap = null;
        try {
            snap = new JSONObject(new String(java.nio.file.Files.readAllBytes(snapshotFile().toPath()),
                    java.nio.charset.StandardCharsets.UTF_8));
        } catch (Exception ignored) { }

        if (snap == null) {
            b.append("本地暂无缓存：这台手机还没有成功加载过在线界面。\n\n");
        } else {
            b.append("上次同步：").append(snap.optString("savedAt", "未知")).append("\n");
            JSONObject demo = snap.optJSONObject("demo");
            JSONObject status = demo == null ? null : demo.optJSONObject("status");
            JSONArray people = demo == null ? null : demo.optJSONArray("people");
            if (status != null) {
                b.append("演示数据：").append(status.optInt("personas")).append(" 位人物 · ")
                        .append(status.optInt("sessions")).append(" 段会话 · ")
                        .append(status.optInt("segments")).append(" 句原文 · 待确认 ")
                        .append(status.optInt("pending")).append(" 条")
                        .append(status.optBoolean("cleared") ? "（已清空，待恢复）" : "").append("\n");
            }
            if (people != null) {
                b.append("\n");
                for (int i = 0; i < people.length(); i++) {
                    JSONObject p = people.optJSONObject(i);
                    if (p == null) continue;
                    b.append("· ").append(p.optString("name")).append("（").append(p.optString("region")).append("）")
                            .append("  ").append(p.optInt("sessionCount")).append(" 段会话 · 已确认 ")
                            .append(p.optInt("confirmedCount")).append(" 条 · 待确认 ")
                            .append(p.optInt("pendingCount")).append(" 条\n");
                }
            }
            JSONObject archive = demo == null ? null : demo.optJSONObject("archive");
            if (archive != null) {
                b.append("\nMac 演示归档：已送达 ").append(archive.optInt("delivered"))
                        .append("/").append(archive.optInt("total"))
                        .append(archive.optInt("pending") > 0 ? "（待传 " + archive.optInt("pending") + " 套）" : "（全部送达）")
                        .append("\n");
            }
            JSONObject live = snap.optJSONObject("live");
            if (live != null) {
                b.append("实时候选：待确认 ").append(live.optInt("pending")).append(" 条（逐字原文只在在线会话内存中）\n");
            }
        }

        b.append("\n本地原文（手机 outbox / exported）\n");
        b.append(archive == null ? "未知" : archive.localHistorySummary(6)).append("\n");

        b.append("\n离线期间的限制\n");
        b.append("· 清空 / 恢复演示数据、上传原文都不会执行，也不会显示成功；\n");
        b.append("· 缓存里没有任何真人新增内容，恢复连接后也不会把演示数据混进真实人物资料；\n");
        b.append("· 恢复连接后点「重试连接」即回到在线界面，数据以 Mac 为准重新读取。\n");
        return b.toString();
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
            status.setText("本轮原文还在手机 outbox，未同步 Mac；正在重试补传…");
            // 重置退避预算；失败时 describe() 会给出具体原因。
            archive.retryNow(text -> {
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

    /**
     * 只把「设备配对换来的短期令牌」注入私有 origin 的页面会话。
     * - 非私有 origin 不注入（调用方已在 onPageFinished 里做过一次判断，这里再判一次）；
     * - 没有配对/令牌过期 → 什么都不注入，页面按「未授权」显示，不静默降级；
     * - 令牌只进 sessionStorage，不写 localStorage、不进 URL、不进日志。
     */
    private void injectAccessToken(WebView view, String url) {
        if (view == null) return;
        if (!isPrivatePanelUrl(url == null ? null : Uri.parse(url))) return;
        // 本地页面用本地随机令牌；Mac 页面仍用配对短期令牌。
        String token = localUiMode() ? localToken : (pairing == null ? "" : pairing.cachedToken());
        if (token.isEmpty()) {
            if (!localUiMode()) warmTokenAsync();
            return;
        }
        String js = "(function(){try{sessionStorage.setItem('sm-archive-token','"
                + token.replace("'", "\\'") + "');"
                + "if(window.__smAfterToken)window.__smAfterToken();}catch(e){}})()";
        view.evaluateJavascript(js, null);
    }

    /**
     * 短期令牌刷新：只在后台线程做网络请求。
     * 未配对或刷新失败保持空令牌，上传就会 fail closed，而不是拿旧长期令牌硬闯。
     */
    private void warmTokenAsync() {
        DevicePairing target = pairing;
        if (target == null || !target.isPaired()) return;
        if (tokenWarming) return;
        tokenWarming = true;
        new Thread(() -> {
            String token = target.refreshToken(macUiBase(), line -> { });
            tokenWarming = false;
            if (token.isEmpty()) return;
            runOnUiThread(() -> {
                if (socialMateWebView != null) injectAccessToken(socialMateWebView, trustedPageUrl);
                // 冷启动时 outbox 可能因为「还没拿到令牌」被跳过；令牌到手后立刻补传一次。
                if (archive != null) archive.flushAsync(this::setArchiveStatus);
            });
        }, "pairing-token").start();
    }

    /**
     * SessionArchive 的令牌来源。主线程调用时只给缓存（不阻塞 UI），
     * 后台线程（上传线程/停止后的补传线程）才允许现取。
     */
    private String currentAccessToken() {
        DevicePairing target = pairing;
        if (target == null || !target.isPaired()) return "";
        String cached = target.cachedToken();
        if (!cached.isEmpty()) return cached;
        if (Looper.myLooper() == Looper.getMainLooper()) {
            warmTokenAsync();
            return "";
        }
        return target.refreshToken(macUiBase(), line -> { });
    }

    /** 注入导出桥；非私有 origin 一律撤掉（fail closed）。 */
    private void attachSaveBridge(boolean allow) {
        if (socialMateWebView == null) return;
        if (allow) {
            if (!bridgeAttached) {
                socialMateWebView.addJavascriptInterface(new SaveTextBridge(), BRIDGE_NAME);
                bridgeAttached = true;
                android.util.Log.i("SocialMateBridge", "attached to " + trustedPageUrl);
            }
            if (!ttsBridgeAttached) {
                socialMateWebView.addJavascriptInterface(new TtsBridge(), TTS_BRIDGE_NAME);
                ttsBridgeAttached = true;
                android.util.Log.i("SocialMateTts", "bridge attached to " + trustedPageUrl);
            }
            if (!jsLogBridgeAttached) {
                socialMateWebView.addJavascriptInterface(new JsLogBridge(), JS_LOG_BRIDGE_NAME);
                jsLogBridgeAttached = true;
            }
        } else {
            if (bridgeAttached) {
                socialMateWebView.removeJavascriptInterface(BRIDGE_NAME);
                bridgeAttached = false;
                android.util.Log.i("SocialMateBridge", "detached");
            }
            if (ttsBridgeAttached) {
                socialMateWebView.removeJavascriptInterface(TTS_BRIDGE_NAME);
                ttsBridgeAttached = false;
                android.util.Log.i("SocialMateTts", "bridge detached");
            }
            if (jsLogBridgeAttached) {
                socialMateWebView.removeJavascriptInterface(JS_LOG_BRIDGE_NAME);
                jsLogBridgeAttached = false;
            }
        }
    }

    /**
     * 前端 window.SocialMateAndroid.saveText(filename, text)。
     * 返回 true＝已受理（随后请用户选保存位置）；false＝拒绝（非白名单 origin 或参数不合法）。
     * 不使用 WRITE_EXTERNAL_STORAGE，全部走 SAF，由用户决定落地位置。
     */
    private final class SaveTextBridge {
        /**
         * 网页「开始录音」按钮 → 原生录音同意面板。
         * 录音权限与录音同意的判定留在原生，网页不自行开麦。
         */
        /** 网页设置里的「录音与留存设置」。 */
        @JavascriptInterface
        public boolean openRecordingPanel() {
            String page = trustedPageUrl;
            if (page == null || !isPrivatePanelUrl(Uri.parse(page))) return false;
            runOnUiThread(AsrActivity.this::showRecordingSheet);
            return true;
        }

        /** 网页「结束并人工确认」：直接打开本机归档的复盘页。 */
        @JavascriptInterface
        public boolean openReviewPage() {
            String page = trustedPageUrl;
            if (page == null || !isPrivatePanelUrl(Uri.parse(page))) return false;
            runOnUiThread(AsrActivity.this::openReview);
            return true;
        }

        /** 方案 2：保存厂商 Key。值只进 Keystore 加密存储，不回显、不写日志。 */
        @JavascriptInterface
        public String saveCloudKey(String kind, String value) {
            String page = trustedPageUrl;
            if (page == null || !isPrivatePanelUrl(Uri.parse(page))) return "{\"ok\":false,\"code\":\"UNTRUSTED\"}";
            CloudKeys keys = new CloudKeys(AsrActivity.this);
            boolean ok = keys.put(kind, value);
            JSONObject out = new JSONObject();
            try {
                out.put("ok", ok);
                out.put("status", keys.status());
            } catch (Exception ignored) {}
            return out.toString();
        }

        @JavascriptInterface
        public String clearCloudKey(String kind) {
            String page = trustedPageUrl;
            if (page == null || !isPrivatePanelUrl(Uri.parse(page))) return "{\"ok\":false,\"code\":\"UNTRUSTED\"}";
            CloudKeys keys = new CloudKeys(AsrActivity.this);
            boolean ok = keys.put(kind, "");
            JSONObject out = new JSONObject();
            try {
                out.put("ok", ok);
                out.put("status", keys.status());
            } catch (Exception ignored) {}
            return out.toString();
        }

        @JavascriptInterface
        public String cloudKeyStatus() {
            String page = trustedPageUrl;
            if (page == null || !isPrivatePanelUrl(Uri.parse(page))) return "{\"ok\":false,\"code\":\"UNTRUSTED\"}";
            JSONObject out = new JSONObject();
            try {
                out.put("ok", true);
                out.put("status", new CloudKeys(AsrActivity.this).status());
            } catch (Exception ignored) {}
            return out.toString();
        }

        /** 用户点「测试通联」：真实调用一次厂商接口，只回结果，不改 Key。 */
        @JavascriptInterface
        public String testCloudKey(String kind) {
            String page = trustedPageUrl;
            if (page == null || !isPrivatePanelUrl(Uri.parse(page))) return testResult(false, "页面不受信任");
            String k = kind == null ? "" : kind.trim().toLowerCase(java.util.Locale.ROOT);
            try {
                DirectCloud direct = new DirectCloud(AsrActivity.this);
                if ("deepseek".equals(k)) {
                    if (!direct.canAi()) return testResult(false, "未配置 DeepSeek Key");
                    JSONObject result = direct.translate(new JSONObject().put("text", "hello").put("consent", true));
                    return testResult(true, "DeepSeek 通联成功：" + result.optString("zh", ""));
                }
                if ("doubao".equals(k)) {
                    if (!direct.canTts()) return testResult(false, "未配置豆包 Key");
                    direct.tts(new JSONObject()
                            .put("text", "你好")
                            .put("voiceProfileId", "zh_female_xiaohe_uranus_bigtts")
                            .put("explicitConsent", true));
                    return testResult(true, "豆包通联成功（已生成 2 字音频）");
                }
                if ("tencent".equals(k)) return testTencentAsr();
                return testResult(false, "未知 Key 类型");
            } catch (Exception e) {
                return testResult(false, e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
            }
        }

        private String testResult(boolean ok, String message) {
            JSONObject out = new JSONObject();
            try {
                out.put("ok", ok);
                out.put("message", message == null ? "" : message);
            } catch (Exception ignored) {}
            return out.toString();
        }

        /** 腾讯 ASR 只做握手测试：不发音频、不建立长会话。 */
        private String testTencentAsr() {
            try {
                CloudKeys keys = new CloudKeys(AsrActivity.this);
                if (!keys.hasTencentAsr()) return testResult(false, "腾讯 AppId / SecretId / SecretKey 未配置完整");
                String voice = TencentAsrSign.newVoiceId();
                String url = TencentAsrSign.createUrl(
                        keys.get(CloudKeys.TENCENT_APP_ID),
                        keys.get(CloudKeys.TENCENT_SECRET_ID),
                        keys.get(CloudKeys.TENCENT_SECRET_KEY),
                        "16k_zh_en_speaker_2.0", "mix", voice);
                final java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);
                final String[] message = {""};
                final boolean[] ready = {false};
                TencentAsrClient client = new TencentAsrClient(new URI(url), "mix", voice, new AsrClient.Listener() {
                    @Override public void onAsrEvent(AsrClient c, JSONObject e) {
                        String type = e.optString("type", "");
                        if ("session".equals(type) && "ready".equals(e.optString("status", ""))) {
                            ready[0] = true;
                            latch.countDown();
                        } else if ("error".equals(type)) {
                            message[0] = e.optString("text", "");
                            latch.countDown();
                        }
                    }
                    @Override public void onAsrState(AsrClient c, String state) {
                        if (state.startsWith("closed") || state.startsWith("error")) {
                            if (!ready[0] && message[0].isEmpty()) message[0] = state;
                            latch.countDown();
                        }
                    }
                });
                if (!client.awaitOpen()) return testResult(false, "无法连接腾讯云 ASR（网络或签名被拒）");
                boolean signaled = latch.await(6, TimeUnit.SECONDS);
                try { client.close(); } catch (Exception ignored) {}
                if (ready[0]) return testResult(true, "腾讯 ASR 通联成功（仅握手，未发送音频）");
                if (!message[0].isEmpty()) return testResult(false, message[0]);
                return testResult(false, signaled ? "腾讯未返回就绪" : "等待腾讯就绪超时");
            } catch (Exception e) {
                return testResult(false, e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
            }
        }

        /** 局域网同步：手机 → Mac 的 Backups 目录（不改真源）。 */
        @JavascriptInterface
        public String syncPush() {
            String page = trustedPageUrl;
            if (page == null || !isPrivatePanelUrl(Uri.parse(page))) return syncFail("页面不受信任");
            try {
                String base = AsrActivity.this.macUiBase();
                String token = AsrActivity.this.currentAccessToken();
                try {
                    return LocalSync.push(AsrActivity.this, LocalStore.get(AsrActivity.this), base, token).toString();
                } catch (Exception lanFailed) {
                    // 5G 无 LAN 时走 Tailscale 直连；LAN 地址已失败再试一次。
                    if (base.contains("100.")) throw lanFailed;
                    return LocalSync.push(AsrActivity.this, LocalStore.get(AsrActivity.this),
                            "http://100.125.100.15:8791", token).toString();
                }
            } catch (Exception e) {
                return syncFail(e.getMessage());
            }
        }

        /** 从 Mac 拉取快照并合并：本机已有记录不覆盖。 */
        @JavascriptInterface
        public String syncPull() {
            String page = trustedPageUrl;
            if (page == null || !isPrivatePanelUrl(Uri.parse(page))) return syncFail("页面不受信任");
            try {
                String base = AsrActivity.this.macUiBase();
                long t0 = android.os.SystemClock.elapsedRealtime();
                String token = AsrActivity.this.currentAccessToken();
                android.util.Log.i("SocialMateSync", "pull base=" + base
                        + " tokenLen=" + (token == null ? 0 : token.length())
                        + " tokenMs=" + (android.os.SystemClock.elapsedRealtime() - t0));
                try {
                    JSONObject pulled = LocalSync.pull(AsrActivity.this, LocalStore.get(AsrActivity.this), base, token);
                    android.util.Log.i("SocialMateSync", "pull ok ms="
                            + (android.os.SystemClock.elapsedRealtime() - t0));
                    return pulled.toString();
                } catch (Exception lanFailed) {
                    if (base.contains("100.")) throw lanFailed;
                    return LocalSync.pull(AsrActivity.this, LocalStore.get(AsrActivity.this),
                            "http://100.125.100.15:8791", token).toString();
                }
            } catch (Exception e) {
                android.util.Log.e("SocialMateSync", "pull failed: " + e.getMessage());
                return syncFail(e.getMessage());
            }
        }

        private String syncFail(String message) {
            JSONObject out = new JSONObject();
            try {
                out.put("ok", false);
                out.put("message", message == null ? "同步失败" : message);
            } catch (Exception ignored) {}
            return out.toString();
        }

        /** 实时字幕引擎：mac = Mac 中继；direct = 手机直连腾讯。 */
        @JavascriptInterface
        public String setAsrMode(String mode) {
            String page = trustedPageUrl;
            if (page == null || !isPrivatePanelUrl(Uri.parse(page))) return "{\"ok\":false,\"code\":\"UNTRUSTED\"}";
            String value = "direct".equals(mode) ? "direct" : "mac";
            config.edit().putString("asr_mode", value).apply();
            JSONObject out = new JSONObject();
            try {
                out.put("ok", true);
                out.put("mode", value);
                out.put("ready", "mac".equals(value) || new CloudKeys(AsrActivity.this).hasTencentAsr());
            } catch (Exception ignored) {}
            return out.toString();
        }

        @JavascriptInterface
        public String getAsrMode() {
            JSONObject out = new JSONObject();
            try {
                String value = config.getString("asr_mode", "mac");
                out.put("ok", true);
                out.put("mode", value);
                out.put("ready", "mac".equals(value) || new CloudKeys(AsrActivity.this).hasTencentAsr());
            } catch (Exception ignored) {}
            return out.toString();
        }

        /** 用系统相机拍照并直接写入指定卡片（全尺寸，MediaStore 输出，不申请额外存储权限）。 */
        @JavascriptInterface
        public boolean capturePhoto(String kind, String cardId) {
            String page = trustedPageUrl;
            if (page == null || !isPrivatePanelUrl(Uri.parse(page))) return false;
            if (cardId == null || !cardId.matches("^[a-z0-9-]{1,64}$")) return false;
            String k = "place".equals(kind) || "app".equals(kind) ? kind : "story";
            runOnUiThread(() -> {
                try {
                    android.content.ContentValues values = new android.content.ContentValues();
                    values.put(android.provider.MediaStore.Images.Media.DISPLAY_NAME,
                            "sm-" + System.currentTimeMillis() + ".jpg");
                    values.put(android.provider.MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                    android.net.Uri uri = getContentResolver().insert(
                            android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) {
                        setExportStatus("无法创建相机输出文件");
                        return;
                    }
                    pendingCaptureUri = uri;
                    pendingCaptureKind = k;
                    pendingCaptureCardId = cardId;
                    android.content.Intent intent = new android.content.Intent(
                            android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
                    intent.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, uri);
                    startActivityForResult(intent, REQUEST_CAPTURE_PHOTO);
                    setExportStatus("请拍照，完成后会自动加入卡片…");
                } catch (Exception e) {
                    setExportStatus("无法打开相机：" + e.getMessage());
                }
            });
            return true;
        }

        /** 导出本机私人备份包（AES-256-GCM 加密的 .smbak）：先设口令，再选保存位置。 */
        @JavascriptInterface
        public boolean exportBackup() {
            String page = trustedPageUrl;
            if (page == null || !isPrivatePanelUrl(Uri.parse(page))) return false;
            runOnUiThread(this::promptExportPassword);
            return true;
        }

        private void promptExportPassword() {
            android.widget.EditText pwd1 = new android.widget.EditText(AsrActivity.this);
            pwd1.setHint("备份口令（至少 6 位，请自行记住）");
            pwd1.setInputType(android.text.InputType.TYPE_CLASS_TEXT
                    | android.text.InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD);
            int pad = dp(18);
            pwd1.setPadding(pad, dp(8), pad, 0);
            new android.app.AlertDialog.Builder(AsrActivity.this)
                    .setTitle("加密本机备份")
                    .setMessage("备份包含人物、卡片、图片；口令不保存，忘记后无法恢复。")
                    .setView(pwd1)
                    .setNegativeButton("取消", null)
                    .setPositiveButton("继续", (dialog, which) -> {
                        String a = pwd1.getText().toString();
                        if (a.length() < 6) {
                            toast("口令至少 6 位");
                            return;
                        }
                        pendingBackupPassword = a;
                        startBackupSavePicker();
                    })
                    .show();
        }

        private void startBackupSavePicker() {
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/octet-stream");
            String stamp = new java.text.SimpleDateFormat("yyyyMMdd-HHmm", java.util.Locale.US)
                    .format(new java.util.Date());
            intent.putExtra(Intent.EXTRA_TITLE, "SocialMate-backup-" + stamp + ".smbak");
            try {
                startActivityForResult(intent, REQUEST_EXPORT_BACKUP);
                setExportStatus("请选择备份保存位置…");
            } catch (Exception e) {
                pendingBackupPassword = "";
                setExportStatus("无法打开保存面板：" + e.getMessage());
            }
        }

        /** 从备份包恢复：导入完成并校验后重载本机页面。 */
        @JavascriptInterface
        public boolean importBackup() {
            String page = trustedPageUrl;
            if (page == null || !isPrivatePanelUrl(Uri.parse(page))) return false;
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                        "application/octet-stream", "application/zip", "application/x-zip-compressed"});
                try {
                    startActivityForResult(intent, REQUEST_IMPORT_BACKUP);
                    setExportStatus("请选择 SocialMate 备份包…");
                } catch (Exception e) {
                    setExportStatus("无法打开文件选择器：" + e.getMessage());
                }
            });
            return true;
        }

        /**
         * 前端复制 GPT Voice Prompt 后回读校验：只返回是否与期望文本完全一致，
         * 不把剪贴板内容交给网页，避免误带其它 App 的隐私内容。
         */
        @JavascriptInterface
        public String clipboardMatches(String expected) {
            String page = trustedPageUrl;
            if (page == null || !isPrivatePanelUrl(Uri.parse(page))) {
                return "{\"ok\":false,\"match\":false,\"reason\":\"UNTRUSTED_PAGE\"}";
            }
            try {
                android.content.ClipboardManager cm =
                        (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                android.content.ClipData clip = cm == null ? null : cm.getPrimaryClip();
                if (clip == null || clip.getItemCount() == 0) {
                    return "{\"ok\":false,\"match\":false,\"reason\":\"EMPTY\"}";
                }
                CharSequence text = clip.getItemAt(0).coerceToText(AsrActivity.this);
                boolean match = text != null && text.toString().equals(expected == null ? "" : expected);
                return "{\"ok\":true,\"match\":" + match + "}";
            } catch (Exception e) {
                android.util.Log.w("SocialMateClip", "readback failed: " + e.getMessage());
                return "{\"ok\":false,\"match\":false,\"reason\":\"ERROR\"}";
            }
        }

        /**
         * WebView 里 execCommand('copy') 常被拒；由原生写入剪贴板并立刻回读比对。
         * 只接收这段 Prompt 文本，不读取其它剪贴板内容。
         */
        @JavascriptInterface
        public String copyToClipboard(String text) {
            String page = trustedPageUrl;
            String value = text == null ? "" : text;
            if (page == null || !isPrivatePanelUrl(Uri.parse(page))) {
                return "{\"ok\":false,\"match\":false,\"reason\":\"UNTRUSTED_PAGE\"}";
            }
            if (value.isEmpty() || value.length() > 20000) {
                return "{\"ok\":false,\"match\":false,\"reason\":\"BAD_INPUT\"}";
            }
            try {
                android.content.ClipboardManager cm =
                        (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                if (cm == null) return "{\"ok\":false,\"match\":false,\"reason\":\"NO_SERVICE\"}";
                cm.setPrimaryClip(android.content.ClipData.newPlainText("SocialMate Prompt", value));
                android.content.ClipData back = cm.getPrimaryClip();
                CharSequence got = back == null || back.getItemCount() == 0
                        ? null : back.getItemAt(0).coerceToText(AsrActivity.this);
                boolean match = got != null && got.toString().equals(value);
                return "{\"ok\":true,\"match\":" + match + "}";
            } catch (Exception e) {
                android.util.Log.w("SocialMateClip", "copy failed: " + e.getMessage());
                return "{\"ok\":false,\"match\":false,\"reason\":\"ERROR\"}";
            }
        }

        /** 网页设置里的「刷新界面」。 */
        @JavascriptInterface
        public boolean reloadPage() {
            String page = trustedPageUrl;
            if (page == null || !isPrivatePanelUrl(Uri.parse(page))) return false;
            runOnUiThread(() -> {
                if (socialMateWebView != null) socialMateWebView.reload();
            });
            return true;
        }

        /** 网页设置里的「语音服务地址」：打开面板并展开高级。 */
        @JavascriptInterface
        public boolean openAdvancedSettings() {
            String page = trustedPageUrl;
            if (page == null || !isPrivatePanelUrl(Uri.parse(page))) return false;
            runOnUiThread(() -> {
                showRecordingSheet();
                if (advancedTools != null) advancedTools.setVisibility(View.VISIBLE);
            });
            return true;
        }

        /** 双麦自检：仅可调试构建可用。 */
        @JavascriptInterface
        public boolean openDiagnostics() {
            String page = trustedPageUrl;
            if (page == null || !isPrivatePanelUrl(Uri.parse(page))) return false;
            boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
            if (!debuggable) return false;
            runOnUiThread(() -> startActivity(
                    new Intent(AsrActivity.this, MainActivity.class).putExtra("diagnostics", true)));
            return true;
        }

        /** 网页切换界面语言后同步：面板文案立刻跟着换，不必重新进页面。 */
        @JavascriptInterface
        public void setLanguage(String lang) {
            uiEn = "en".equalsIgnoreCase(lang);
            config.edit().putBoolean("ui_en", uiEn).apply();
            runOnUiThread(AsrActivity.this::applySheetLanguage);
        }

        @JavascriptInterface
        public boolean isRecording() {
            return running;
        }

        /** 内部配对桥：仅供本机取证/自动化使用，不暴露到页面 UI。 */
        @JavascriptInterface
        public String pairDevice(String code) {
            try {
                String error = pairing.pair(uiBaseForPairing(), code);
                if (error == null || error.isEmpty()) {
                    runOnUiThread(AsrActivity.this::warmTokenAsync);
                    return "ok";
                }
                return error;
            } catch (Exception e) {
                return "err:" + e.getClass().getSimpleName();
            }
        }

        /** 连接方式：家庭 WiFi / Tailscale / 本机 USB。只给状态条用，不暴露地址。 */
        @JavascriptInterface
        public String connectionMode() {
            String asr = config.getString("asr_url", "");
            if (asr.startsWith("wss://")) return "tailscale";
            if (asr.contains("127.0.0.1") || asr.contains("localhost")) return "usb";
            if (asr.startsWith("ws://")) return "lan";
            return "unknown";
        }

        @JavascriptInterface
        public boolean requestRecording() {
            runOnUiThread(() -> {
                String current = socialMateWebView == null ? null : socialMateWebView.getUrl();
                if (current == null || !isPrivatePanelUrl(Uri.parse(current))) {
                    toast(L("当前页面不可录音，请回到聊天页重试", "This page cannot record; return to Chat and retry."));
                    return;
                }
                trustedPageUrl = current;
                if (status != null) status.setText(L("正在打开麦克风…", "Starting microphone…"));
                startStreaming(true);
            });
            return true;
        }

        /** 网页「停止接收」→ 真正停止原生录音（否则界面显示已停、麦克风还在录）。 */
        @JavascriptInterface
        public boolean stopRecording() {
            String page = trustedPageUrl;
            if (page == null || !isPrivatePanelUrl(Uri.parse(page))) return false;
            runOnUiThread(() -> stopStreaming("网页停止"));
            return true;
        }

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

    /* ------------------------------------------------------------ S4 TTS */

    /**
     * 前端 window.SocialMateTts.*。所有方法返回 JSON 字符串（前端 JSON.parse），
     * 错误统一带 ok=false/code/message，绝不静默无声。
     */
    private final class TtsBridge {
        @JavascriptInterface
        public String speakText(String text, String lang) {
            return ttsJson(() -> ttsController.speakText(text, lang));
        }

        @JavascriptInterface
        public String speakTextWithLoop(String text, String lang, int loop) {
            return ttsJson(() -> ttsController.speakTextWithLoop(text, lang, loop));
        }

        /** N05：带真实 recordId/blockId/revision 的朗读入口（缓存键与业务来源绑定）。 */
        @JavascriptInterface
        public String speakTextWithIds(String text, String lang, int loop,
                                       String recordId, String blockId, int revision) {
            return ttsJson(() -> ttsController.speakTextWithIds(text, lang, loop,
                    recordId, blockId, revision));
        }

        @JavascriptInterface
        public String stop() {
            // V1.4：页面「停止」必须同时取消后台队列，否则熄屏队列会继续读下去。
            if (trustedPage()) {
                try {
                    TtsPlaybackService.control(AsrActivity.this, "stop");
                } catch (Exception ignored) {
                }
            }
            return ttsJson(() -> ttsController.stop());
        }

        /**
         * V1.4 后台队列入口：网页一次性下发整条播放计划，
         * 之后由前台服务驱动，熄屏/Home 都不再依赖本页存活。
         */
        @JavascriptInterface
        public String startQueue(String planJson, String origin) {
            if (!trustedPage()) return ttsErrorJson("TTS_UNTRUSTED_PAGE", "仅允许私有页面调用原生朗读");
            JSONObject result = TtsPlaybackService.startQueue(AsrActivity.this, planJson, origin);
            return result == null ? ttsErrorJson("TTS_INTERNAL_ERROR", "空结果") : result.toString();
        }

        @JavascriptInterface
        public String queueControl(String action) {
            if (!trustedPage()) return ttsErrorJson("TTS_UNTRUSTED_PAGE", "仅允许私有页面调用原生朗读");
            JSONObject result = TtsPlaybackService.control(AsrActivity.this, action);
            return result == null ? ttsErrorJson("TTS_INTERNAL_ERROR", "空结果") : result.toString();
        }

        @JavascriptInterface
        public String queueState() {
            if (!trustedPage()) return ttsErrorJson("TTS_UNTRUSTED_PAGE", "仅允许私有页面调用原生朗读");
            JSONObject result = TtsPlaybackService.queueState();
            return result == null ? ttsErrorJson("TTS_INTERNAL_ERROR", "空结果") : result.toString();
        }

        /** N05 V1.3：暂停当前读音（保留播放位置）。 */
        @JavascriptInterface
        public String pause() {
            return ttsJson(() -> ttsController.pause());
        }

        /** N05 V1.3：从暂停位置继续。 */
        @JavascriptInterface
        public String resume() {
            return ttsJson(() -> ttsController.resume());
        }

        @JavascriptInterface
        public String setRate(double rate) {
            return ttsJson(() -> ttsController.setRate(rate));
        }

        @JavascriptInterface
        public String setLoop(int count) {
            return ttsJson(() -> ttsController.setLoop(count));
        }

        @JavascriptInterface
        public String setPlaylist(String json) {
            return ttsJson(() -> ttsController.setPlaylist(json));
        }

        @JavascriptInterface
        public String nextSegment() {
            return ttsJson(() -> ttsController.nextSegment());
        }

        @JavascriptInterface
        public String previousSegment() {
            return ttsJson(() -> ttsController.previousSegment());
        }

        @JavascriptInterface
        public String status() {
            return ttsJson(() -> ttsController.status());
        }

        @JavascriptInterface
        public String voices() {
            return ttsJson(() -> ttsController.voices());
        }

        @JavascriptInterface
        public String diagnose(String lang) {
            return ttsJson(() -> ttsController.diagnose(lang));
        }

        @JavascriptInterface
        public String setVoice(String lang, String voiceName) {
            return ttsJson(() -> ttsController.setVoice(lang, voiceName));
        }

        @JavascriptInterface
        public String setListened(String key, boolean listened) {
            return ttsJson(() -> ttsController.setListened(key, listened));
        }

        @JavascriptInterface
        public String isListened(String key) {
            return ttsJson(() -> ttsController.isListened(key));
        }

        /** 页面「朗读引擎」→ 原生 provider：doubao=remote（手机豆包直连），system=system。 */
        @JavascriptInterface
        public String setTtsProvider(String engine) {
            if (!trustedPage()) return "{\"ok\":false,\"code\":\"UNTRUSTED\"}";
            String provider = "system".equals(engine) ? "system" : "remote";
            getSharedPreferences("socialmate-tts", MODE_PRIVATE).edit()
                    .putString("provider", provider).apply();
            JSONObject out = new JSONObject();
            try {
                out.put("ok", true).put("provider", provider);
            } catch (Exception ignored) {}
            return out.toString();
        }

        @JavascriptInterface
        public String prefs() {
            return ttsJson(() -> ttsController.prefsSnapshot());
        }

        @JavascriptInterface
        public boolean openSelfTest() {
            if (!trustedPage()) return false;
            runOnUiThread(() -> startActivity(new Intent(AsrActivity.this, TtsSelfTestActivity.class)));
            return true;
        }
    }

    /**
     * N05 V1.3：网页把播放队列时间线写进 logcat，作为真机验收的真实证据。
     * 只允许私有页面调用；不落盘、不外传，只在本地日志里。
     */
    private final class JsLogBridge {
        @JavascriptInterface
        public void log(String tag, String message) {
            if (!trustedPage()) return;
            String safeTag = tag == null || tag.isEmpty() ? "JS" : tag.replaceAll("[^A-Za-z0-9_.-]", "");
            String body = message == null ? "" : message;
            if (body.length() > 4000) body = body.substring(0, 4000) + "…";
            android.util.Log.i("SocialMateJs", "[" + safeTag + "] " + body);
        }
    }

    private boolean trustedPage() {
        String page = trustedPageUrl;
        return page != null && isPrivatePanelUrl(Uri.parse(page));
    }

    private String ttsJson(java.util.concurrent.Callable<JSONObject> call) {
        if (!trustedPage()) return ttsErrorJson("TTS_UNTRUSTED_PAGE", "仅允许私有页面调用原生朗读");
        TtsPlaybackController controller = ttsController;
        if (controller == null) return ttsErrorJson("TTS_NOT_INITIALIZED", "原生 TTS 尚未创建");
        try {
            JSONObject result = call.call();
            return result == null ? ttsErrorJson("TTS_INTERNAL_ERROR", "空结果") : result.toString();
        } catch (Exception e) {
            String message = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            android.util.Log.e("SocialMateTts", "bridge error: " + message);
            return ttsErrorJson("TTS_INTERNAL_ERROR", message);
        }
    }

    private static String ttsErrorJson(String code, String message) {
        JSONObject out = new JSONObject();
        try {
            out.put("ok", false).put("code", code).put("message", message);
        } catch (Exception ignored) { }
        return out.toString();
    }

    /** 队列/错误状态回传网页；语音包缺失时原生提示条同步可见（不只依赖网页）。 */
    private void onTtsState(JSONObject event) {
        if (event == null) return;
        String state = event.optString("state");
        if ("consent_required".equals(state)) {
            // 真实云 Polly：先在原生侧弹「发给谁/发什么/多少钱」，确认后才发文本。
            TtsConsentDialog.show(this, ttsController, event);
        }
        String code = event.optString("code");
        if ("error".equals(state)) {
            String message = event.optString("message");
            if ("TTS_LANG_UNAVAILABLE".equals(code)) {
                showNativeNotice("语音不可用：" + message
                        + "（设置 → 系统语音 → 安装语音包，或更换 TTS 引擎）");
            } else if ("TTS_ENGINE_MISSING".equals(code) || "TTS_INIT_FAILED".equals(code)) {
                showNativeNotice("系统朗读不可用：" + message + "（可更换 TTS 引擎）");
            }
        }
        if (socialMateWebView == null) return;
        final String payload = event.toString();
        runOnUiThread(() -> {
            if (socialMateWebView == null) return;
            /* N05 V1.3：网页把 window.SocialMateTtsHost 定义成普通对象，
               挂到注入对象上的属性不一定生效，所以优先走这个确定可达的全局。 */
            String js = "(function(){"
                    + "var m=" + JSONObject.quote(payload) + ";"
                    + "try{if(window.SocialMateTtsHost&&typeof window.SocialMateTtsHost.onState==='function')"
                    + "{window.SocialMateTtsHost.onState(m);return;}}catch(e){}"
                    + "try{if(window.SocialMateTts&&typeof window.SocialMateTts.onState==='function')"
                    + "{window.SocialMateTts.onState(m);}}catch(e){}"
                    + "})()";
            socialMateWebView.evaluateJavascript(js, null);
        });
    }

    /** 原生提示条：语音错误必须肉眼可见，不静默、不假成功。 */
    private void showNativeNotice(String text) {
        if (webHint == null) return;
        webHint.setTextColor(0xFF1C293A);
        webHint.setText(text);
        webHint.setVisibility(View.VISIBLE);
        webHint.postDelayed(() -> {
            if (webHint != null) webHint.setVisibility(View.GONE);
        }, 15000);
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

    /** 配对状态文案：明确「已配对/未配对」，未配对时上传会 fail closed。 */
    private void refreshPairingStatus() {
        if (pairingStatus == null) return;
        DevicePairing target = pairing;
        if (target == null) {
            pairingStatus.setText("配对：不可用");
            return;
        }
        if (!target.isPaired()) {
            pairingStatus.setText("配对：未配对（未配对时不会上传，也不会注入令牌）");
            return;
        }
        String token = target.cachedToken();
        String id = target.deviceId();
        String shortId = id.length() > 12 ? id.substring(0, 12) + "…" : id;
        pairingStatus.setText("配对：已配对 " + shortId
                + (token.isEmpty() ? "（短期令牌待刷新）" : "（短期令牌有效）"));
    }

    /** 配对/取令牌用的服务基地址：必须指向 Mac 8791，不能用本机页面 origin。 */
    private String uiBaseForPairing() {
        return macUiBase();
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
        if (requestCode == REQUEST_FILE_CHOOSER) {
            if (fileChooserCallback != null) {
                fileChooserCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                fileChooserCallback = null;
            }
            return;
        }
        if (requestCode == REQUEST_EXPORT_BACKUP) {
            if (resultCode != RESULT_OK || data == null || data.getData() == null) {
                pendingBackupPassword = "";
                setExportStatus("已取消导出备份");
                return;
            }
            Uri target = data.getData();
            final String password = pendingBackupPassword;
            pendingBackupPassword = "";
            setExportStatus("正在导出加密备份…");
            new Thread(() -> {
                try (java.io.OutputStream out = getContentResolver().openOutputStream(target, "w")) {
                    if (out == null) throw new java.io.IOException("无法写入目标文件");
                    LocalBackup.exportTo(LocalStore.get(this), out, password);
                    out.flush();
                    runOnUiThread(() -> setExportStatus("已导出加密备份（含图片）"));
                } catch (Exception e) {
                    runOnUiThread(() -> setExportStatus("导出失败："
                            + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage())));
                }
            }, "sm-backup-export").start();
            return;
        }
        if (requestCode == REQUEST_IMPORT_BACKUP) {
            if (resultCode != RESULT_OK || data == null || data.getData() == null) {
                setExportStatus("已取消导入备份");
                return;
            }
            Uri source = data.getData();
            setExportStatus("正在检查备份包…");
            new Thread(() -> {
                boolean encrypted = isEncryptedBackup(source);
                runOnUiThread(() -> {
                    if (encrypted) promptImportPassword(source);
                    else doImportBackup(source, "");
                });
            }, "sm-backup-check").start();
            return;
        }
        if (requestCode == REQUEST_CAPTURE_PHOTO) {
            android.net.Uri uri = pendingCaptureUri;
            String kind = pendingCaptureKind;
            String cardId = pendingCaptureCardId;
            pendingCaptureUri = null;
            pendingCaptureKind = "";
            pendingCaptureCardId = "";
            if (resultCode != RESULT_OK || uri == null) {
                setExportStatus("已取消拍照");
                return;
            }
            setExportStatus("正在保存照片…");
            new Thread(() -> {
                try (java.io.InputStream in = getContentResolver().openInputStream(uri)) {
                    if (in == null) throw new java.io.IOException("无法读取照片");
                    android.graphics.Bitmap bmp = android.graphics.BitmapFactory.decodeStream(in);
                    if (bmp == null) throw new java.io.IOException("照片解码失败");
                    int max = 1600;
                    float scale = Math.min(1f, max / (float) Math.max(bmp.getWidth(), bmp.getHeight()));
                    android.graphics.Bitmap outBmp = scale < 1f
                            ? android.graphics.Bitmap.createScaledBitmap(bmp,
                                    Math.max(1, (int) (bmp.getWidth() * scale)),
                                    Math.max(1, (int) (bmp.getHeight() * scale)), true)
                            : bmp;
                    java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
                    outBmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 82, baos);
                    String b64 = android.util.Base64.encodeToString(baos.toByteArray(),
                            android.util.Base64.NO_WRAP);
                    LocalStore.get(this).addCardMedia(kind, cardId, b64, "image/jpeg");
                    runOnUiThread(() -> {
                        setExportStatus("照片已加入卡片");
                        if (socialMateWebView != null) socialMateWebView.reload();
                    });
                } catch (Exception e) {
                    runOnUiThread(() -> setExportStatus("拍照保存失败："
                            + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage())));
                }
            }, "sm-capture-save").start();
            return;
        }
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

    /** 只读文件头，判断是否是 AES-GCM 加密备份（SMBK1）。 */
    private boolean isEncryptedBackup(Uri uri) {
        try (java.io.InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) return false;
            byte[] head = new byte[5];
            int read = 0;
            while (read < 5) {
                int n = in.read(head, read, 5 - read);
                if (n < 0) break;
                read += n;
            }
            return read == 5 && head[0] == 'S' && head[1] == 'M' && head[2] == 'B'
                    && head[3] == 'K' && head[4] == '1';
        } catch (Exception e) {
            return false;
        }
    }

    private void promptImportPassword(Uri source) {
        android.widget.EditText pwd = new android.widget.EditText(this);
        pwd.setHint("导出时设置的备份口令");
        pwd.setInputType(android.text.InputType.TYPE_CLASS_TEXT
                | android.text.InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD);
        int pad = dp(18);
        pwd.setPadding(pad, dp(8), pad, 0);
        new android.app.AlertDialog.Builder(this)
                .setTitle("解密备份")
                .setMessage("这是加密备份；口令错误将无法导入。")
                .setView(pwd)
                .setNegativeButton("取消", (dialog, which) -> setExportStatus("已取消导入"))
                .setPositiveButton("导入", (dialog, which) -> doImportBackup(source, pwd.getText().toString()))
                .show();
    }

    private void doImportBackup(Uri source, String password) {
        setExportStatus("正在导入本机备份…");
        new Thread(() -> {
            try (java.io.InputStream in = getContentResolver().openInputStream(source)) {
                if (in == null) throw new java.io.IOException("无法读取备份文件");
                JSONObject result = LocalBackup.importFrom(LocalStore.get(this), in, getCacheDir(), password);
                runOnUiThread(() -> {
                    setExportStatus("已导入 " + result.optInt("imported") + " 项、图片 "
                            + result.optInt("media") + " 张");
                    if (socialMateWebView != null) socialMateWebView.reload();
                });
            } catch (Exception e) {
                runOnUiThread(() -> setExportStatus("导入失败："
                        + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage())));
            }
        }, "sm-backup-import").start();
    }

    /**
     * 系统返回键。
     * 之前的实现是「把 webPanel 设成 GONE」——那就是白屏卡死的根因：网页被藏起来，
     * Activity 还活着，用户看到一整片空白。正确顺序是：
     * 录音面板 → 网页里的弹层/抽屉/非首页 Tab → 网页历史 → 退出。
     */
    @Override public void onBackPressed() {
        if (sheet != null && sheet.getVisibility() == View.VISIBLE) {
            hideRecordingSheet();
            return;
        }
        if (socialMateWebView == null) {
            super.onBackPressed();
            return;
        }
        socialMateWebView.evaluateJavascript(
                "(function(){try{return (window.smBack&&window.smBack())?'1':'0'}catch(e){return '0'}})()",
                value -> {
                    if ("\"1\"".equals(value)) return;   // 网页自己消费了这次返回
                    String url = String.valueOf(socialMateWebView.getUrl());
                    boolean onPrivatePage;
                    try {
                        onPrivatePage = isPrivatePanelUrl(Uri.parse(url));
                    } catch (Exception e) {
                        onPrivatePage = false;
                    }
                    // 只在私有页内部回退；否则历史里可能是一条 about:blank，回退就又是白屏。
                    if (onPrivatePage && socialMateWebView.canGoBack()) {
                        socialMateWebView.goBack();
                        return;
                    }
                    finish();
                });
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
        AudioDeviceInfo usb = config.getBoolean("force_builtin_mic", false)
                ? AudioInputs.builtinMic(am) : AudioInputs.preferredUsb(am);
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

    private boolean pendingAutoStart = false;

    private void startStreaming() {
        startStreaming(false);
    }

    private void startStreaming(boolean oneTap) {
        if (running) {
            // 页面显示「开始录音」说明上一轮在界面上已经结束；这里强制重启，
            // 避免原生 running 残留导致点击后完全没反应。
            toast(L("正在重新开始录音…", "Restarting recording…"));
            final Thread previous = worker;
            running = false;
            AudioRecord old = recorder;
            if (old != null) {
                try { old.stop(); } catch (IllegalStateException ignored) {}
            }
            new Thread(() -> {
                if (previous != null) {
                    try { previous.join(1400); } catch (InterruptedException ignored) {}
                }
                runOnUiThread(() -> startStreaming(oneTap));
            }, "sm-restart-recording").start();
            return;
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            pendingAutoStart = oneTap;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_MIC);
            return;
        }
        String base = urlInput.getText().toString().trim();
        config.edit().putString("asr_url", base)
                .putString("ui_url", uiUrlInput == null ? PRIVATE_UI_URL : uiUrlInput.getText().toString().trim())
                .apply();
        if (!directAsrMode() && !base.startsWith("ws://") && !base.startsWith("wss://")) {
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
        // 一键开录默认留存本轮原文；高级设置里取消勾选则不落盘。
        boolean keepTranscript = oneTap || retentionConsent == null || retentionConsent.isChecked();
        archive.begin(keepTranscript, appVersion());
        setArchiveStatus(archive.describe());
        running = true;
        reconnectBuffers.clear();
        // P1-5：切后台/锁屏仍继续收音，由 microphone 前台服务保活。
        AsrForegroundService.start(this);
        refreshRetentionHint();
        eventCount = 0;
        lastFinal = "";
        suggestionsView.setText("英文建议：—");
        suggestButton.setEnabled(false);
        startButton.setEnabled(false);
        stopButton.setEnabled(true);
        if (reviewButton != null) {
            reviewButton.setEnabled(false);
            reviewButton.setText(L("本轮原文与复盘","Transcript & review"));reg(reviewButton,"本轮原文与复盘","Transcript & review");
        }
        urlInput.setEnabled(false);
        trackPicker.setEnabled(false);
        status.setText("正在打开麦克风并连接服务端…");
        // 开始后收起录音面板，回到五 Tab 主界面（字幕在聊天页实时显示）。
        hideRecordingSheet();
        showSocialMatePanel();
        if (finals.length() > 0) finals.append("\n— 新会话 —\n");
        transcript.setText(finals.toString());

        final String baseUrl = clean;
        final String[] useTracks = tracks;
        Thread t = new Thread(() -> stream(baseUrl, useTracks), "asr-stream");
        worker = t;
        t.start();
    }

    /** 直连模式：设置里选「腾讯直连」且 AppId/SecretId/SecretKey 齐全。 */
    private boolean directAsrMode() {
        if (!"direct".equals(config.getString("asr_mode", "mac"))) return false;
        CloudKeys keys = new CloudKeys(this);
        return keys.hasTencentAsr();
    }

    /** 按当前模式建 ASR 会话：腾讯直连在手机本地签名，Mac 中继仍走配对令牌。 */
    private AsrClient openAsrClient(String track, String baseUrl, String suffix, String token) throws Exception {
        if (directAsrMode()) {
            CloudKeys keys = new CloudKeys(this);
            String engine = "mix".equals(track) ? "16k_zh_en_speaker_2.0" : "16k_en";
            String voice = TencentAsrSign.newVoiceId();
            String url = TencentAsrSign.createUrl(
                    keys.get(CloudKeys.TENCENT_APP_ID),
                    keys.get(CloudKeys.TENCENT_SECRET_ID),
                    keys.get(CloudKeys.TENCENT_SECRET_KEY),
                    engine, track, voice);
            return new TencentAsrClient(new URI(url), track, voice, this);
        }
        return new AsrClient(new URI(baseUrl + suffix + "&track=" + track), track, token, this);
    }

    private String uriHost(String baseUrl) {
        try {
            String host = new URI(baseUrl).getHost();
            return host == null ? baseUrl : host;
        } catch (Exception e) {
            return baseUrl;
        }
    }

    /** P1-3：首连最多 3 次，避免 4G/TLS 4s 抖动直接判整轮失败。 */
    private AsrClient openWithRetry(String track, String baseUrl, String suffix, String token) throws Exception {
        Exception last = null;
        for (int attempt = 1; attempt <= 3 && running; attempt++) {
            AsrClient client = null;
            try {
                client = openAsrClient(track, baseUrl, suffix, token);
                if (client.awaitOpen()) return client;
            } catch (Exception e) {
                last = e;
            }
            if (client != null) {
                try { client.closeBlocking(); } catch (Exception ignored) {}
            }
            if (attempt < 3) {
                try { Thread.sleep(800L * attempt); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); break; }
            }
        }
        throw last == null ? new Exception("无法连接服务端") : last;
    }

    /** P1-2：断线时把最近音频入有界队列，重连成功后补发。 */
    private void bufferFrame(String track, byte[] frame) {
        java.util.ArrayDeque<byte[]> queue = reconnectBuffers.computeIfAbsent(
                track, k -> new java.util.ArrayDeque<>());
        synchronized (queue) {
            while (queue.size() >= RECONNECT_BUFFER_FRAMES) queue.removeFirst();
            queue.addLast(java.util.Arrays.copyOf(frame, frame.length));
        }
    }

    private void flushBuffered(String track, AsrClient client) {
        java.util.ArrayDeque<byte[]> queue = reconnectBuffers.remove(track);
        if (queue == null || client == null) return;
        synchronized (queue) {
            for (byte[] frame : queue) {
                if (!client.isAlive()) break;
                client.sendPcm(frame);
            }
        }
    }

    private void stream(String baseUrl, String[] tracks) {
        AudioRecord rec = null;
        // T6：本轮结束信号按 track 计数（最少 1）。上游每条会话收尾都会推一条 session/ended，
        // 收到就不再固定 sleep，避免尾部 final 晚于 1500ms 到达而丢失归档。
        final CountDownLatch endedLatch = new CountDownLatch(Math.max(1, tracks == null ? 0 : tracks.length));
        asrEndedClients.clear();
        asrEndedLatch = endedLatch;
        try {
            // 手机直连腾讯不需要 Mac 配对令牌；Mac 中继仍 fail closed。
            final boolean directAsr = directAsrMode();
            final String asrToken = currentAccessToken();
            if (!directAsr && asrToken.isEmpty()) {
                throw new Exception(L("未配对或令牌失效，请重新配对后再录音",
                        "Not paired or token expired; pair this phone again before recording"));
            }
            AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
            AudioDeviceInfo target = config.getBoolean("force_builtin_mic", false)
                    ? AudioInputs.builtinMic(am) : AudioInputs.preferredUsb(am);
            if (target == null) target = AudioInputs.builtinMic(am);
            rec = AudioInputs.open(target);
            recorder = rec;
            int rate = rec.getSampleRate();
            int channels = rec.getChannelCount();
            String suffix = "?rate=" + rate + "&channels=" + channels;
            ArrayList<AsrClient> opened = new ArrayList<>();
            for (String track : tracks) {
                AsrClient client = openWithRetry(track, baseUrl, suffix, asrToken);
                clients.add(client);
                opened.add(client);
            }
            sessionStartMs = SystemClock.elapsedRealtime();
            stopRequested = false;
            asrLink = "connected";
            runOnUiThread(() -> {
                status.setText("已连接 · " + rate + " Hz · " + channels + " 声道 · 正在发送音频（"
                        + String.join("+", tracks) + "）");
                suggestButton.setEnabled(true);
                // 通知网页：原生已真正开录，可以订阅字幕了（用户没同意时不会走到这里）。
                if (socialMateWebView != null) {
                    socialMateWebView.evaluateJavascript(
                            "window.smNativeRecordingStarted&&window.smNativeRecordingStarted()", null);
                    notifyLink("connected", "");
                }
            });
            rec.startRecording();
            if (rec.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING)
                throw new Exception("startRecording 未启动");
            int frameBytes = rate / 10 * channels * 2;
            byte[] buffer = new byte[frameBytes];
            // 腾讯云 v2 单会话上限 300s；直连模式到点主动收尾，避免服务端断开后无限重连。
            final long maxSessionMs = directAsr
                    ? config.getLong("direct_asr_max_ms", 300_000L) : 0L;
            while (running) {
                if (directAsr && maxSessionMs > 0
                        && SystemClock.elapsedRealtime() - sessionStartMs >= maxSessionMs) {
                    runOnUiThread(() -> stopStreaming("已到 " + (maxSessionMs / 1000) + " 秒上限"));
                    break;
                }
                int got = rec.read(buffer, 0, buffer.length, AudioRecord.READ_BLOCKING);
                if (got < 0) {
                    if (!running) break;
                    throw new Exception("音频读取失败：" + got);
                }
                int whole = got - got % (channels * 2);
                if (whole == 0) continue;
                byte[] frame = whole == buffer.length ? buffer : java.util.Arrays.copyOf(buffer, whole);
                // 腾讯云 v2 只收 16k/mono；Mac 中继仍收原始帧（由服务端重采样/分轨）。
                byte[] sendFrame = directAsr ? Pcm16.to16kMono(frame, rate, channels) : frame;
                List<AsrClient> snapshot;
                synchronized (clients) { snapshot = new ArrayList<>(clients); }
                for (AsrClient client : snapshot) {
                    if (!client.isAlive()) {
                        // 断线 ≠ 正在识别：先缓存最近音频并重连；重连成功后补发，避免整段缺字。
                        bufferFrame(client.label(), sendFrame);
                        reconnectTrack(client, baseUrl + suffix, asrToken);
                        continue;
                    }
                    client.sendPcm(sendFrame);
                }
            }
        } catch (Exception e) {
            String msg = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            final String shown = msg;
            android.util.Log.e("SocialMateRec", "recording failed: " + msg);
            runOnUiThread(() -> {
                status.setText("连接/录音失败：" + shown);
                toast(L("录音失败：" + shown, "Recording failed: " + shown));
                notifyLink("lost", "连接中断，本轮未开始；可重试");
            });
            appendLine("[错误] " + msg);
        } finally {
            running = false;
            asrLink = "";
            reconnecting.clear();
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
                // T6：等待上游把所有 final 推完（每条 track 一条 session/ended），最长 3000ms；
                // 收到 ended 立即继续；断线/异常路径最多也只等这 3s，不会无限等待。
                try {
                    boolean ended = endedLatch.await(3000L, TimeUnit.MILLISECONDS);
                    android.util.Log.i("SocialMateRec", "stop wait ended=" + ended
                            + " remaining=" + endedLatch.getCount());
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
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
                suggestButton.setEnabled(false);
                urlInput.setEnabled(true);
                trackPicker.setEnabled(true);
                live.setText("实时（未定稿）：—");
                refreshRetentionHint();
                if (!status.getText().toString().startsWith("连接/录音失败"))
                    status.setText("状态：已停止 · 收到事件 " + eventCount + " 条"
                            + (archive.lastSessionId() == null ? "" : " · 可点「本轮原文与复盘」"));
                // 原生已停录：让网页把「监听中」收起来，避免界面与实际麦克风状态不一致。
                if (socialMateWebView != null) {
                    socialMateWebView.evaluateJavascript(
                            "(function(){try{if(window.smNativeRecordingStopped)window.smNativeRecordingStopped();}catch(e){}})()",
                            null);
                }
                updateReviewEntry();
            });
        }
    }

    /** 断线重连：同一 track 单飞，退避 1s/2s/4s，最多 3 次；失败则明确停录并提示。 */
    private void reconnectTrack(AsrClient lost, String baseWithParams, String token) {
        final String track = lost.label();
        if (!reconnecting.add(track)) return;
        asrLink = "reconnecting";
        notifyLink("reconnecting", "连接中断 · 正在重连…");
        new Thread(() -> {
            boolean recovered = false;
            for (int attempt = 1; attempt <= 3 && running; attempt++) {
                notifyLink("reconnecting", "连接中断 · 正在重连（" + attempt + "/3）…");
                try { Thread.sleep(1000L << (attempt - 1)); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); break; }
                if (!running) break;
                AsrClient next = null;
                try {
                    // baseWithParams 已含 ?rate=...，直连模式会忽略它并重新签名。
                    // P1-7：重连不复用开局令牌；Mac 中继重新取短期令牌，直连模式不需要。
                    String freshToken = directAsrMode() ? "" : currentAccessToken();
                    if (freshToken.isEmpty()) freshToken = token;
                    next = openAsrClient(track, baseWithParams, "", freshToken);
                    if (next.awaitOpen() && running) {
                        // P1-2：新会话事件时间轴接着本轮已录时长，避免页面字幕时间倒退。
                        next.timeOffsetMs = SystemClock.elapsedRealtime() - sessionStartMs;
                        synchronized (clients) {
                            clients.remove(lost);
                            clients.add(next);
                        }
                        flushBuffered(track, next);
                        recovered = true;
                        break;
                    }
                } catch (Exception ignored) {
                    // 继续下一次退避；原因不展示给用户，避免把 WS 细节泄漏到界面。
                }
                if (next != null) {
                    try { next.closeBlocking(); } catch (Exception ignored) { }
                }
            }
            reconnecting.remove(track);
            if (recovered) {
                asrLink = "connected";
                notifyLink("recovered", "连接已恢复");
            } else if (running) {
                asrLink = "lost";
                notifyLink("lost", "连接中断，本轮已停止；可重新开始");
                stopStreaming("连接中断");
            }
        }, "asr-reconnect-" + track).start();
    }

    /** 只给私有页面一句人类可读的连接状态，不暴露 URL/WS 细节。 */
    private void notifyLink(String state, String text) {
        runOnUiThread(() -> {
            if (status != null) status.setText(text == null || text.isEmpty()
                    ? (state.equals("recovered") ? "已恢复连接" : status.getText().toString())
                    : text);
            WebView view = socialMateWebView;
            if (view == null) return;
            String safeState = state == null ? "" : state.replace("'", "");
            String safeText = text == null ? "" : text.replace("\\", "\\\\").replace("'", "\\'");
            view.evaluateJavascript(
                    "(function(){try{if(window.smNativeLinkState)window.smNativeLinkState('"
                            + safeState + "','" + safeText + "');}catch(e){}})()", null);
        });
    }

    private void stopStreaming(String reason) {
        if (!running) return;
        running = false;
        stopRequested = true;
        AsrForegroundService.stop(this);
        // 停止后立刻恢复「开始录音」按钮，避免收尾异常时界面卡在禁用态。
        runOnUiThread(() -> {
            if (startButton != null) startButton.setEnabled(true);
            if (stopButton != null) stopButton.setEnabled(false);
        });
        status.setText("正在停止…（" + reason + "）");
        AudioRecord r = recorder;
        if (r != null) {
            try { r.stop(); } catch (IllegalStateException ignored) {}
        }
    }

    @Override public void onRequestPermissionsResult(int code, String[] names, int[] results) {
        super.onRequestPermissionsResult(code, names, results);
        if (code == REQUEST_MIC && results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            startStreaming(pendingAutoStart);
        } else if (code == REQUEST_MIC) {
            status.setText("没有麦克风权限，无法识别。");
            toast(L("麦克风权限被拒绝，请在系统设置里允许", "Microphone permission denied; enable it in Settings."));
        }
    }

    @Override public void onAsrState(AsrClient client, String state) {
        runOnUiThread(() -> {
            if (state.startsWith("error")) appendLine("[" + client.label() + "] " + state);
            else if (state.equals("connected") && eventCount == 0) status.setText("已连接（" + client.label() + "），等待音频事件…");
        });
    }

    @Override public void onAsrEvent(AsrClient client, JSONObject event) {
        long offset = client.timeOffsetMs;
        if (offset > 0) {
            String t = event.optString("type", "");
            if ("final".equals(t) || "interim".equals(t)) {
                try {
                    event.put("startMs", event.optLong("startMs", 0) + offset);
                    event.put("endMs", event.optLong("endMs", 0) + offset);
                } catch (Exception ignored) {}
            }
        }
        publishAsrToPage(client, event);
        String type = event.optString("type", "");
        if ("session".equals(type)) {
            String s = event.optString("status", "");
            // T6：上游会话明确结束（ended / end）即「本轮 final 已全部推送」的信号。
            // 只统计当前仍在本轮的 client，避免重连被替换下来的旧会话误放行。
            if ("ended".equals(s) || "end".equals(s)) {
                CountDownLatch latch = asrEndedLatch;
                if (stopRequested && latch != null && clients.contains(client) && asrEndedClients.add(client)) {
                    latch.countDown();
                }
            }
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

    /**
     * 把原生 ASR 事件广播给本机页面的 SSE 订阅者。
     * 只在内存转发：partial 不落盘；final 的归档仍由 SessionArchive 按留存同意处理。
     */
    private void publishAsrToPage(AsrClient client, JSONObject event) {
        LocalServer server = localServer;
        if (server == null || event == null) return;
        try {
            String type = event.optString("type", "");
            if (!"session".equals(type) && !"error".equals(type)
                    && !"interim".equals(type) && !"final".equals(type)) return;
            JSONObject e = new JSONObject(event.toString());
            if (!e.has("track")) e.put("track", client == null ? "" : client.label());
            if ("final".equals(type)) {
                e.put("final", true);
                if (!e.has("provider")) e.put("provider", "tencent");
                if (!e.has("index")) e.put("index", eventCount);
                if (!e.has("sessionId")) {
                    String sid = archive == null ? null : archive.lastSessionId();
                    if (sid != null) e.put("sessionId", sid);
                }
            }
            server.publishAsr(e);
        } catch (Exception ignored) {
            // 页面订阅失败不能影响录音与归档主流程。
        }
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

    @Override protected void onStart() {
        super.onStart();
        // 前台可见时接住服务事件；切后台后事件仍会写进队列状态，回来再同步。
        TtsPlaybackService.setUiListener(this::onTtsState);
    }

    @Override protected void onResume() {
        super.onResume();
        // CG02：重新进入 App 时把后台队列的真实进度推给页面，避免显示「已停止」。
        pushQueueStateToPage();
    }

    @Override protected void onStop() {
        super.onStop();
        TtsPlaybackService.clearUiListener(null);
        // P1-5：录音由 microphone 前台服务保活，切后台/锁屏不再停录。
        // 只有用户点停止、页面销毁或上游明确中断时才停止（onDestroy/stopStreaming）。
        /* V1.4：后台朗读队列由前台服务持有，熄屏/切后台绝不能在这里被 stop 掉。
           只有在没有活动队列时才保持旧的「切页即释放」语义。 */
        if (ttsController != null && !TtsPlaybackService.hasActiveQueue()) ttsController.onStop();
    }

    /** 把服务里的队列真实状态回灌给页面（恢复当前项与轮次，不重播）。 */
    private void pushQueueStateToPage() {
        if (socialMateWebView == null) return;
        JSONObject state = TtsPlaybackService.queueState();
        if (state == null) return;
        final String payload = state.toString();
        runOnUiThread(() -> {
            if (socialMateWebView == null) return;
            String js = "(function(){"
                    + "var m=" + JSONObject.quote(payload) + ";"
                    + "try{if(window.SocialMateTtsHost&&typeof window.SocialMateTtsHost.onState==='function')"
                    + "{window.SocialMateTtsHost.onState(m);}}catch(e){}"
                    + "})()";
            socialMateWebView.evaluateJavascript(js, null);
        });
    }

    @Override protected void onDestroy() {
        running = false;
        if (localServer != null) {
            localServer.stop();
            localServer = null;
        }
        unregisterNetworkRecovery();
        TtsPlaybackService.clearUiListener(null);
        // V1.4：队列还在跑时不能 shutdown 引擎（后台继续朗读要靠它）。
        if (ttsController != null && !TtsPlaybackService.hasActiveQueue()) {
            ttsController.shutdown();
            ttsController = null;
        }
        if (archive != null) archive.setListener(null);
        pendingSaveName = null;
        pendingSaveText = null;
        if (socialMateWebView != null) {
            if (bridgeAttached) {
                socialMateWebView.removeJavascriptInterface(BRIDGE_NAME);
                bridgeAttached = false;
            }
            if (ttsBridgeAttached) {
                socialMateWebView.removeJavascriptInterface(TTS_BRIDGE_NAME);
                ttsBridgeAttached = false;
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
