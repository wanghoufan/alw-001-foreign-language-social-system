#!/usr/bin/env node
/**
 * 自动学习资料归档 · 批处理 / 受控定时 / 手工命令。
 *
 * 只做本地文件扫描与索引；默认不发起任何云端请求。
 * 现有 AI 分段结果标 existing_ai_segmentation；没有明确 consent 的云端派生标 awaiting_consent。
 *
 * 用法：
 *   node learning-archive-worker.mjs --status [--json]
 *   node learning-archive-worker.mjs --health [--json|--text]   健康摘要（默认 JSON，供脚本消费）
 *   node learning-archive-worker.mjs --once [--quiet] [--json]
 *   node learning-archive-worker.mjs --watch [--interval 300]
 *   node learning-archive-worker.mjs --list [--source-type thought] [--limit 20] [--json]
 *   node learning-archive-worker.mjs --retag-fixtures           历史 QA fixture 补 test 标签
 *   node learning-archive-worker.mjs --ingest-file <path> --source-type self_test [--name <文件名>]
 *   node learning-archive-worker.mjs --root <LearningArchive 目录> ...
 */

import fs from "node:fs/promises";
import path from "node:path";
import {createLearningArchive, SOURCE_TYPES} from "./learning-archive.mjs";

function parseArgs(argv) {
  const args = {_: []};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) {
      args._.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function help() {
  return [
    "自动学习资料归档 worker",
    "",
    "  --status                 查看索引与最近一次扫描",
    "  --health                 健康摘要（JSON；lastScan/间隔/PID/漏扫/DEGRADED/恢复入口）",
    "  --text                   配合 --health 输出人类可读文本",
    "  --once                   扫描允许目录并索引新资料",
    "  --watch                  常驻轮询（默认 300 秒）",
    "  --interval <秒>          watch 间隔",
    "  --list                   列出索引条目",
    "  --retag-fixtures         给历史 QA fixture 补 test/sourceTag 标签（幂等）",
    "  --remove <materialId>    只撤销索引与派生文件（原始资料保留）",
    "  --source-type <类型>     self_test/course/conversation/thought/practice_review",
    "  --ingest-file <路径>     从本机文件安全投递（校验大小/类型/哈希）",
    "  --name <文件名>          ingest 时的目标文件名",
    "  --root <目录>            覆盖 LearningArchive 根目录",
    "  --json                   机器可读输出",
    "  --quiet                  只输出错误",
  ].join("\n");
}

function humanStatus(status) {
  const lines = [];
  lines.push(`LearningArchive: ${status.root}`);
  lines.push(`条目总数: ${status.total}｜真实条目: ${status.realTotal ?? status.total}｜QA fixture: ${status.testFixtures ?? 0}｜最近更新: ${status.updatedAt || "—"}`);
  lines.push(`分类: ${SOURCE_TYPES.map((type) => `${type}=${status.bySource[type] || 0}`).join("  ")}`);
  lines.push(`真实分类: ${SOURCE_TYPES.map((type) => `${type}=${status.realBySource?.[type] ?? status.bySource[type] ?? 0}`).join("  ")}`);
  const statuses = Object.entries(status.byStatus || {}).map(([key, value]) => `${key}=${value}`).join("  ");
  lines.push(`处理状态: ${statuses || "—"}`);
  lines.push(`待云端同意: ${status.awaitingConsent}`);
  if (status.lastRun) {
    const run = status.lastRun;
    lines.push(`最近扫描: ${run.runId || "—"}｜scanned=${run.scanned ?? "—"} indexed=${run.indexed ?? "—"} unchanged=${run.unchanged ?? "—"} quarantined=${run.quarantined ?? "—"} failed=${run.failed ?? "—"}`);
    if (Array.isArray(run.roots)) {
      const rootLines = run.roots.map((item) => `${item.key}:${item.status}${item.files ? `(${item.files})` : ""}`);
      lines.push(`来源: ${rootLines.join("  ")}`);
    }
  }
  return lines.join("\n");
}

function humanHealth(report) {
  const lines = [];
  lines.push(`学习归档健康: ${report.state}${report.ok ? "" : "（需关注）"}`);
  lines.push(`lastScan: ${report.lastScan || "—"}（${report.lastScanAgeSeconds ?? "—"} 秒前）｜间隔 ${report.intervalSeconds}s｜下次约 ${report.nextScanEtaSeconds}s 后`);
  lines.push(`PID: ${report.runningPid ?? "—"}（${report.running ? "running" : "not running"}）｜连续漏扫 ${report.consecutiveMissedCycles} 次｜累计漏扫 ${report.missedCycles ?? "—"}`);
  lines.push(`最近一轮: ${report.lastRunId || "—"}｜indexed=${report.lastIndexed ?? "—"} unchanged=${report.lastUnchanged ?? "—"} failed=${report.lastFailed ?? "—"}｜错误码 ${report.lastErrorCode || "—"}`);
  lines.push(`条目: ${report.totalMaterials}｜云调用: ${report.cloudCalls}`);
  lines.push(`来源: ${report.sources.map((item) => `${item.key}:${item.status}`).join("  ")}`);
  lines.push(`恢复: ${report.recovery.command}`);
  return lines.join("\n");
}

function humanRun(summary) {
  if (!summary.ok) return `扫描失败: ${summary.code || summary.error || "unknown"}`;
  const lines = [];
  lines.push(`扫描完成: ${summary.runId}`);
  lines.push(`扫描 ${summary.scanned} 个文件；新索引 ${summary.indexed}；未变 ${summary.unchanged}；隔离 ${summary.quarantined}；跳过 ${summary.skipped}（无同意 ${summary.skippedConsent}）；失败 ${summary.failed}`);
  lines.push(`来源: ${summary.roots.map((item) => `${item.key}:${item.status}${item.files ? `(${item.files})` : ""}`).join("  ")}`);
  lines.push(`索引总数: ${summary.totalMaterials}`);
  return lines.join("\n");
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    console.log(help());
    return 0;
  }
  const root = args.root || undefined;
  const store = createLearningArchive(root ? {root} : {});
  const json = args.json === true;
  const quiet = args.quiet === true;

  if (args.health) {
    const report = await store.health({intervalSeconds: args.interval ? Number(args.interval) : undefined});
    if (args.text === true) console.log(humanHealth(report));
    else console.log(JSON.stringify(report, null, 2));
    return report.ok ? 0 : 1;
  }

  if (args["retag-fixtures"]) {
    const result = await store.markTestFixtures();
    if (json) console.log(JSON.stringify(result, null, 2));
    else console.log(`QA fixture 标签: 本次补标 ${result.updated.length} 条${result.updated.length ? `（${result.updated.join(", ")}）` : ""}｜累计 ${result.testFixtures} 条｜索引总数 ${result.total}`);
    return 0;
  }

  if (args["ingest-file"]) {
    const file = path.resolve(String(args["ingest-file"]));
    const sourceType = String(args["source-type"] || "");
    if (!sourceType) throw new Error("--ingest-file 需要同时提供 --source-type");
    const content = await fs.readFile(file);
    const result = await store.ingest({
      sourceType,
      filename: String(args.name || path.basename(file)),
      content,
    });
    if (json) console.log(JSON.stringify(result, null, 2));
    else console.log(`投递${result.ok ? "完成" : "失败"}: ${result.status}${result.duplicate ? "（重复，未新增）" : ""}｜${result.materialId || "—"}`);
    return result.ok ? 0 : 1;
  }

  if (args.remove) {
    const result = await store.retract(String(args.remove));
    if (json) console.log(JSON.stringify(result, null, 2));
    else console.log(result.ok ? `已撤销索引 ${result.materialId}；原始文件保留：${result.originalPathRef}` : `撤销失败：${result.code}`);
    return result.ok ? 0 : 1;
  }

  if (args.list) {
    const result = await store.list({
      sourceType: args["source-type"] ? String(args["source-type"]) : undefined,
      status: args.filter ? String(args.filter) : undefined,
      limit: Number(args.limit || 200),
    });
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`共 ${result.total} 条`);
      for (const item of result.materials) {
        console.log(`${item.materialId}  ${item.sourceType}  v${item.version}  ${item.processingStatus}  ${item.consentScope}  ${item.sourceId}`);
      }
    }
    return 0;
  }

  if (args.watch) {
    const interval = Math.max(30, Number(args.interval || process.env.SM_LEARNING_ARCHIVE_INTERVAL || 300));
    let stopped = false;
    const stop = () => { stopped = true; };
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
    if (!quiet) console.log(`WATCH: 学习归档常驻启动 pid=${process.pid}｜interval=${interval}s｜root=${store.root}`);
    while (!stopped) {
      const cycleStartedAt = new Date().toISOString();
      let summary = null;
      let errorCode = null;
      try {
        summary = await store.runScan();
        if (!quiet) console.log(json ? JSON.stringify(summary, null, 2) : humanRun(summary));
      } catch (error) {
        errorCode = error.code || error.message;
        if (!quiet) console.error(`扫描异常: ${errorCode}`);
      }
      // 心跳落盘：--health 与外部脚本据此判断 lastScan/漏扫/连续 DEGRADED。
      await store.recordCycle({
        intervalSeconds: interval,
        startedAt: cycleStartedAt,
        endedAt: new Date().toISOString(),
        summary,
        errorCode,
      }).catch((error) => {
        if (!quiet) console.error(`心跳写入失败: ${error.code || error.message}`);
      });
      for (let i = 0; i < interval && !stopped; i += 1) await sleep(1000);
    }
    return 0;
  }

  if (args.once) {
    const summary = await store.runScan();
    if (json) console.log(JSON.stringify(summary, null, 2));
    else if (!quiet || !summary.ok) console.log(humanRun(summary));
    return summary.ok ? 0 : 1;
  }

  const status = await store.status();
  const health = await store.health({intervalSeconds: args.interval ? Number(args.interval) : undefined});
  if (json) console.log(JSON.stringify({...status, health}, null, 2));
  else console.log(`${humanStatus(status)}\n${humanHealth(health)}`);
  return 0;
}

main().then((code) => {
  process.exitCode = code;
}).catch((error) => {
  console.error(`失败: ${error.code || error.message}`);
  process.exitCode = 1;
});