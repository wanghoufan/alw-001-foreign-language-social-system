package app.socialmate.dualmic;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.SystemClock;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Independent foreground-only hardware probe for BOYA 2TX/1RX USB-C receivers.
 * No network permission, ASR or AI. No recording while app is backgrounded.
 */
public final class MainActivity extends Activity {
    private static final int REQUEST_MIC = 101;
    private static final int REQUEST_EXPORT = 102;
    private static final long TAKE_MILLIS = 5000L;
    private static final int[] SAMPLE_RATES = {48000, 44100, 16000};

    private final AtomicBoolean stopRequested = new AtomicBoolean(false);
    private final ArrayList<AudioDeviceInfo> inputDevices = new ArrayList<>();
    private final ArrayList<File> exportFiles = new ArrayList<>();
    private volatile AudioRecord activeRecord;
    private volatile Thread worker;
    private String pendingStage;
    private File pendingExport;
    private Spinner sourcePicker;
    private LinearLayout diagnosticTools;
    private TextView status;
    private TextView meters;
    private TextView resultView;
    private TextView deviceDetails;
    private Button aButton, bButton, stopButton, exportButton;
    private TakeResult takeA, takeB;

    private static final class TakeResult {
        String stage, directory, requestedDevice, routedDevice, audioSource;
        int requestedDeviceId, routedDeviceId, sampleRate, channels;
        long frames, clips;
        double leftDb, rightDb;
        boolean routeVerified;
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        // 产品形态：点图标直接进主界面（五 Tab），不再先插一页原生卡片。
        // 双麦检测属于开发工具，只有带 diagnostics=true 显式进入时才展示。
        if (!getIntent().getBooleanExtra("diagnostics", false)) {
            startActivity(new Intent(this, AsrActivity.class));
            finish();
            return;
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        buildUi();
        refreshDevices();
    }

