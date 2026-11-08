#!/usr/bin/env node
import fs from "node:fs";
import {execFileSync} from "node:child_process";

const DEFAULT_PORT = 9226;
const DEFAULT_PACKAGE = "app.socialmate.dualmic";
const DEFAULT_CDP_TIMEOUT_MS = 90_000;
const DEFAULT_ADB_TIMEOUT_MS = 20_000;
const PUSH_TIMEOUT_MS = 120_000;

class StopError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

class CdpSession {
  constructor(url, timeoutMs) {
    this.url = url;
    this.timeoutMs = timeoutMs;
    this.seq = 0;
    this.pending = new Map();
    this.socket = null;
  }

  async open() {
    if (typeof WebSocket !== "function") {
      throw new StopError("NODE_TOO_OLD", "当前 Node 没有全局 WebSocket，请用 Node 22+ 运行");
    }
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("message", (event) => this.onMessage(event));
    this.socket.addEventListener("close", () => this.onClose());
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new StopError("CDP_CONNECT_TIMEOUT", "连接 WebView DevTools 超时")), 10_000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, {once: true});
      this.socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new StopError("CDP_CONNECT_FAILED", "连接 WebView DevTools 失败，请确认 adb forward 与应用已启动"));
      }, {once: true});
    });
  }

  onMessage(event) {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!msg.id || !this.pending.has(msg.id)) return;
    const entry = this.pending.get(msg.id);
    this.pending.delete(msg.id);
    clearTimeout(entry.timer);
    if (msg.error) {
      entry.reject(new StopError("CDP_ERROR", "CDP 返回错误：" + JSON.stringify(msg.error)));
      return;
    }
    const details = msg.result || {};
    if (details.exceptionDetails) {
      const text = details.exceptionDetails.exception?.description
        || details.exceptionDetails.text
        || "页面执行异常";
      entry.reject(new StopError("PAGE_EXCEPTION", text));
      return;
    }
    entry.resolve(details.result ? details.result.value : undefined);
  }

  onClose() {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new StopError("CDP_CLOSED", "WebView DevTools 连接已断开"));
    }
    this.pending.clear();
  }

  evaluate(expression) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new StopError("CDP_TIMEOUT", `CDP 调用超时（${this.timeoutMs}ms）`));
      }, this.timeoutMs);
      this.pending.set(id, {resolve, reject, timer});
      this.socket.send(JSON.stringify({
        id,
        method: "Runtime.evaluate",
        params: {expression, awaitPromise: true, returnByValue: true, userGesture: true},
      }));
    });
  }

  close() {
    try {
      this.socket?.close();
    } catch {
      // 收尾失败不改变判定。
    }
  }
}

function usage() {
  return [
    "V1.7 R3 备份恢复真机验证",
    "",
    "用法：",
    "  node scripts/v17-backup-restore.mjs --serial <序列号> --backup <文件.smbak> --password <口令> [--port 9226]",
    "  node scripts/v17-backup-restore.mjs --help",
    "  node scripts/v17-backup-restore.mjs --dry-run --serial <序列号> --backup <文件> --password <口令>",
    "",
    "参数：",
    "  --serial <s>       必填，adb 目标设备序列号",
    "  --port <n>         WebView DevTools 转发端口，默认 9226",
    "  --password <p>     必填，备份口令；只用于导入，不打印；也可用 SM_BACKUP_PASSWORD",
    "  --backup <path>    必填，已导出的 .smbak（或早期未加密 .zip）",
    "  --package <pkg>    APP 包名，默认 app.socialmate.dualmic",
    "  --timeout <ms>     CDP 单次调用超时，默认 90000",
    "  --dry-run          只校验参数与文件，不连接设备",
    "  --keep-forward     结束后保留本次建立的 adb forward",
    "  --show-conflicts   输出冲突条目 id（默认只输出数量）",
    "  --help             显示本帮助",
    "",
    "边界：不卸载、不清数据、不点 UI；不读取/打印人物正文、令牌与口令。",
  ].join("\n");
}

