#!/usr/bin/env node
/**
 * T1-2 原生桥负例夹具（只在开发机/测试机用，不参与产品运行）。
 *
 * 两个 origin：
 *   18792 = 「私有 UI」替身（顶层页面，白名单内）
 *   18793 = 「攻击者」origin（iframe 里的跨源页面）
 *
 * 顶层页面上报自己是否拿到 SocialMateAndroid 桥；
 * 跨源 iframe 尝试探测并调用 saveText，把结果回传。
 * 期望：iframe 根本加载不起来（资源被 shouldInterceptRequest 拦掉），
 * 因此 hasBridge 永远没有 true 的 evil 记录；顶层 hasBridge=true 才说明正常功能仍可用。
 *
 * 用法：node serve.mjs --report /path/to/report.ndjson [--ui-port 18792] [--evil-port 18793]
 */
import fs from "node:fs";
import http from "node:http";

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const REPORT = argOf("--report", "/tmp/bridge-negative.ndjson");
const UI_PORT = Number(argOf("--ui-port", 18792));
const EVIL_PORT = Number(argOf("--evil-port", 18793));

function log(entry) {
  fs.appendFileSync(REPORT, JSON.stringify({at: new Date().toISOString(), ...entry}) + "\n");
}

const privatePage = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>bridge-negative-test</title></head>
<body>
<h1>T1-2 桥负例：顶层私有页面</h1>
<pre id="out">pending</pre>
<script>
(function(){
  function report(payload){
    payload.where = payload.where || "top";
    payload.href = location.href;
    var bridge = window.SocialMateAndroid;
    payload.hasBridge = typeof bridge !== "undefined";
    payload.saveTextType = bridge ? typeof bridge.saveText : "undefined";
    document.getElementById("out").textContent = JSON.stringify(payload);
    fetch("/report", {method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify(payload)});
  }
  function check(tag){ report({where: tag}); }
  // 1s/3s 复查：桥是在 onPageFinished 之后挂载的，必须晚于首帧再取证。
  setTimeout(function(){ check("top-1s"); }, 1000);
  setTimeout(function(){ check("top-3s"); }, 3000);
  // 4s 主动尝试离开白名单（未知 origin 的顶层跳转），6s 复查是否被取消。
  setTimeout(function(){ try { location.href = "http://127.0.0.1:${EVIL_PORT}/evil.html"; } catch (e) {} }, 4000);
  setTimeout(function(){ check("top-6s-after-nav-attempt"); }, 6000);
  // 顶层页面里放一个跨源 iframe，验证跨源 frame 是否还能加载/调桥。
  var frame = document.createElement("iframe");
  frame.src = "http://127.0.0.1:${EVIL_PORT}/evil.html";
  frame.width = "320"; frame.height = "120";
  document.body.appendChild(frame);
  setTimeout(function(){
    report({where: "top-iframe-state", present: !!frame, src: frame.src,
      contentWindowReadable: (function(){ try { return !!frame.contentWindow.location.href; } catch (e) { return "cross-origin-blocked"; } })()});
  }, 2500);
})();
</script>
</body></html>`;

const evilPage = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>evil</title></head>
<body>
<h1>evil</h1>
<script>
(function(){
  var reported = false;
  function run(tag){
    var bridge = window.SocialMateAndroid;
    var parentBridge = null;
    try { parentBridge = window.parent.SocialMateAndroid || null; } catch (e) { parentBridge = "blocked"; }
    var result = {
      where: tag,
      origin: location.origin,
      inFrame: window.top !== window.self,
      hasBridge: typeof bridge !== "undefined",
      saveTextType: bridge ? typeof bridge.saveText : "undefined",
      parentBridge: parentBridge === "blocked" ? "cross-origin-blocked" : (parentBridge ? "visible" : "absent"),
      called: false, returned: null, threw: null
    };
    try {
      if (bridge && typeof bridge.saveText === "function") {
        result.called = true;
        result.returned = bridge.saveText("evil-iframe.md", "bridge negative test");
      }
    } catch (e) { result.threw = String(e && e.message); }
    fetch("/report", {method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify(result)});
    reported = true;
  }
  // 4s 之后再试一次，确保晚于顶层 onPageFinished 的桥挂载时机。
  setTimeout(function(){ run("evil-4s"); }, 4000);
  run("evil-load");
})();
</script>
</body></html>`;

function serve(port, routes) {
  return http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    if (req.method === "POST" && url.pathname === "/report") {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch { parsed = {raw: body.slice(0, 200)}; }
        log({port, ...parsed});
        res.writeHead(204, {"Access-Control-Allow-Origin": "*"});
        res.end();
      });
      return;
    }
    const handler = routes[url.pathname];
    if (!handler) {
      res.writeHead(404, {"Content-Type": "text/plain; charset=utf-8"});
      return res.end("not found");
    }
    res.writeHead(200, {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store"});
    return res.end(handler);
  });
}

serve(UI_PORT, {"/v12": privatePage, "/v12/": privatePage}).listen(UI_PORT, "127.0.0.1", () => {
  console.log(`[bridge-negative] private stand-in http://127.0.0.1:${UI_PORT}/v12`);
});
serve(EVIL_PORT, {"/evil.html": evilPage}).listen(EVIL_PORT, "127.0.0.1", () => {
  console.log(`[bridge-negative] attacker origin http://127.0.0.1:${EVIL_PORT}/evil.html`);
  console.log(`[bridge-negative] report → ${REPORT}`);
});
