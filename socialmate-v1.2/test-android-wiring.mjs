import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const mainActivity=fs.readFileSync(path.join(root,"android-poc/app/src/main/java/app/socialmate/dualmic/MainActivity.java"),"utf8");
const android=fs.readFileSync(path.join(root,"android-poc/app/src/main/java/app/socialmate/dualmic/AsrActivity.java"),"utf8");
const manifest=fs.readFileSync(path.join(root,"android-poc/app/src/main/AndroidManifest.xml"),"utf8");
const gradle=fs.readFileSync(path.join(root,"android-poc/app/build.gradle"),"utf8");
const bridge=fs.readFileSync(path.join(root,"android-poc/asr-bridge/src/server.js"),"utf8");
const live=fs.readFileSync(path.join(root,"socialmate-prototype/ai-gateway/live-server.mjs"),"utf8");
const gateway=fs.readFileSync(path.join(root,"socialmate-prototype/ai-gateway/server.mjs"),"utf8");
const ui=fs.readFileSync(path.join(root,"socialmate-v1.2/index.html"),"utf8");
test("Android version and network permissions for localhost private UI",()=>{
  // 不断言具体版本数字（会随迭代增长）：断言版本号存在且格式合法、构建号递增。
  const versionCode=Number((gradle.match(/versionCode\s+(\d+)/)||[])[1]);
  const versionName=(gradle.match(/versionName\s+'([^']+)'/)||[])[1];
  assert.ok(Number.isInteger(versionCode)&&versionCode>=14,"versionCode 必须存在且不小于已发布的 14");
  assert.match(versionName||"",/^\d+\.\d+\.\d+$/,"versionName 必须是 主.次.修订");
  assert.match(manifest,/android\.permission\.INTERNET/);
  // 0.5.2 起关闭全局明文，仅经 network_security_config 放行回环。
  assert.match(manifest,/usesCleartextTraffic="false"/);
  assert.match(manifest,/networkSecurityConfig/);
  const netsec=fs.readFileSync(path.join(root,"android-poc/app/src/main/res/xml/network_security_config.xml"),"utf8");
  assert.match(netsec,/cleartextTrafficPermitted="false"/);
  assert.match(netsec,/127\.0\.0\.1/);
});
test("single Android Activity keeps recorder in foreground while showing WebView",()=>{
  assert.match(android,/screenRoot\.addView\(webPanel/);
  assert.match(android,/showSocialMatePanel\(\);/);
  assert.match(android,/PRIVATE_UI_URL = "http:\/\/127\.0\.0\.1:8791\/v12"/);
  // 打开 App 直接是五 Tab 主界面：MainActivity 无 diagnostics 时立即转 AsrActivity。
  assert.match(mainActivity,/startActivity\(new Intent\(this, AsrActivity\.class\)\)/);
  assert.match(mainActivity,/getBooleanExtra\("diagnostics", false\)/);
  assert.match(android,/privateUiUrl\(\)/);
  assert.match(android,/socialMateWebView\.reload\(\)/);
  assert.match(android,/stopStreaming\("切到后台"\)/);
  // 0.6.0 起为「历史 Markdown 导出」新增受限原生桥：必须在私有同源页面才注入，
  // 且桥方法内部再校验一次可信页面地址（不能因为页面已注入就放任任意调用）。
  assert.match(android,/addJavascriptInterface\(new SaveTextBridge\(\), BRIDGE_NAME\)/);
  assert.match(android,/onPageFinished\(WebView view, String url\)/);
  assert.match(android,/isPrivatePanelUrl\(parsed\)[\s\S]{0,120}attachSaveBridge\(true\)/);
  assert.match(android,/removeJavascriptInterface\(BRIDGE_NAME\)/);
  assert.match(android,/String page = trustedPageUrl;[\s\S]{0,120}isPrivatePanelUrl/);
  assert.match(android,/@JavascriptInterface/);
  // 落盘一律走 SAF，绝不申请全盘存储权限。
  // Java 侧提到「不使用 WRITE_EXTERNAL_STORAGE」是注释；真正要保证的是清单里没有申请。
  assert.doesNotMatch(manifest,/WRITE_EXTERNAL_STORAGE/);
  assert.match(android,/ACTION_CREATE_DOCUMENT/);
  assert.match(android,/setAllowFileAccess\(false\)/);
  assert.match(android,/setAllowContentAccess\(false\)/);
  assert.match(android,/isPrivatePanelUrl\(uri\)/);
  // 聊天页地址由 privateUiUrl() 统一拼接（0.5.3 起支持配置 ui_url 并剥离尾部 /v12）。
  assert.match(android,/privateUiBase\(\) \+ "\/v12"/);
  assert.match(android,/FLAG_DEBUGGABLE.*setWebContentsDebuggingEnabled|setWebContentsDebuggingEnabled\(true\)/);
  assert.match(gateway,/\/api\/asr\/status/);
  assert.match(gateway,/features:\{asrLive:bridge\.combined/);
});
test("user must consent before microphone and Tencent cloud audio capture",()=>{
  assert.match(android,/recordingConsent\.isChecked\(\)/);
  // 0.6.6：录音同意文案产品化，留存开关仍默认未勾选。
  assert.match(android,/对方已知情并同意录音/);
  assert.match(android,/retentionConsent\.setChecked\(false\)/);
});
test("real final only through localhost in-process event hub; no public webhook",()=>{
  assert.match(bridge,/const onEvent = typeof options\.onEvent/);
  assert.match(bridge,/try \{ onEvent\(output\); \}/);
  assert.match(live,/onEvent:e=>liveAsrHub\.publish\(e\)/);
  assert.match(gateway,/url\.pathname==="\/api\/asr\/live"/);
  assert.match(ui,/EventSource\('\/api\/asr\/live'\)/);
  assert.match(ui,/source==='tencent'&&S\.session\.cloudConsent/);
  assert.match(ui,/speaker:m\.who==='me'\?'self':m\.who==='friend'\?'friend':'unknown'/);
});

test("daily-use Android entry prioritizes SocialMate conversation and preserves diagnostics",()=>{
  assert.match(mainActivity,/开始实时对话/);
  assert.match(mainActivity,/startActivity\(new Intent\(this, AsrActivity\.class\)\)/);
  assert.match(mainActivity,/diagnosticTools\.setVisibility\(View\.GONE\)/);
  assert.match(mainActivity,/录音设备检测与高级工具/);
  assert.match(mainActivity,/我已告知并获得同行者同意录音|录音需同行者同意/);
  assert.match(mainActivity,/button\(root, "① 只对麦克风 A/);
  assert.match(mainActivity,/button\(root, "② 只对麦克风 B/);
});

test("recording UI prioritizes conversation while retaining stop and diagnostics",()=>{
  // 0.6.6：录音是底部面板，标题与主按钮都叫「开始录音」。
  assert.match(android,/title\.setText\("开始录音"\)/);
  assert.match(android,/startButton\.setText\("开始录音"\)/);
  assert.match(android,/advancedTools\.setVisibility\(View\.GONE\)/);
  assert.match(android,/advancedTools\.addView\(urlInput/);
  assert.match(android,/advancedTools\.addView\(trackPicker/);
  // 0.6.1 起产品态顶栏只留「SocialMate + ⋮」，录音/刷新/设备检测收进溢出菜单。
  // 0.6.8：原生顶栏整条去掉（品牌与标题都在网页里），次级动作改由网页设置面板回调桥方法。
  assert.doesNotMatch(android,/showOverflowMenu/);
  assert.doesNotMatch(android,/back\.setText\("← 录音控制"\)/);
  assert.match(android,/public boolean openRecordingPanel\(\)/);
  assert.match(android,/public boolean reloadPage\(\)/);
  assert.match(android,/public boolean openAdvancedSettings\(\)/);
  assert.match(android,/recordingConsent\.isChecked\(\)/);
  assert.match(android,/showSocialMatePanel\(\);/);
});

test("native home and recording controls use restrained accessible card styling",()=>{
  assert.match(mainActivity,/private LinearLayout section\(LinearLayout parent\)/);
  assert.match(mainActivity,/conversation\.setBackground\(surface\(0xFF176E63/);
  assert.match(android,/private LinearLayout section\(LinearLayout parent\)/);
  assert.match(android,/startButton\.setBackground\(surface\(0xFF0C7766/);
  // 双麦检测是开发工具，只在可调试构建里出现。
  // 双麦检测是开发工具：桥方法在非可调试构建直接返回 false，网页只显示「仅开发版可用」。
  assert.match(android,/public boolean openDiagnostics\(\)/);
  assert.match(android,/if \(!debuggable\) return false;/);
  assert.doesNotMatch(android,/stopInChat/);
  assert.match(android,/advancedTools\.setVisibility\(View\.GONE\)/);
});
