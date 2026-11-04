#!/usr/bin/env node
/**
 * 真机 WebView 取证小工具（ALW-001 专用，仅本机 127.0.0.1）。
 *
 * 通过 adb forward 把手机 WebView 的 devtools 端口映射到本机，然后在页面里执行一段表达式，
 * 用于「按钮点下去到底发生了什么」这类必须看真实运行时才能定性的问题。
 *
 * 用法：
 *   node scripts/sm-cdp.mjs "document.title"
 *   node scripts/sm-cdp.mjs --port 9223 --file /tmp/probe.js
 *   node scripts/sm-cdp.mjs --help
 *
 * 前置：
 *   PID=$(adb -s <serial> shell pidof app.socialmate.dualmic | tr -d '\r')
 *   adb -s <serial> forward tcp:9223 localabstract:webview_devtools_remote_$PID
 */

import fs from "node:fs/promises";

const DEFAULT_PORT = 9223;

function parseArgs(argv) {
    const out = {port: DEFAULT_PORT, expr: "", file: ""};
    for (let i = 0; i < argv.length; i += 1) {
        const item = argv[i];
        if (item === "--port") out.port = Number(argv[++i]) || DEFAULT_PORT;
        else if (item === "--file") out.file = argv[++i] || "";
        else if (item === "--help" || item === "-h") out.help = true;
        else if (!out.expr) out.expr = item;
    }
    return out;
}

function help() {
    return [
        "真机 WebView 取证工具",
        "",
        "  node scripts/sm-cdp.mjs \"<js 表达式>\"",
        "  node scripts/sm-cdp.mjs --file <js 文件> [--port 9223]",
        "",
        "只连本机 127.0.0.1，不对外开放；不做任何写盘。",
    ].join("\n");
}

async function target(port) {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`);
    const list = await res.json();
    const page = list.find((item) => item.type === "page");
    if (!page) throw new Error("没有可调试页面：先在手机上打开 SocialMate");
    return page;
}

async function evaluate(wsUrl, expression) {
    const socket = new WebSocket(wsUrl);
    const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("CDP 超时（15s）")), 15000);
        socket.addEventListener("open", () => {
            socket.send(JSON.stringify({
                id: 1,
                method: "Runtime.evaluate",
                params: {expression, awaitPromise: true, returnByValue: true, userGesture: true},
            }));
        });
        socket.addEventListener("message", (event) => {
            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch {
                return;
            }
            if (msg.id !== 1) return;
            clearTimeout(timer);
            socket.close();
            resolve(msg);
        });
        socket.addEventListener("error", (err) => {
            clearTimeout(timer);
            reject(new Error("CDP 连接失败：" + (err.message || "unknown")));
        });
    });
    if (result.error) throw new Error("CDP 错误：" + JSON.stringify(result.error));
    const details = result.result || {};
    if (details.exceptionDetails) {
        const text = details.exceptionDetails.exception?.description
            || details.exceptionDetails.text || "页面异常";
        throw new Error(text);
    }
    return details.result ? details.result.value : undefined;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        console.log(help());
        return;
    }
    const expression = args.file ? await fs.readFile(args.file, "utf8") : args.expr;
    if (!expression) {
        console.error(help());
        process.exit(2);
    }
    const page = await target(args.port);
    const value = await evaluate(page.webSocketDebuggerUrl, expression);
    if (value === undefined) {
        console.log("(undefined)");
        return;
    }
    console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

main().catch((err) => {
    console.error("失败：" + (err.message || err));
    process.exit(1);
});
