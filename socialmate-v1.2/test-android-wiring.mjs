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
  assert.match(gradle,/versionCode 9/);
  assert.match(gradle,/versionName '0\.4\.0'/);
  assert.match(manifest,/android\.permission\.INTERNET/);
  assert.match(manifest,/usesCleartextTraffic="true"/);
});
test("single Android Activity keeps recorder in foreground while showing WebView",()=>{
  assert.match(android,/screenRoot\.addView\(webPanel/);
  assert.match(android,/showSocialMatePanel\(\);/);
  assert.match(android,/PRIVATE_UI_URL = "http:\/\/127\.0\.0\.1:8791\/v12"/);
  assert.match(android,/socialMateWebView\.reload\(\)/);
  assert.match(android,/stopStreaming\("切到后台"\)/);
  assert.doesNotMatch(android,/addJavascriptInterface\s*\(/);
  assert.match(android,/setAllowFileAccess\(false\)/);
  assert.match(android,/setAllowContentAccess\(false\)/);
  assert.match(android,/isPrivatePanelUrl\(uri\)/);
  assert.match(android,/PRIVATE_UI_URL \+ \(running \? "\?live=1" : ""\)/);
  assert.match(android,/FLAG_DEBUGGABLE.*setWebContentsDebuggingEnabled|setWebContentsDebuggingEnabled\(true\)/);
  assert.match(gateway,/\/api\/asr\/status/);
  assert.match(gateway,/features:\{asrLive:bridge\.combined/);
});
test("user must consent before microphone and Tencent cloud audio capture",()=>{
  assert.match(android,/recordingConsent\.isChecked\(\)/);
  assert.match(android,/我已告知并获得同行者同意录音/);
  assert.match(android,/recordingConsent\.setChecked\(false\)/);
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
  assert.match(android,/SocialMate · 实时对话/);
  assert.match(android,/开始实时对话/);
  assert.match(android,/advancedTools\.setVisibility\(View\.GONE\)/);
  assert.match(android,/advancedTools\.addView\(urlInput/);
  assert.match(android,/advancedTools\.addView\(trackPicker/);
  assert.match(android,/stopInChat\.setOnClickListener\(v -> stopStreaming\("用户停止"\)\)/);
  assert.match(android,/recordingConsent\.isChecked\(\)/);
  assert.match(android,/showSocialMatePanel\(\);/);
});

test("native home and recording controls use restrained accessible card styling",()=>{
  assert.match(mainActivity,/private LinearLayout section\(LinearLayout parent\)/);
  assert.match(mainActivity,/conversation\.setBackground\(surface\(0xFF176E63/);
  assert.match(android,/private LinearLayout section\(LinearLayout parent\)/);
  assert.match(android,/stylePrimary\(startButton\)/);
  assert.match(android,/stopInChat\.setTextColor\(0xFF9C3434\)/);
  assert.match(android,/advancedTools\.setVisibility\(View\.GONE\)/);
});
