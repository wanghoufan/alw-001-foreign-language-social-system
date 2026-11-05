import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {CardError, createPrivateCards} from "./private-cards.mjs";

const PNG_1X1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function withStore(fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sm-cards-"));
  try {
    await fn(createPrivateCards({root}), root);
  } finally {
    await fs.rm(root, {recursive: true, force: true});
  }
}

test("新建/读取/列表：三类卡片互不串台", async () => {
  await withStore(async (store) => {
    const story = await store.create({kind: "story", title: "早上散步", cn: "每天早上都去散步。", en: "I walk every morning.", tags: "生活, 习惯"});
    assert.equal(story.kind, "story");
    assert.equal(story.revision, 1);
    assert.deepEqual(story.tags, ["生活", "习惯"]);
    assert.equal(story.private, true);

    const app = await store.create({kind: "app", title: "提词器", cn: "朗读辅助", en: "Prompt reader"});
    assert.notEqual(story.id, app.id);

    assert.equal((await store.list("story")).length, 1);
    assert.equal((await store.list("app")).length, 1);
    assert.equal((await store.list("place")).length, 0);
    assert.equal((await store.get("story", story.id)).title, "早上散步");
  });
});

test("同 id 重复创建返回 CARD_EXISTS；非法 id/kind 被拒", async () => {
  await withStore(async (store) => {
    await store.create({kind: "story", id: "walk", title: "散步"});
    await assert.rejects(
      () => store.create({kind: "story", id: "walk", title: "重复"}),
      (err) => err instanceof CardError && err.code === "CARD_EXISTS" && err.status === 409,
    );
    await assert.rejects(() => store.get("story", "../etc"), (err) => err.code === "ID_INVALID");
    await assert.rejects(() => store.list("people"), (err) => err.code === "KIND_INVALID");
  });
});

test("编辑必须带当前 revision；冲突返回 409 与 currentRevision", async () => {
  await withStore(async (store) => {
    const card = await store.create({kind: "place", cnName: "骑楼老街", cn: "老街", en: "Arcade street"});
    const updated = await store.update("place", card.id, {revision: 1, patch: {cn: "骑楼老街的早晨"}});
    assert.equal(updated.revision, 2);
    assert.equal(updated.cn, "骑楼老街的早晨");
    await assert.rejects(
      () => store.update("place", card.id, {revision: 1, patch: {cn: "旧版本写入"}}),
      (err) => err instanceof CardError && err.code === "REVISION_CONFLICT" && err.currentRevision === 2,
    );
  });
});

test("软删进入回收站，列表默认不返回；恢复后回到原列表", async () => {
  await withStore(async (store) => {
    const card = await store.create({kind: "story", title: "待删", cn: "中文", en: "English"});
    const trashed = await store.softDelete("story", card.id);
    assert.ok(trashed.deletedAt);
    assert.equal((await store.list("story")).length, 0);
    const all = await store.list("story", {includeDeleted: true});
    assert.equal(all.length, 1);
    const restored = await store.restore("story", card.id);
    assert.equal(restored.deletedAt, null);
    assert.equal((await store.list("story")).length, 1);
  });
});

test("覆盖层只记改写字，原始记录不动；可撤销", async () => {
  await withStore(async (store) => {
    const first = await store.putOverride("place", "12", {cn: "我改的中文"});
    assert.equal(first.revision, 1);
    const second = await store.putOverride("place", "12", {en: "My English"});
    assert.equal(second.revision, 2);
    assert.deepEqual(second.values, {cn: "我改的中文", en: "My English"});
    assert.equal((await store.listOverrides("place")).length, 1);
    await store.deleteOverride("place", "12");
    assert.equal(await store.getOverride("place", "12"), null);
  });
});

test("媒体：合法 PNG 入库并成为封面；非法类型与路径穿越被拒", async () => {
  await withStore(async (store, root) => {
    const card = await store.create({kind: "place", cnName: "红城湖", cn: "湖边", en: "Lake"});
    const added = await store.addMedia("place", card.id, {data: PNG_1X1, mime: "image/png"});
    assert.match(added.media.id, /^m[a-f0-9]{16}$/);
    assert.equal(added.media.width, 1);
    assert.equal(added.card.coverMediaId, added.media.id);

    const file = path.join(root, "media", card.id, added.media.file);
    assert.ok((await fs.stat(file)).size > 0);
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600);

    const readBack = await store.readMedia(card.id, added.media.file);
    assert.equal(readBack.mime, "image/png");
    assert.ok(readBack.buf.length > 0);

    await assert.rejects(
      () => store.addMedia("place", card.id, {data: Buffer.from("not an image").toString("base64")}),
      (err) => err.code === "MEDIA_TYPE_INVALID",
    );
    await assert.rejects(
      () => store.readMedia("../evil", "m0000000000000000.png"),
      (err) => err.code === "ID_INVALID",
    );
    await assert.rejects(
      () => store.readMedia(card.id, "../../etc/passwd"),
      (err) => err.code === "MEDIA_PATH_INVALID",
    );

    const afterDelete = await store.deleteMedia("place", card.id, added.media.id);
    assert.equal(afterDelete.media.length, 0);
    assert.equal(afterDelete.coverMediaId, "");
  });
});