    private int dp(int value) { return (int) (getResources().getDisplayMetrics().density * value + 0.5f); }
    private android.graphics.drawable.GradientDrawable surface(int color, int border, int radius) {
        android.graphics.drawable.GradientDrawable drawable = new android.graphics.drawable.GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radius));
        if (border != 0) drawable.setStroke(dp(1), border);
        return drawable;
    }
    private LinearLayout section(LinearLayout parent) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(18), dp(18), dp(18), dp(18));
        card.setBackground(surface(0xFFFFFFFF, 0xFFE2E9EA, 18));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.bottomMargin = dp(16);
        parent.addView(card, lp);
        return card;
    }
    private static void applyInsets(ScrollView scroller) {
        scroller.setOnApplyWindowInsetsListener((v, insets) -> {
            int top, bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                top = bars.top; bottom = bars.bottom;
            } else {
                top = insets.getSystemWindowInsetTop();
                bottom = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(0, top, 0, bottom);
            return insets;
        });
    }
    private TextView text(LinearLayout root, String value, int sp) {
        TextView t = new TextView(this);
        t.setText(value);
        t.setTextSize(sp);
        // 背景固定浅色，文字颜色也固定，避免系统深色模式把字变白（白字白底看不见）。
        t.setTextColor(0xFF1C293A);
        t.setPadding(0, dp(7), 0, dp(7));
        root.addView(t);
        return t;
    }
    private Button button(LinearLayout root, String caption, View.OnClickListener action) {
        Button b = new Button(this);
        b.setAllCaps(false); b.setText(caption); b.setTextSize(16); b.setTextColor(0xFF1C293A);
        b.setOnClickListener(action);
        root.addView(b, new LinearLayout.LayoutParams(-1, dp(51)));
        return b;
    }
    private String appVersion() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "未知";
        }
    }
    private void buildUi() {
        ScrollView scroller = new ScrollView(this);
        applyInsets(scroller);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(20), dp(20), dp(25));
        scroller.addView(root);
        setContentView(scroller);
        // Daily-use entry: the speech/AI conversation is primary; the hardware probe stays available.
        root.setBackgroundColor(0xFFF5F7F8);
        LinearLayout welcome = section(root);
        text(welcome, "SocialMate", 26).setTextColor(0xFF176E63);
        text(welcome, "外语社交助手 · 实时对话", 17);
        text(welcome, "听懂英语对话，获得自然接话、追问和真实海南资料推荐。", 16);
        Button conversation = button(welcome, "开始实时对话  →", v ->
                startActivity(new Intent(this, AsrActivity.class)));
        conversation.setTextColor(0xFFFFFFFF);
        conversation.setBackground(surface(0xFF176E63, 0, 15));
        conversation.setElevation(dp(2));
        text(welcome, "录音需同行者同意；将字幕发送给 AI 还需在聊天页单独授权。", 14);
        Button diagnosticToggle = button(root, "录音设备检测与高级工具  ▾", v -> {
            if (diagnosticTools == null) return;
            boolean show = diagnosticTools.getVisibility() != View.VISIBLE;
            diagnosticTools.setVisibility(show ? View.VISIBLE : View.GONE);
            ((Button) v).setText(show ? "收起高级工具  ▴" : "录音设备检测与高级工具  ▾");
        });
        diagnosticToggle.setTextColor(0xFF176E63);
        diagnosticTools = new LinearLayout(this);
        diagnosticTools.setPadding(dp(15), dp(15), dp(15), dp(15));
        diagnosticTools.setBackground(surface(0xFFFFFFFF, 0xFFE2E9EA, 18));
        diagnosticTools.setOrientation(LinearLayout.VERTICAL);
        diagnosticTools.setVisibility(View.GONE);
        root.addView(diagnosticTools, new LinearLayout.LayoutParams(-1, -2));
        root = diagnosticTools;
        text(root, "博雅双麦检测 · 高级工具", 20);
        text(root, "版本 " + appVersion(), 15);
        text(root, "设备检测不会上传音频；仅在实时对话中、取得同意后才会连接云端语音识别。", 16);
        sourcePicker = new Spinner(this);
        root.addView(sourcePicker, new LinearLayout.LayoutParams(-1, dp(58)));
        button(root, "刷新音频设备", v -> refreshDevices());
        deviceDetails = text(root, "设备信息待读取", 14);
        aButton = button(root, "① 只对麦克风 A 说话 5 秒", v -> requestRecording("A"));
        bButton = button(root, "② 只对麦克风 B 说话 5 秒", v -> requestRecording("B"));
        stopButton = button(root, "停止录音", v -> stopCapture());
        exportButton = button(root, "导出 WAV / 检测报告（方便试听）", v -> showExportPicker());
        button(root, "进入实时对话", v -> startActivity(new Intent(this, AsrActivity.class)));
        status = text(root, "状态：待录音", 17);
        meters = text(root, "左 / 右声道：待检测", 18);
        resultView = text(root, "先用 A 独说，保持 B 安静；再用 B 独说，保持 A 安静。两次结束后自动给出判断。", 17);
        text(root, "注意：即使录到立体声，也可能只是两路相同的混音。只有 A、B 分别说话时声道优势相反，才算疑似可分轨；最终还须试听左右 WAV。锁屏或切后台会结束录音。", 15);
        setBusy(false);
    }

    private String deviceType(AudioDeviceInfo d) {
        switch (d.getType()) {
            case AudioDeviceInfo.TYPE_USB_DEVICE: return "USB_DEVICE";
            case AudioDeviceInfo.TYPE_USB_HEADSET: return "USB_HEADSET";
            case AudioDeviceInfo.TYPE_BUILTIN_MIC: return "BUILTIN_MIC";
            case AudioDeviceInfo.TYPE_WIRED_HEADSET: return "WIRED_HEADSET";
            case AudioDeviceInfo.TYPE_BLUETOOTH_SCO: return "BLUETOOTH_SCO";
            default: return "TYPE_" + d.getType();
        }
    }
    private boolean usb(AudioDeviceInfo d) {
        return d != null && (d.getType() == AudioDeviceInfo.TYPE_USB_DEVICE ||
                d.getType() == AudioDeviceInfo.TYPE_USB_HEADSET);
    }
    private String description(AudioDeviceInfo d) {
        if (d == null) return "(无)";
        return deviceType(d) + " #" + d.getId() + " · " + d.getProductName();
    }
    private String numbers(int[] values) {
        if (values == null || values.length == 0) return "设备未声明";
        StringBuilder b = new StringBuilder();
        for (int v : values) { if (b.length() > 0) b.append(","); b.append(v); }
        return b.toString();
    }
    private void refreshDevices() {
        if (worker != null && worker.isAlive()) return;
        AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
        inputDevices.clear();
        ArrayList<String> captions = new ArrayList<>();
        int defaultSelection = 0, index = 0;
        for (AudioDeviceInfo device : am.getDevices(AudioManager.GET_DEVICES_INPUTS)) {
            inputDevices.add(device);
            captions.add(description(device));
            if (usb(device)) defaultSelection = index;
            index++;
        }
        if (captions.isEmpty()) captions.add("没有发现音频输入设备");
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, captions);
        sourcePicker.setAdapter(adapter);
        if (!inputDevices.isEmpty()) sourcePicker.setSelection(defaultSelection);
        deviceDetails.setText("已识别 " + inputDevices.size() + " 个输入设备。默认选择 USB 接收器；请确认型号。\n"
                + (inputDevices.isEmpty() ? "" : "当前输入： " + description(inputDevices.get(defaultSelection))
                + "\n设备声明声道数：" + numbers(inputDevices.get(defaultSelection).getChannelCounts())
                + "\n设备声明采样率：" + numbers(inputDevices.get(defaultSelection).getSampleRates()))
                + "\n注意：声明支持立体声 ≠ 安卓实际录到了双路独立声音。");
    }

    private void requestRecording(String stage) {
        if (worker != null && worker.isAlive()) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            pendingStage = stage;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_MIC);
            return;
        }
        beginCapture(stage);
    }
    @Override public void onRequestPermissionsResult(int code, String[] names, int[] results) {
        super.onRequestPermissionsResult(code, names, results);
        if (code == REQUEST_MIC && results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED
                && pendingStage != null) {
            String s = pendingStage; pendingStage = null; beginCapture(s);
        } else if (code == REQUEST_MIC) {
            pendingStage = null;
            status.setText("没有录音权限，无法测试。可在系统设置中开启麦克风权限。");
        }
    }
    private void setBusy(boolean busy) {
        if (aButton == null) return;
        aButton.setEnabled(!busy); bButton.setEnabled(!busy);
        stopButton.setEnabled(busy); sourcePicker.setEnabled(!busy);
        exportButton.setEnabled(!busy);
    }
    private void beginCapture(String stage) {
        int at = sourcePicker.getSelectedItemPosition();
        if (at < 0 || at >= inputDevices.size()) {
            status.setText("请先插入接收器并刷新设备。");
            return;
        }
        AudioDeviceInfo chosen = inputDevices.get(at);
        if (!usb(chosen)) {
            status.setText("当前不是 USB 音频输入。请先插入博雅接收器并选择它，避免误把手机内置麦当作测试结果。");
            return;
        }
        stopRequested.set(false);
        setBusy(true);
        status.setText("正在准备录制 " + stage + "，请让另一只麦克风保持安静…");
        Thread task = new Thread(() -> capture(stage, chosen), "dual-mic-capture");
        worker = task;
        task.start();
    }

    // UNPROCESSED first: AGC/NS can mask or rebalance the two wireless transmitters.
    private static final int[] AUDIO_SOURCES = {
            MediaRecorder.AudioSource.UNPROCESSED,
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            MediaRecorder.AudioSource.MIC};
    private static String sourceName(int source) {
        switch (source) {
            case MediaRecorder.AudioSource.UNPROCESSED: return "UNPROCESSED";
            case MediaRecorder.AudioSource.VOICE_RECOGNITION: return "VOICE_RECOGNITION";
            case MediaRecorder.AudioSource.MIC: return "MIC";
            default: return "SOURCE_" + source;
        }
    }
    private AudioRecord createRecord(AudioDeviceInfo chosen) throws Exception {
        String errors = "";
        for (int source : AUDIO_SOURCES) {
            for (int sampleRate : SAMPLE_RATES) {
                for (int channels : new int[]{2, 1}) {
                    int mask = channels == 2 ? AudioFormat.CHANNEL_IN_STEREO : AudioFormat.CHANNEL_IN_MONO;
                    int min = AudioRecord.getMinBufferSize(sampleRate, mask, AudioFormat.ENCODING_PCM_16BIT);
                    if (min <= 0) { errors += sampleRate + "/" + channels + " unsupported; "; continue; }
                    AudioRecord rec = null;
                    try {
                        AudioFormat format = new AudioFormat.Builder()
                                .setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(sampleRate)
                                .setChannelMask(mask).build();
                        rec = new AudioRecord.Builder().setAudioSource(source)
                                .setAudioFormat(format)
                                .setBufferSizeInBytes(Math.max(min * 2, 16384)).build();
                        if (rec.getState() != AudioRecord.STATE_INITIALIZED) throw new Exception("not initialized");
                        if (!rec.setPreferredDevice(chosen)) throw new Exception("cannot set preferred USB device");
                        return rec;
                    } catch (Exception e) {
                        errors += sourceName(source) + "/" + sampleRate + "/" + channels + ": "
                                + e.getMessage() + "; ";
                        if (rec != null) rec.release();
                    }
                }
            }
        }
        throw new Exception("无法打开音频输入：" + errors);
    }
    private static String fileStamp() {
        return new SimpleDateFormat("yyyyMMdd-HHmmss-SSS", Locale.US).format(new Date());
    }
    private void capture(String stage, AudioDeviceInfo chosen) {
        AudioRecord rec = null;
        String failure = null;
        TakeResult take = null;
        try {
            rec = createRecord(chosen);
            activeRecord = rec;
            int rate = rec.getSampleRate();
            int channels = rec.getChannelCount();
            if (channels != 1 && channels != 2) throw new Exception("unexpected channel count: " + channels);
            File base = getExternalFilesDir(Environment.DIRECTORY_MUSIC);
            if (base == null) base = getFilesDir();
            File folder = new File(base, "dualmic/" + fileStamp() + "_" + stage);
            if (!folder.mkdirs()) throw new Exception("cannot create " + folder);
            final File dir = folder;
            final int ch = channels;
            final int hz = rate;
            StereoAnalyzer analyser = new StereoAnalyzer(ch);
            rec.startRecording();
            if (rec.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING)
                throw new Exception("startRecording did not start");
            long start = SystemClock.elapsedRealtime();
            byte[] data = new byte[rate / 5 * ch * 2];
            byte[] left = new byte[data.length / ch];
            byte[] right = ch == 2 ? new byte[data.length / 2] : null;
            long nextUi = 0;
            try (WavWriter original = new WavWriter(new File(dir, "original.wav"), ch, hz);
                 WavWriter leftWav = new WavWriter(new File(dir, "left.wav"), 1, hz);
                 WavWriter rightWav = ch == 2 ? new WavWriter(new File(dir, "right.wav"), 1, hz) : null) {
                while (!stopRequested.get() && SystemClock.elapsedRealtime() - start < TAKE_MILLIS) {
                    int got = rec.read(data, 0, data.length, AudioRecord.READ_BLOCKING);
                    if (got < 0) { if (stopRequested.get()) break; throw new Exception("read error: " + got); }
                    int whole = got - (got % (ch * 2));
                    if (whole == 0) continue;
                    original.write(data, 0, whole);
                    analyser.add(data, 0, whole);
                    int frameCount = whole / (ch * 2);
                    for (int i = 0; i < frameCount; i++) {
                        int src = i * ch * 2, dst = i * 2;
                        left[dst] = data[src]; left[dst + 1] = data[src + 1];
                        if (ch == 2) {
                            right[dst] = data[src + 2]; right[dst + 1] = data[src + 3];
                        }
                    }
                    leftWav.write(left, 0, frameCount * 2);
                    if (rightWav != null) rightWav.write(right, 0, frameCount * 2);
                    long now = SystemClock.elapsedRealtime();
                    if (now > nextUi) {
                        double l = analyser.dbfs(0);
                        double r = ch == 2 ? analyser.dbfs(1) : l;
                        runOnUiThread(() -> meters.setText("正在录制 " + stage + " | L: "
                                + fmt(l) + " dBFS | R: " + (ch == 2 ? fmt(r) : "(MONO)") + " dBFS"));
                        nextUi = now + 250;
                    }
                }
            }
            AudioDeviceInfo routed = rec.getRoutedDevice();
            take = new TakeResult();
            take.stage = stage; take.directory = folder.getAbsolutePath();
            take.requestedDevice = description(chosen);
            take.requestedDeviceId = chosen.getId();
            take.routedDevice = description(routed);
            take.routedDeviceId = routed == null ? -1 : routed.getId();
            take.routeVerified = routed != null && take.requestedDeviceId == take.routedDeviceId;
            take.sampleRate = hz; take.channels = ch;
            take.audioSource = sourceName(rec.getAudioSource());
            take.frames = analyser.frames(); take.clips = analyser.clippedSamples();
            take.leftDb = analyser.dbfs(0);
            take.rightDb = ch == 2 ? analyser.dbfs(1) : analyser.dbfs(0);
            if (take.frames < hz) throw new Exception("录音不足 1 秒，不能判断");
            JSONObject meta = new JSONObject();
            meta.put("stage", stage); meta.put("requestedDevice", take.requestedDevice);
            meta.put("routedDevice", take.routedDevice);
            meta.put("routeVerified", take.routeVerified);
            meta.put("sampleRate", hz); meta.put("channels", ch); meta.put("audioSource", take.audioSource);
            meta.put("frames", take.frames);
            meta.put("clippedSamples", take.clips); meta.put("leftDbfs", take.leftDb);
            meta.put("rightDbfs", take.rightDb);
            meta.put("leftMinusRightDb", take.leftDb - take.rightDb);
            meta.put("note", "Candidate only. Listen to isolated left/right files. Never interpret stereo as proof of independent transmitters.");
            try (FileOutputStream os = new FileOutputStream(new File(folder, "diagnostics.json"))) {
                os.write(meta.toString(2).getBytes(StandardCharsets.UTF_8));
            }
            TakeResult completed = take;
            runOnUiThread(() -> {
                if ("A".equals(stage)) takeA = completed; else takeB = completed;
                status.setText("已完成 " + stage + "｜" + completed.sampleRate + " Hz · "
                        + completed.channels + " 声道 · " + completed.audioSource + "｜路由："
                        + (completed.routeVerified ? "USB 已核对" : "未确认！请复测"));
                evaluate();
                addExportFiles(dir);
            });
        } catch (Exception e) {
            failure = e.getMessage();
            final String message = failure == null ? e.getClass().getSimpleName() : failure;
            runOnUiThread(() -> status.setText("录制 " + stage + " 失败：" + message));
        } finally {
            if (rec != null) {
                try { if (rec.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) rec.stop(); }
                catch (IllegalStateException ignored) {}
                rec.release();
            }
            activeRecord = null;
            runOnUiThread(() -> setBusy(false));
        }
    }
    private static String fmt(double value) {
        return String.format(Locale.US, "%.1f", value);
    }
    private void evaluate() {
        if (takeA == null || takeB == null) {
            TakeResult t = takeA != null ? takeA : takeB;
            resultView.setText("已取得 " + t.stage + " 测试：采样率 " + t.sampleRate + "、声道数 "
                    + t.channels + "，L/R 音量 " + fmt(t.leftDb) + " / " + fmt(t.rightDb)
                    + " dBFS。请完成另外一只麦克风的独说测试。");
            return;
        }
        if (!takeA.routeVerified || !takeB.routeVerified
                || takeA.requestedDeviceId != takeB.requestedDeviceId
                || takeA.sampleRate != takeB.sampleRate) {
            resultView.setText("INCONCLUSIVE：两段的 USB 路由或采样率无法确认一致；请插好接收器后重新测。");
            return;
        }
        if (Math.max(takeA.leftDb, takeA.rightDb) < -48 ||
                Math.max(takeB.leftDb, takeB.rightDb) < -48) {
            resultView.setText("INCONCLUSIVE：至少一段过于安静，可能没讲话或麦克风没开，请重测。");
            return;
        }
        String code = ChannelAssessment.assess(takeA.leftDb - takeA.rightDb,
                takeB.leftDb - takeB.rightDb, takeA.channels, takeB.channels);
        String explanation;
        if (code.startsWith("CANDIDATE")) explanation = "疑似独立分轨：两个麦克风的主声道相反。需要试听四条独立 WAV，检查串音。";
        else if (code.equals("MONO_MIX")) explanation = "左右声道电平几乎相同：接收器当前是单声道混合输出，不是真分轨；应走混音 + 说话人分离。";
        else if (code.equals("MONO_OR_INCONSISTENT")) explanation = "安卓实际拿到单声道或通道不一致，不能直接分轨；考虑混音 + 说话人识别。";
        else explanation = "未观察到稳定相反声道优势。可能为混音/双单声道/串音；不能宣称分轨。";
        double clipA = 100.0 * takeA.clips / Math.max(1, takeA.frames * takeA.channels);
        double clipB = 100.0 * takeB.clips / Math.max(1, takeB.frames * takeB.channels);
        StringBuilder out = new StringBuilder();
        out.append("结论：").append(code).append('\n').append(explanation)
                .append("\nA 左-右 = ").append(fmt(takeA.leftDb - takeA.rightDb))
                .append(" dB，B 左-右 = ").append(fmt(takeB.leftDb - takeB.rightDb))
                .append(" dB\n本次不涉及云端 ASR。");
        if (clipA > 1.0 || clipB > 1.0) {
            out.append("\n警告：输入削波 A ").append(fmt(clipA)).append("% / B ")
                    .append(fmt(clipB)).append("%，建议调低接收器增益或拉开距离。");
        }
        resultView.setText(out.toString());
    }
    private void stopCapture() {
        stopRequested.set(true);
        AudioRecord r = activeRecord;
        if (r != null) {
            try { r.stop(); } catch (IllegalStateException ignored) {}
        }
        status.setText("正在停止录音…");
    }
    private void addExportFiles(File directory) {
        for (String name : new String[]{"original.wav", "left.wav", "right.wav", "diagnostics.json"}) {
            File f = new File(directory, name);
            if (f.isFile()) exportFiles.add(f);
        }
    }
    private void showExportPicker() {
        if (exportFiles.isEmpty()) {
            status.setText("暂无文件，请先录制一个测试片段。"); return;
        }
        String[] captions = new String[exportFiles.size()];
        for (int i = 0; i < exportFiles.size(); i++) {
            File f = exportFiles.get(i);
            captions[i] = f.getParentFile().getName() + "/" + f.getName();
        }
        new AlertDialog.Builder(this).setTitle("导出文件，方便试听")
                .setItems(captions, (dialog, which) -> exportFile(exportFiles.get(which)))
                .setNegativeButton("取消", null).show();
    }
    private void exportFile(File file) {
        pendingExport = file;
        Intent picker = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        picker.addCategory(Intent.CATEGORY_OPENABLE);
        picker.setType(file.getName().endsWith(".json") ? "application/json" : "audio/wav");
        picker.putExtra(Intent.EXTRA_TITLE, file.getParentFile().getName() + "_" + file.getName());
        startActivityForResult(picker, REQUEST_EXPORT);
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_EXPORT) return;
        File source = pendingExport; pendingExport = null;
        if (resultCode != RESULT_OK || data == null || source == null) return;
        Uri destination = data.getData();
        if (destination == null) return;
        try (InputStream in = new FileInputStream(source);
             OutputStream out = getContentResolver().openOutputStream(destination)) {
            if (out == null) throw new Exception("Cannot open destination");
            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
            status.setText("导出成功：" + source.getName());
        } catch (Exception e) {
            status.setText("导出失败：" + e.getMessage());
        }
    }

    @Override protected void onStop() {
        super.onStop();
        // The probe has no foreground service and must never capture in the background.
        if (worker != null && worker.isAlive()) stopCapture();
    }
    @Override protected void onDestroy() {
        stopRequested.set(true);
        super.onDestroy();
    }
}
