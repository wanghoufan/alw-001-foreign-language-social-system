#!/usr/bin/env node
/**
 * T2 真机取证：在 App 自己的 WebView 里执行一段 JS（CDP），用于点按钮/读状态。
 * 只连本项目 App 的 WebView（socket 名带 pid），不会误连 MIUI 浏览器。
 *
 * 用法：
 *   node cdp-eval.mjs --serial REDACTED-SERIAL --expr "document.title"
 *   node cdp-eval.mjs --serial REDACTED-SERIAL --file step.js --out result.json
 */
import {execFileSync} from "node:child_process";
import fs from "node:fs";

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const SERIAL = argOf("--serial", "REDACTED-SERIAL");
const PKG = argOf("--pkg", "app.socialmate.dualmic");
const LOCAL_PORT = Number(argOf("--local-port", "19222"));
const EXPR = argOf("--expr", "");
const FILE = argOf("--file", "");
const OUT = argOf("--out", "");

const adb = (...args) => execFileSync("adb", ["-s", SERIAL, ...args], {encoding: "utf8"}).trim();

async function main() {
  const pid = adb("shell", "pidof", PKG).split(/\s+/)[0];
  if (!pid) throw new Error(`找不到 ${PKG} 的进程`);
  adb("forward", `tcp:${LOCAL_PORT}`, `localabstract:webview_devtools_remote_${pid}`);
  const list = await (await fetch(`http://127.0.0.1:${LOCAL_PORT}/json/list`)).json();
  const page = list.find((target) => target.type === "page" && /\/v12/.test(String(target.url || "")));
  if (!page) throw new Error("没有找到 /v12 页面：" + JSON.stringify(list.map((t) => t.url)));

  const expression = FILE ? fs.readFileSync(FILE, "utf8") : EXPR;
  if (!expression.trim()) throw new Error("需要 --expr 或 --file");

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("CDP 超时")), 30_000);
    ws.addEventListener("error", (event) => { clearTimeout(timer); reject(new Error(String(event.message || "ws error"))); });
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({
        id: 1, method: "Runtime.evaluate",
        params: {expression, returnByValue: true, awaitPromise: true, userGesture: true},
      }));
    });
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timer);
      ws.close();
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else if (message.result?.exceptionDetails) reject(new Error(
        message.result.exceptionDetails.exception?.description || "JS 异常"));
      else resolve(message.result?.result?.value);
    });
  });

  const text = JSON.stringify(result, null, 2);
  if (OUT) fs.writeFileSync(OUT, `${text}\n`, {encoding: "utf8"});
  console.log(text);
}

main().catch((error) => {
  console.error("CDP_EVAL_FAILED:", error.message);
  process.exit(1);
});
