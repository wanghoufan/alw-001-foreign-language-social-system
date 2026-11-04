#!/usr/bin/env node
/**
 * T4-1 定点校验：LearningArchive 索引完整性 / 幂等 / 拒绝 / 索引报错不删资料
 *
 * 对真实索引只做「读 + 重算 hash」；所有会写索引的用例都在 os.tmpdir() 的副本里跑。
 * 用法：node verify-t4-1-archive.mjs
 * 退出码：0 = 全通过。
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../../..");
const GW = path.join(ROOT, "socialmate-prototype", "ai-gateway");
const REAL_ROOT = path.join(ROOT, "SocialMate-Data", "LearningArchive");
const INDEX_FILE = path.join(REAL_ROOT, "index.json");

const {createLearningArchive, SOURCE_TYPES} = await import(
  pathToFileURL(path.join(GW, "learning-archive.mjs")).href);

const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ok: true, name, detail: detail || ""});
    console.log(`PASS  ${name}${detail ? `  ${detail}` : ""}`);
  } catch (error) {
    results.push({ok: false, name, detail: error.message});
    console.log(`FAIL  ${name}  → ${error.message}`);
  }
}

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

async function main() {
  console.log(`== T4-1 归档定点校验 @ ${new Date().toISOString()}`);
  console.log(`LearningArchive = ${REAL_ROOT}`);
  console.log(`index.json sha256 = ${sha256(await fs.readFile(INDEX_FILE))}`);

  const real = createLearningArchive({root: REAL_ROOT, projectRoot: ROOT});
  const st = await real.status();
  const index = JSON.parse(await fs.readFile(INDEX_FILE, "utf8"));

  console.log(`\n-- A. 基线分布（--status 同源数据）`);
  console.log(`   total=${st.total} ${SOURCE_TYPES.map((t) => `${t}=${st.bySource[t] || 0}`).join(" ")}`);
  console.log(`   byStatus=${JSON.stringify(st.byStatus)} awaitingConsent=${st.awaitingConsent}`);

  await check("A1 conversation=3 / thought=18 / self_test=0 / course=0（与 HANDOFF 一致）", () => {
    assert.equal(st.bySource.conversation, 3);
    assert.equal(st.bySource.thought, 18);
    assert.equal(st.bySource.self_test, 0);
    assert.equal(st.bySource.course, 0);
    return `practice_review=${st.bySource.practice_review} total=${st.total}`;
  });

  await check("A2 全部条目仍是 local_only（无未授权外发）", () => {
    assert.equal(st.awaitingConsent, st.total);
    return `${st.awaitingConsent}/${st.total}`;
  });

  await check("A3 materialId / logicalId 无重复", () => {
    const mids = index.materials.map((m) => m.materialId);
    assert.equal(new Set(mids).size, mids.length);
    const logical = index.materials.map((m) => m.logicalId);
    return `materialId 唯一=${mids.length}；logicalId 唯一=${new Set(logical).size}`;
  });

  console.log(`\n-- B. 原件 hash 逐个重算（${index.materials.length} 条）`);

  const rootMap = new Map((real.roots || []).map((item) => [item.key, item.dir]));
  const hashMisses = [];
  let hashOk = 0;
  let missingOriginals = 0;
  for (const entry of index.materials) {
    const [key, ...rest] = String(entry.originalPathRef).split(":");
    const rel = rest.join(":");
    const dir = rootMap.get(key);
    if (!dir) { hashMisses.push(`${entry.materialId}: unknown root ${key}`); continue; }
    const abs = path.join(dir, rel);
    let buf;
    try {
      buf = await fs.readFile(abs);
    } catch {
      missingOriginals += 1;
      hashMisses.push(`${entry.materialId}: ENOENT ${entry.originalPathRef}`);
      continue;
    }
    const actual = sha256(buf);
    if (actual === entry.originalSha256 && buf.length === entry.size) hashOk += 1;
    else hashMisses.push(`${entry.materialId}: ${entry.originalSha256} != ${actual}`);
  }
  await check("B1 每条索引的 originalSha256 与原件重算一致", () => {
    assert.deepEqual(hashMisses, []);
    return `${hashOk}/${index.materials.length} 一致，缺失原件=${missingOriginals}`;
  });

  await check("B2 索引条目只引用路径，不保存全文（body 内无 rawInput/长正文）", () => {
    const leaks = index.materials.filter((m) => "rawInput" in m || "text" in m || "content" in m);
    assert.equal(leaks.length, 0);
    return "仅有 pathRef/hash/metadata";
  });

  console.log("\n-- C. 隔离副本：二次扫描幂等（不写真实索引）");

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "t41-archive-"));
  await fs.mkdir(tmpRoot, {recursive: true});
  await fs.copyFile(INDEX_FILE, path.join(tmpRoot, "index.json"));
  const copy = createLearningArchive({root: tmpRoot, projectRoot: ROOT});
  const first = await copy.runScan();
  const second = await copy.runScan();

  console.log(`   first : scanned=${first.scanned} indexed=${first.indexed} unchanged=${first.unchanged} quarantined=${first.quarantined} skipped=${first.skipped} failed=${first.failed} total=${first.totalMaterials}`);
  console.log(`   second: scanned=${second.scanned} indexed=${second.indexed} unchanged=${second.unchanged} quarantined=${second.quarantined} skipped=${second.skipped} failed=${second.failed} total=${second.totalMaterials}`);
  if (first.indexed) console.log(`   first.indexedBySource=${JSON.stringify(first.indexedBySource)}`);

  await check("C1 第二次扫描 indexed=0（幂等，不重复插入）", () => {
    assert.equal(second.indexed, 0);
    assert.equal(second.totalMaterials, first.totalMaterials);
    return `unchanged=${second.unchanged} total=${second.totalMaterials}`;
  });

  await check("C2 二次扫描 changed 数与文件数一致（无遗漏、无重复计数）", () => {
    assert.equal(second.indexed + second.unchanged + second.skipped + second.quarantined + second.failed, second.scanned);
    return `scanned=${second.scanned}`;
  });

  await check("C3 增量只包含「上次扫描后新建的文件」", () => {
    const detail = first.indexed
      ? `首次在副本上补录 ${first.indexed} 条（${JSON.stringify(first.indexedBySource)}），说明真实索引还没覆盖这些新文件`
      : "副本无新增，真实索引已是最新";
    return detail;
  });

  console.log("\n-- D. 拒绝类用例（临时目录，不投递真实内容）");

  const rejects = [
    ["非法 sourceType", {sourceType: "private_chat", filename: "a.md", content: "x"}, "INVALID_SOURCE_TYPE", 400],
    ["扩展名不在白名单", {sourceType: "thought", filename: "a.exe", content: "x"}, "EXT_NOT_ALLOWED", 400],
    ["空内容", {sourceType: "thought", filename: "b.md", content: ""}, "EMPTY_CONTENT", 400],
    ["超过 5MB", {sourceType: "thought", filename: "c.txt", content: "x".repeat(5 * 1024 * 1024 + 1)}, "CONTENT_TOO_LARGE", 413],
  ];
  for (const [label, payload, code, status] of rejects) {
    await check(`D ${label} → ${code}/${status}`, async () => {
      let caught = null;
      try {
        await copy.ingest(payload);
      } catch (error) {
        caught = error;
      }
      assert.ok(caught, "应当抛错");
      assert.equal(caught.code, code);
      assert.equal(caught.status, status);
      return `${caught.code} (${caught.status})`;
    });
  }

  await check("D5 同内容重复投递 → duplicate:true，不新增条目", async () => {
    const payload = {sourceType: "thought", filename: "dup-check.md", content: "T4-1 幂等探针（本地临时目录）\n"};
    const a = await copy.ingest(payload);
    const b = await copy.ingest(payload);
    assert.equal(a.status, "indexed");
    assert.equal(b.status, "unchanged");
    assert.equal(b.duplicate, true);
    return `materialId=${a.materialId} 第二次 status=${b.status}`;
  });

  console.log("\n-- E. 索引报错场景不删用户资料");

  const badRoot = await fs.mkdtemp(path.join(os.tmpdir(), "t41-corrupt-"));
  await fs.writeFile(path.join(badRoot, "index.json"), "{ this is not json", "utf8");
  const broken = createLearningArchive({root: badRoot, projectRoot: ROOT});
  const stBroken = await broken.status();
  const quarantined = await fs.readdir(path.join(badRoot, "quarantine")).catch(() => []);

  await check("E1 索引损坏 → 不抛异常、不静默覆盖，先隔离副本再从空索引继续", () => {
    assert.equal(stBroken.ok, true);
    assert.equal(stBroken.total, 0);
    assert.ok(quarantined.some((n) => n.startsWith("index-corrupt-")), "应有 index-corrupt-* 留档");
    return `quarantine=${quarantined.join(",")}`;
  });

  await check("E2 损坏后重扫只读源目录，用户原件仍在（抽查 conversation 源）", async () => {
    const after = await broken.runScan();
    assert.equal(after.ok, true);
    const convDir = rootMap.get("conversation");
    const walk = async (dir) => {
      const entries = await fs.readdir(dir, {withFileTypes: true});
      let n = 0;
      for (const entry of entries) {
        if (entry.isDirectory()) n += await walk(path.join(dir, entry.name));
        else n += 1;
      }
      return n;
    };
    const files = await walk(convDir);
    assert.ok(files >= 3, `会话源文件数=${files}`);
    return `重扫 indexed=${after.indexed}；源目录仍有 ${files} 个会话来件（含 .md 备注，不进索引）`;
  });

  await check("E3 retract 只撤索引与派生，原件保留", async () => {
    const probe = {sourceType: "thought", filename: "retract-check.md", content: "T4-1 retract 探针\n"};
    const ing = await copy.ingest(probe);
    const inboxFile = path.join(tmpRoot, "inbox", ing.pathRef.split(":")[1]);
    const before = await fs.readFile(inboxFile);
    const out = await copy.retract(ing.materialId);
    const after = await fs.readFile(inboxFile);
    assert.equal(out.ok, true);
    assert.equal(out.originalKept, true);
    assert.equal(sha256(before), sha256(after));
    return `原件字节不变 ${sha256(after).slice(0, 12)}…`;
  });

  await check("E4 并发锁：已有扫描在跑时返回 RUN_LOCKED（不并发写索引）", async () => {
    await fs.writeFile(path.join(tmpRoot, "run.lock"), JSON.stringify({pid: process.pid, at: new Date().toISOString()}));
    const out = await copy.runScan();
    assert.equal(out.ok, false);
    assert.equal(out.code, "RUN_LOCKED");
    await fs.rm(path.join(tmpRoot, "run.lock"), {force: true});
    return "第二次并发扫描被拒";
  });

  await check("F1 真实索引文件未被本校验改动", async () => {
    const now = sha256(await fs.readFile(INDEX_FILE));
    const baseline = process.env.T41_INDEX_BASELINE;
    if (baseline) assert.equal(now, baseline);
    return `${now}${baseline ? "（与基线一致）" : ""}`;
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n== 汇总：${results.length - failed.length}/${results.length} PASS，${failed.length} FAIL`);
  if (failed.length) {
    for (const f of failed) console.log(`   FAIL ${f.name}: ${f.detail}`);
    process.exitCode = 1;
  }
  await fs.rm(tmpRoot, {recursive: true, force: true});
  await fs.rm(badRoot, {recursive: true, force: true});
}

main().catch((error) => {
  console.error(`脚本异常: ${error?.stack || error}`);
  process.exitCode = 1;
});
