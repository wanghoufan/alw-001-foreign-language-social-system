#!/usr/bin/env node
/**
 * T5 真机驱动小工具（只操作本项目 App 自己的 WebView 与原生面板）。
 *
 * 用法：
 *   node app.mjs shot <png>                     # 截图
 *   node app.mjs eval --expr "<js>" [--token]   # 在 App 的 /v12 WebView 里执行 JS
 *   node app.mjs eval --file <js> [--token]     # 同上，从文件读表达式
 *   node app.mjs text                           # 打印 WebView 可见文本前 2000 字
 *   node app.mjs tap <regex>                    # 按 uiautomator 文本点击（原生面板用）
 *   node app.mjs dump                           # 打印 uiautomator 全部带文字控件
 *
 * --token 时把本机归档令牌写进页面的 sessionStorage（模拟用户在该页输入令牌）。
 * 令牌只在本进程内读取，不打印、不写日志。
 */
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SERIAL = process.env.T5_SERIAL || "REDACTED-SERIAL";
const PKG = "app.socialmate.dualmic";
const ROOT = path.resolve(import.meta.dirname, "../../../../..");
const LOCAL_PORT = 19322;

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name) => args.includes(name);
const valueOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const adb = (...rest) => execFileSync("adb", ["-s", SERIAL, ...rest], {encoding: "utf8"});

function shot(file) {
  const png = execFileSync("adb", ["-s", SERIAL, "exec-out", "screencap", "-p"], {
    encoding: "buffer", maxBuffer: 64 * 1024 * 1024,
  });
  fs.mkdirSync(path.dirname(path.resolve(file)), {recursive: true});
  fs.writeFileSync(file, png);
  const sha = execFileSync("shasum", ["-a", "256", file], {encoding: "utf8"}).split(" ")[0];
  console.log(JSON.stringify({shot: file, bytes: png.length, sha256: sha}));
}

function uiNodes() {
  adb("shell", "uiautomator", "dump", "/sdcard/t5-ui.xml");
  const xml = adb("shell", "cat", "/sdcard/t5-ui.xml");
  const out = [];
  const re = /<node[^>]*text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
  let m;
  while ((m = re.exec(xml))) {
    if (!m[1].trim()) continue;
    out.push({
      text: m[1].replace(/&#10;/g, "\n"),
      x: Math.round((Number(m[2]) + Number(m[4])) / 2),
      y: Math.round((Number(m[3]) + Number(m[5])) / 2),
    });
  }
  return out;
}

async function cdp(expression) {
  const pid = adb("shell", "pidof", PKG).trim().split(/\s+/)[0];
  if (!pid) throw new Error("App 未运行");
  adb("forward", `tcp:${LOCAL_PORT}`, `localabstract:webview_devtools_remote_${pid}`);
  const list = await (await fetch(`http://127.0.0.1:${LOCAL_PORT}/json/list`)).json();
  const page = list.find((t) => t.type === "page" && /\/v12/.test(String(t.url || "")));
  if (!page) throw new Error("没有找到 /v12 页面：" + JSON.stringify(list.map((t) => t.url)));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("CDP 超时")), 45000);
    ws.addEventListener("error", (e) => { clearTimeout(timer); reject(new Error(String(e.message || "ws error"))); });
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({
        id: 1, method: "Runtime.evaluate",
        params: {expression, returnByValue: true, awaitPromise: true, userGesture: true},
      }));
    });
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== 1) return;
      clearTimeout(timer);
      ws.close();
      if (msg.error) return reject(new Error(JSON.stringify(msg.error)));
      if (msg.result?.exceptionDetails) {
        return reject(new Error(msg.result.exceptionDetails.exception?.description || "JS 异常"));
      }
      resolve(msg.result?.result?.value);
    });
  });
}

function tokenPrelude() {
  const file = path.join(ROOT, "socialmate-v1.2/.local/archive-token");
  if (!fs.existsSync(file)) throw new Error("缺少本机归档令牌文件");
  const token = fs.readFileSync(file, "utf8").trim();
  if (token.length < 8) throw new Error("令牌文件内容异常");
  return `sessionStorage.setItem('sm-archive-token', ${JSON.stringify(token)});`;
}

async function main() {
  switch (cmd) {
    case "shot":
      shot(args[1]);
      break;
    case "text": {
      const text = await cdp("document.body.innerText");
      console.log(String(text).slice(0, Number(valueOf("--max", "2000"))));
      break;
    }
    case "eval": {
      const expr = valueOf("--file") ? fs.readFileSync(valueOf("--file"), "utf8") : valueOf("--expr", "");
      if (!expr.trim()) throw new Error("需要 --expr 或 --file");
      const pre = flag("--token") ? tokenPrelude() : "";
      const result = await cdp(`(async()=>{${pre}return (${expr})})()`);
      console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
      break;
    }
    case "tap": {
      const re = new RegExp(args[1]);
      const hit = uiNodes().find((n) => re.test(n.text));
      if (!hit) { console.error("NOT_FOUND " + args[1]); process.exit(3); }
      adb("shell", "input", "tap", String(hit.x), String(hit.y));
      console.log(JSON.stringify({tapped: hit.text, x: hit.x, y: hit.y}));
      break;
    }
    case "dump":
      for (const n of uiNodes()) console.log(`${JSON.stringify(n.text)} (${n.x},${n.y})`);
      break;
    default:
      console.error("usage: shot <png> | eval --expr/--file [--token] | text | tap <regex> | dump");
      process.exit(2);
  }
}

main().catch((e) => { console.error("T5_APP_FAILED:", e.message); process.exit(1); });