test("统计只数本 kind，不把回收站当在用", async () => {
  await withStore(async (store) => {
    await store.create({kind: "story", title: "A", cn: "a", en: "a"});
    const b = await store.create({kind: "story", title: "B", cn: "b", en: "b"});
    await store.softDelete("story", b.id);
    const stats = await store.stats();
    assert.equal(stats.kinds.story.live, 1);
    assert.equal(stats.kinds.story.deleted, 1);
  });
});
/* ===================== V1.6 整改补充用例 ===================== */

test("缺 revision 的编辑被拒为 REVISION_REQUIRED，并带上当前版本", async () => {
  await withStore(async (store) => {
    const card = await store.create({kind: "place", cnName: "海边", cn: "a"});
    await assert.rejects(
      () => store.update("place", card.id, {patch: {cn: "无版本写入"}}),
      (err) => err instanceof CardError && err.status === 400
        && err.code === "REVISION_REQUIRED" && err.currentRevision === 1,
    );
    assert.equal((await store.get("place", card.id)).cn, "a", "被拒的写入不得落盘");
  });
});

test("restore 遇到同 id 在库卡片返回 RESTORE_CONFLICT，且不覆盖新建内容", async () => {
  await withStore(async (store) => {
    await store.create({kind: "story", id: "clash", title: "原始", cn: "原始内容"});
    await store.softDelete("story", "clash");
    await store.create({kind: "story", id: "clash", title: "新建", cn: "新建内容"});
    await assert.rejects(
      () => store.restore("story", "clash"),
      (err) => err instanceof CardError && err.status === 409 && err.code === "RESTORE_CONFLICT",
    );
    const live = await store.get("story", "clash");
    assert.equal(live.cn, "新建内容");
    assert.equal(live.title, "新建");
  });
});

test("并发：同一卡片 5 次 update 串行执行，最终 revision 递增且内容一致", async () => {
  await withStore(async (store) => {
    await store.create({kind: "story", id: "race", title: "并发", cn: "起点"});
    const successes = [];
    const failures = [];
    const worker = async (workerId) => {
      for (let attempt = 0; attempt < 15; attempt += 1) {
        const current = await store.get("story", "race");
        try {
          successes.push(await store.update("story", "race",
            {revision: current.revision, patch: {cn: `worker-${workerId}-${attempt}`}}));
          return;
        } catch (err) {
          if (err instanceof CardError && err.code === "REVISION_CONFLICT") continue;
          failures.push(err);
          return;
        }
      }
      failures.push(new Error("RETRY_EXHAUSTED"));
    };
    await Promise.all(Array.from({length: 5}, (_, index) => worker(index)));

    assert.equal(failures.length, 0, `并发写出现非冲突失败：${failures.map((err) => err.message).join("; ")}`);
    assert.equal(successes.length, 5);
    const final = await store.get("story", "race");
    assert.equal(final.revision, 6);
    const winner = successes.find((card) => card.revision === 6);
    assert.ok(winner);
    assert.equal(final.cn, winner.cn, "磁盘内容必须与最后一次成功响应一致");
  });
});

test("坏 JSON 卡片记入 warnings，其他卡片照常返回", async () => {
  await withStore(async (store, root) => {
    await store.create({kind: "app", id: "good", title: "好卡片", cn: "正常"});
    await fs.mkdir(path.join(root, "apps"), {recursive: true});
    await fs.writeFile(path.join(root, "apps", "broken.json"), "{not json", "utf8");

    const warnings = [];
    const cards = await store.list("app", {warnings});
    assert.equal(cards.length, 1, "坏文件不能拖垮整个列表");
    assert.equal(cards[0].id, "good");
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].file, "broken.json");
    assert.equal(warnings[0].kind, "app");
  });
});