function parseArgs(argv) {
  const out = {
    port: DEFAULT_PORT,
    package: DEFAULT_PACKAGE,
    timeout: DEFAULT_CDP_TIMEOUT_MS,
    password: process.env.SM_BACKUP_PASSWORD || "",
    serial: "",
    backup: "",
    dryRun: false,
    keepForward: false,
    showConflicts: false,
    help: false,
  };
  const takesValue = new Set(["serial", "port", "password", "backup", "package", "timeout"]);
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--help" || item === "-h") {
      out.help = true;
      continue;
    }
    if (item === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (item === "--keep-forward") {
      out.keepForward = true;
      continue;
    }
    if (item === "--show-conflicts") {
      out.showConflicts = true;
      continue;
    }
    if (!item.startsWith("--")) {
      throw new StopError("ARGS", "无法识别的参数：" + item);
    }
    const eq = item.indexOf("=");
    const key = eq > 0 ? item.slice(2, eq) : item.slice(2);
    if (!takesValue.has(key)) {
      throw new StopError("ARGS", "未知参数：--" + key);
    }
    let value;
    if (eq > 0) {
      value = item.slice(eq + 1);
    } else {
      value = argv[++i];
      if (value === undefined) throw new StopError("ARGS", "参数 --" + key + " 需要一个值");
    }
    out[key] = key === "port" || key === "timeout" ? Number(value) : value;
  }
  return out;
}

function validate(args) {
  const errors = [];
  if (!args.serial) errors.push("缺少 --serial");
  else if (!/^[A-Za-z0-9._:-]{1,64}$/.test(args.serial)) errors.push("--serial 格式不合法");
  if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535) errors.push("--port 不合法");
  if (!Number.isInteger(args.timeout) || args.timeout < 1000) errors.push("--timeout 不合法");
  if (!/^[A-Za-z0-9._]{1,120}$/.test(args.package)) errors.push("--package 格式不合法");
  if (!args.password) errors.push("缺少 --password（或环境变量 SM_BACKUP_PASSWORD）");
  if (!args.backup) {
    errors.push("缺少 --backup");
  } else if (!fs.existsSync(args.backup) || !fs.statSync(args.backup).isFile()) {
    errors.push("--backup 文件不存在");
  } else if (fs.statSync(args.backup).size < 32) {
    errors.push("--backup 文件过小，不像有效备份");
  }
  return errors;
}

function readMagic(file) {
  const fd = fs.openSync(file, "r");
  try {
    const head = Buffer.alloc(5);
    const n = fs.readSync(fd, head, 0, 5, 0);
    if (n >= 5 && head.toString("latin1") === "SMBK1") return "smbak-encrypted";
    if (n >= 2 && head[0] === 0x50 && head[1] === 0x4b) return "zip-plain";
    return "unknown";
  } finally {
    fs.closeSync(fd);
  }
}

function maskSerial(serial) {
  if (!serial) return "";
  if (serial.length <= 4) return "****";
  return serial.slice(0, 2) + "****" + serial.slice(-2);
}

function redact(text, secret) {
  let out = String(text ?? "");
  if (secret) out = out.split(secret).join("<redacted>");
  return out;
}

function adb(serial, args, options = {}) {
  const opts = {
    encoding: "utf8",
    timeout: options.timeout ?? DEFAULT_ADB_TIMEOUT_MS,
    maxBuffer: 8 * 1024 * 1024,
  };
  try {
    return String(execFileSync("adb", ["-s", serial, ...args], opts)).trim();
  } catch (error) {
    const stderr = error.stderr ? String(error.stderr).trim() : "";
    const stdout = error.stdout ? String(error.stdout).trim() : "";
    const message = stderr || stdout || error.message;
    throw new StopError("ADB", "adb " + args[0] + " 失败：" + message);
  }
}

function listForward(serial) {
  let text = "";
  try {
    text = adb(serial, ["forward", "--list"]);
  } catch {
    return [];
  }
  return text.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const parts = line.split(/\s+/);
    return {device: parts[0], local: parts[1], remote: parts[2]};
  });
}

