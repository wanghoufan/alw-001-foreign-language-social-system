#!/usr/bin/env node
/**
 * T3 真机 UI 驱动小工具（只操作本项目 App 的界面，不越权）。
 *
 * 用法：
 *   node ui.mjs dump                       # 打印所有带文字的控件
 *   node ui.mjs text <regex>               # 打印匹配文字的控件（含坐标）
 *   node ui.mjs tap-text <regex>           # 点击第一个匹配的控件
 *   node ui.mjs tap x y                    # 点击物理坐标
 *   node ui.mjs swipe x1 y1 x2 y2 [ms]
 *   node ui.mjs screenshot <path>
 *
 * 说明：uiautomator 的 bounds 是物理像素，与 `adb shell input tap` 同单位。
 */
import {execFileSync} from "node:child_process";
import fs from "node:fs";

const SERIAL = process.env.T3_SERIAL || "REDACTED-SERIAL";
const args = process.argv.slice(2);
const cmd = args[0];

const adb = (...rest) => execFileSync("adb", ["-s", SERIAL, ...rest], {encoding: "utf8"});

function dump() {
  adb("shell", "uiautomator", "dump", "/sdcard/t3-ui.xml");
  const xml = adb("shell", "cat", "/sdcard/t3-ui.xml");
  const nodes = [];
  const re = /<node[^>]*text="([^"]*)"[^>]*class="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
  let m;
  while ((m = re.exec(xml))) {
    const [, text, cls, x1, y1, x2, y2] = m;
    if (!text.trim()) continue;
    nodes.push({
      text,
      cls: cls.split(".").pop(),
      x: Math.round((Number(x1) + Number(x2)) / 2),
      y: Math.round((Number(y1) + Number(y2)) / 2),
    });
  }
  return nodes;
}

const nodes = ["dump", "text", "tap-text"].includes(cmd) ? dump() : [];
switch (cmd) {
  case "dump":
    for (const n of nodes) console.log(`${JSON.stringify(n.text)} ${n.cls} (${n.x},${n.y})`);
    break;
  case "text": {
    const re = new RegExp(args[1] || ".*");
    for (const n of nodes.filter((item) => re.test(item.text))) {
      console.log(`${JSON.stringify(n.text)} ${n.cls} (${n.x},${n.y})`);
    }
    break;
  }
  case "tap-text": {
    const re = new RegExp(args[1] || ".*");
    const hit = nodes.find((item) => re.test(item.text));
    if (!hit) { console.error("NOT_FOUND " + args[1]); process.exit(3); }
    adb("shell", "input", "tap", String(hit.x), String(hit.y));
    console.log(`TAPPED ${JSON.stringify(hit.text)} (${hit.x},${hit.y})`);
    break;
  }
  case "tap":
    adb("shell", "input", "tap", args[1], args[2]);
    console.log(`TAPPED (${args[1]},${args[2]})`);
    break;
  case "swipe":
    adb("shell", "input", "swipe", args[1], args[2], args[3], args[4], args[5] || "300");
    console.log("SWIPED");
    break;
  case "screenshot": {
    const png = execFileSync("adb", ["-s", SERIAL, "exec-out", "screencap", "-p"], {encoding: "buffer", maxBuffer: 64 * 1024 * 1024});
    fs.writeFileSync(args[1], png);
    console.log("SAVED " + args[1]);
    break;
  }
  default:
    console.error("usage: dump|text <re>|tap-text <re>|tap x y|swipe x1 y1 x2 y2 [ms]|screenshot path");
    process.exit(2);
}