function ensureForward(serial, port, pid) {
  const target = "localabstract:webview_devtools_remote_" + pid;
  const local = "tcp:" + port;
  const rows = listForward(serial);
  const occupied = rows.find((row) => row.local === local);
  if (occupied) {
    if (occupied.device === serial && occupied.remote === target) {
      return {created: false, reused: true, target};
    }
    throw new StopError("FORWARD_CONFLICT", `端口 ${port} 已被 ${occupied.device || "其它设备"} 的 ${occupied.remote} 占用，请换 --port`);
  }
  adb(serial, ["forward", local, target], {timeout: 15_000});
  return {created: true, reused: false, target};
}

function countArchive(serial, pkg) {
  const countDir = (name) => {
    let text = "";
    try {
      text = adb(serial, ["shell", `run-as ${pkg} ls -1 files/archive/${name}`]);
    } catch {
      return 0;
    }
    return text.split("\n").map((line) => line.trim()).filter((line) => line.endsWith(".json")).length;
  };
  const exported = countDir("exported");
  const imported = countDir("imported");
  return {exported, imported, total: exported + imported};
}

async function findPage(port) {
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${port}/json/list`, {cache: "no-store"});
  } catch {
    throw new StopError("CDP_UNREACHABLE", `连不上 127.0.0.1:${port}，请确认 adb forward 与 WebView 调试已就绪`);
  }
  if (!res.ok) throw new StopError("CDP_UNREACHABLE", "DevTools /json/list HTTP " + res.status);
  const list = await res.json();
  const pages = list.filter((item) => item.type === "page");
  const page = pages.find((item) => String(item.url || "").includes("/v12")) || pages[0];
  if (!page) throw new StopError("CDP_NO_PAGE", "没有可调试页面：先在手机上打开 SocialMate");
  return page;
}

const READ_STATE = `(async()=>{
  const token=String(sessionStorage.getItem('sm-archive-token')||'');
  const headers={'x-archive-token':token,'Accept':'application/json'};
  const pick=async(path)=>{
    const r=await fetch(path,{headers,cache:'no-store'});
    if(!r.ok) throw new Error(path+' HTTP '+r.status);
    return r.json();
  };
  const [backup,favorites]=await Promise.all([
    pick('/v12/api/local/backup'),
    pick('/v12/api/favorites')
  ]);
  return {
    counts: backup.counts || {},
    exportedAt: String(backup.exportedAt || ''),
    favorites: {
      total: Number(favorites.total || 0),
      ids: (favorites.items || []).map((item) => String(item.id || '')).filter(Boolean)
    }
  };
})()`;

function deleteFavoriteExpr(id) {
  return `(async()=>{
    const token=String(sessionStorage.getItem('sm-archive-token')||'');
    const r=await fetch('/v12/api/favorites/'+encodeURIComponent(${JSON.stringify(id)}),{
      method:'DELETE',
      headers:{'x-archive-token':token,'Accept':'application/json'},
      cache:'no-store'
    });
    const data=await r.json().catch(()=>null);
    if(!r.ok) throw new Error('DELETE favorite HTTP '+r.status);
    return {ok:true,removed:Boolean(data && data.removed)};
  })()`;
}

function importFileExpr(password) {
  return `(async()=>{
    const token=String(sessionStorage.getItem('sm-archive-token')||'');
    const pwd=${JSON.stringify(password)};
    const r=await fetch('/v12/api/local/import-file',{
      method:'POST',
      headers:{'x-archive-token':token,'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({password:pwd}),
      cache:'no-store'
    });
    const data=await r.json().catch(()=>null);
    if(!r.ok) {
      const error=new Error((data && (data.code || data.error)) || ('import HTTP '+r.status));
      error.code=data && data.code;
      throw error;
    }
    const conflicts=Array.isArray(data && data.conflicts) ? data.conflicts.map(String) : [];
    const kinds={};
    for(const item of conflicts){
      const kind=item.split(':')[0] || 'unknown';
      kinds[kind]=(kinds[kind]||0)+1;
    }
    return {
      imported:Number((data && data.imported) || 0),
      media:Number((data && data.media) || 0),
      archive:Number((data && data.archive) || 0),
      conflicts,
      conflictKinds:kinds
    };
  })()`;
}

function pushBackup(serial, pkg, backupPath, expectedSize) {
  const remoteTmp = "/data/local/tmp/backup.zip";
  adb(serial, ["push", backupPath, remoteTmp], {timeout: PUSH_TIMEOUT_MS});
  adb(serial, ["shell", `run-as ${pkg} mkdir -p files/import`]);
  const readSize = () => {
    try {
      const value = Number(adb(serial, ["shell", `run-as ${pkg} stat -c %s files/import/backup.zip`]));
      if (Number.isFinite(value) && value > 0) return value;
    } catch {
      // stat 不可用时回退 ls。
    }
    try {
      const row = adb(serial, ["shell", `run-as ${pkg} ls -l files/import/backup.zip`]);
      const value = Number(row.split(/\s+/)[3]);
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  };
  let strategy = "run-as-cp";
  try {
    adb(serial, ["shell", `run-as ${pkg} cp ${remoteTmp} files/import/backup.zip`], {timeout: 60_000});
  } catch {
    // /data/local/tmp 对 app uid 不可读时用管道复制。
  }
  let size = readSize();
  if (size !== expectedSize) {
    strategy = "run-as-cat-pipe";
    adb(serial, ["shell", `cat ${remoteTmp} | run-as ${pkg} sh -c 'cat > files/import/backup.zip'`], {timeout: 60_000});
    size = readSize();
  }
  if (!Number.isFinite(size) || size !== expectedSize) {
    throw new StopError("IMPORT_COPY_SIZE", `手机上 backup.zip 大小 ${size ?? "未知"} 与源文件 ${expectedSize} 不一致`);
  }
  try {
    adb(serial, ["shell", `rm -f ${remoteTmp}`]);
  } catch {
    // /data/local/tmp 清理失败不影响判定。
  }
  return {strategy, size};
}

function normalizeCounts(counts) {
  const source = counts || {};
  return {
    people: Number(source.people || 0),
    cards: Number(source.cards || 0),
    favorites: Number(source.favorites || 0),
    records: Number(source.records ?? source.placeRecords ?? 0),
    placeRecords: Number(source.placeRecords || 0),
    media: Number(source.media || 0),
  };
}

function assertStep(assertions, name, ok, detail) {
  assertions.push({name, ok: Boolean(ok), detail});
}

async function execute(args, result) {
  const steps = [];
  const assertions = [];
  const warnings = [];
  const serial = args.serial;
  const pkg = args.package;
  const secret = args.password;

  const record = (name, detail, startedAt) => {
    steps.push({
      name,
      ok: true,
      ms: Date.now() - startedAt,
      detail,
      at: new Date().toISOString(),
    });
  };

  let createdForward = false;
  let cdp = null;

  try {
    let startedAt = Date.now();
    const state = adb(serial, ["get-state"]);
    if (state !== "device") throw new StopError("DEVICE_NOT_READY", "设备状态不是 device：" + state);
    const model = adb(serial, ["shell", "getprop ro.product.model"]).split("\n")[0] || "";
    const uid = adb(serial, ["shell", `run-as ${pkg} id`]);
    if (!/uid=/.test(uid)) throw new StopError("RUN_AS_BLOCKED", "run-as 不可用：当前安装包不是 debug 包");
    result.device = {package: pkg, model, serialMasked: maskSerial(serial)};
    record("preflight-device", {state, model, runAs: true}, startedAt);

    startedAt = Date.now();
    const pidText = adb(serial, ["shell", "pidof", pkg]);
    const pid = pidText.split(/\s+/).find((item) => /^\d+$/.test(item));
    if (!pid) throw new StopError("APP_NOT_RUNNING", "SocialMate 未运行：请先在手机上打开应用");
    const forward = ensureForward(serial, args.port, pid);
    createdForward = forward.created;
    record("adb-forward", {port: args.port, created: forward.created, reused: forward.reused}, startedAt);

    startedAt = Date.now();
    const page = await findPage(args.port);
    cdp = new CdpSession(page.webSocketDebuggerUrl, args.timeout);
    await cdp.open();
    record("cdp-connect", {title: String(page.title || ""), url: String(page.url || "")}, startedAt);

    startedAt = Date.now();
    const before = await cdp.evaluate(READ_STATE);
    const beforeCounts = normalizeCounts(before.counts);
    const beforeArchive = countArchive(serial, pkg);
    result.before = {counts: beforeCounts, favorites: before.favorites, archive: beforeArchive};
    record("read-before", {counts: beforeCounts, favorites: before.favorites.total, archive: beforeArchive}, startedAt);

    if (before.favorites.ids.length < 1) {
      throw new StopError("NO_FAVORITE", "当前没有收藏，无法执行“删除一条再恢复”的验证；请先手动添加至少一条收藏");
    }

    startedAt = Date.now();
    const targetId = before.favorites.ids[before.favorites.ids.length - 1];
    await cdp.evaluate(deleteFavoriteExpr(targetId));
    const afterDelete = await cdp.evaluate(READ_STATE);
    result.delete = {
      id: targetId,
      before: before.favorites.total,
      after: afterDelete.favorites.total,
    };
    record("delete-favorite", {before: before.favorites.total, after: afterDelete.favorites.total}, startedAt);
    assertStep(assertions, "favorite-really-deleted",
      afterDelete.favorites.total === before.favorites.total - 1
      && !afterDelete.favorites.ids.includes(targetId),
      {before: before.favorites.total, after: afterDelete.favorites.total});

    startedAt = Date.now();
    const size = fs.statSync(args.backup).size;
    const transfer = pushBackup(serial, pkg, args.backup, size);
    result.transfer = {strategy: transfer.strategy, size: transfer.size};
    record("push-to-device", transfer, startedAt);

    startedAt = Date.now();
    const imported = await cdp.evaluate(importFileExpr(secret));
    result.import = {
      imported: imported.imported,
      media: imported.media,
      archive: imported.archive,
      conflicts: imported.conflicts.length,
      conflictKinds: imported.conflictKinds,
    };
    if (args.showConflicts) result.import.conflictIds = imported.conflicts;
    record("import-file", {imported: imported.imported, media: imported.media, archive: imported.archive, conflicts: imported.conflicts.length}, startedAt);

    startedAt = Date.now();
    const after = await cdp.evaluate(READ_STATE);
    const afterCounts = normalizeCounts(after.counts);
    const afterArchive = countArchive(serial, pkg);
    result.after = {counts: afterCounts, favorites: after.favorites, archive: afterArchive};
    record("read-after", {counts: afterCounts, favorites: after.favorites.total, archive: afterArchive}, startedAt);

    const beforeFav = Number(beforeCounts.favorites || before.favorites.total || 0);
    const afterFav = Number(afterCounts.favorites || after.favorites.total || 0);
    assertStep(assertions, "favorites-restored", afterFav >= beforeFav && after.favorites.ids.includes(targetId), {
      before: beforeFav,
      after: afterFav,
      deletedIdPresent: after.favorites.ids.includes(targetId),
    });
    assertStep(assertions, "people-not-regressed",
      afterCounts.people >= beforeCounts.people,
      {before: beforeCounts.people, after: afterCounts.people});
    assertStep(assertions, "cards-not-regressed",
      afterCounts.cards >= beforeCounts.cards,
      {before: beforeCounts.cards, after: afterCounts.cards});
    assertStep(assertions, "records-not-regressed",
      afterCounts.records >= beforeCounts.records,
      {before: beforeCounts.records, after: afterCounts.records});
    assertStep(assertions, "archive-exported-not-regressed",
      afterArchive.exported >= beforeArchive.exported,
      {before: beforeArchive.exported, after: afterArchive.exported});
    assertStep(assertions, "archive-total-not-regressed",
      afterArchive.total >= beforeArchive.total,
      {before: beforeArchive.total, after: afterArchive.total});
    assertStep(assertions, "archive-imported-count-matches",
      afterArchive.imported === beforeArchive.imported + imported.archive,
      {before: beforeArchive.imported, added: imported.archive, after: afterArchive.imported});
    assertStep(assertions, "import-returned-ok",
      imported.imported > 0,
      {imported: imported.imported});

    result.assertions = assertions;
    result.steps = steps;
    result.warnings = warnings;
    result.ok = assertions.every((item) => item.ok);
    result.verdict = result.ok ? "PASS" : "FAIL";
    return result;
  } catch (error) {
    result.assertions = assertions;
    result.steps = steps;
    result.warnings = warnings;
    result.ok = false;
    result.verdict = error.code === "ARGS" ? "INVALID" : "BLOCKED";
    result.error = {code: error.code || "ERROR", message: redact(error.message || error, secret)};
    return result;
  } finally {
    cdp?.close();
    if (createdForward && !args.keepForward) {
      try {
        adb(serial, ["forward", "--remove", "tcp:" + args.port], {timeout: 10_000});
      } catch {
        result.warnings.push("adb forward 清理失败：可手动执行 adb -s " + maskSerial(serial) + " forward --remove tcp:" + args.port);
      }
    }
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.log(JSON.stringify({
      script: "v17-backup-restore",
      ok: false,
      verdict: "INVALID",
      startedAt,
      error: {code: error.code || "ARGS", message: error.message},
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  if (args.help) {
    console.log(usage());
    return;
  }

  const errors = validate(args);
  if (errors.length) {
    console.log(JSON.stringify({
      script: "v17-backup-restore",
      ok: false,
      verdict: "INVALID",
      startedAt,
      errors,
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  const format = readMagic(args.backup);
  if (format === "unknown") {
    console.log(JSON.stringify({
      script: "v17-backup-restore",
      ok: false,
      verdict: "INVALID",
      startedAt,
      error: {code: "BACKUP_FORMAT", message: "不是 SocialMate 备份文件（既不是 SMBK1 加密包，也不是 ZIP）"},
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  if (args.dryRun) {
    console.log(JSON.stringify({
      script: "v17-backup-restore",
      ok: true,
      verdict: "DRY_RUN",
      startedAt,
      planned: {
        serialMasked: maskSerial(args.serial),
        port: args.port,
        package: args.package,
        backup: {bytes: fs.statSync(args.backup).size, format},
        passwordProvided: Boolean(args.password),
        steps: [
          "preflight: adb get-state / run-as / pidof",
          "adb forward tcp:<port> -> webview_devtools_remote_<pid>",
          "read counts + favorites + archive counts",
          "DELETE /v12/api/favorites/:id (最末一条)",
          "adb push backup -> /data/local/tmp/backup.zip -> files/import/backup.zip",
          "POST /v12/api/local/import-file {password}",
          "re-read counts + archive counts and assert",
        ],
      },
      checks: [
        {name: "params", ok: true},
        {name: "backup-exists", ok: true, bytes: fs.statSync(args.backup).size},
        {name: "backup-format", ok: true, value: format},
        {name: "password-provided", ok: Boolean(args.password)},
      ],
      notes: ["dry-run 未连接设备、未执行 adb、未修改手机数据"],
    }, null, 2));
    return;
  }

  const result = {
    script: "v17-backup-restore",
    startedAt,
    finishedAt: "",
    backup: {bytes: fs.statSync(args.backup).size, format},
  };
  const run = await execute(args, result);
  run.finishedAt = new Date().toISOString();
  console.log(JSON.stringify(run, null, 2));
  if (run.ok) {
    process.exitCode = 0;
  } else if (run.verdict === "INVALID") {
    process.exitCode = 2;
  } else if (run.verdict === "FAIL") {
    process.exitCode = 1;
  } else {
    process.exitCode = 3;
  }
}

main().catch((error) => {
  console.log(JSON.stringify({
    script: "v17-backup-restore",
    ok: false,
    verdict: "BLOCKED",
    error: {code: error.code || "ERROR", message: String(error.message || error)},
  }, null, 2));
  process.exitCode = 3;
});