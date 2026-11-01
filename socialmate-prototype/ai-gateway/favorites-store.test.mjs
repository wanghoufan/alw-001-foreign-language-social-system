/**
 * P2-03 收藏表达：去重、上限、删除、权限、不覆写 Profile。
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {FAVORITES_LIMIT, addFavorite, listFavorites, removeFavorite} from "./favorites-store.mjs";

async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sm-fav-"));
  const favDir = path.join(root, "Favorites");
  const profileDir = path.join(root, "Profile");
  const previousFav = process.env.SM_FAVORITES_DIR;
  const previousProfile = process.env.SM_PROFILE_DIR;
  process.env.SM_FAVORITES_DIR = favDir;
  process.env.SM_PROFILE_DIR = profileDir;
  t.after(async () => {
    if (previousFav === undefined) delete process.env.SM_FAVORITES_DIR;
    else process.env.SM_FAVORITES_DIR = previousFav;
    if (previousProfile === undefined) delete process.env.SM_PROFILE_DIR;
    else process.env.SM_PROFILE_DIR = previousProfile;
    await fs.rm(root, {recursive: true, force: true});
  });
  return {root, favDir, profileDir};
}

test("新增收藏：写入中英文、来源、时间，目录 0700 / 文件 0600", async (t) => {
  const {favDir} = await setup(t);
  const result = await addFavorite({
    en: "Could you say that again, please?", zh: "能再说一遍吗？",
    source: "2026-11-01 会话复盘", personSlug: "anna", confirm: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.duplicate, false);
  assert.equal(result.total, 1);
  assert.match(result.item.id, /^fav-[0-9a-f]{10}$/);
  assert.ok(Date.parse(result.item.createdAt));

  assert.equal(((await fs.stat(favDir)).mode & 0o777).toString(8), "700");
  const jsonFile = path.join(favDir, "favorites.json");
  assert.equal(((await fs.stat(jsonFile)).mode & 0o777).toString(8), "600");
  assert.equal(((await fs.stat(path.join(favDir, "favorites.md"))).mode & 0o777).toString(8), "600");
  const md = await fs.readFile(path.join(favDir, "favorites.md"), "utf8");
  assert.ok(md.includes("Could you say that again, please?"));
  assert.ok(md.includes("能再说一遍吗？"));
});

test("重复收藏（同 en 归一化）不新增，返回 duplicate 与已有条目", async (t) => {
  await setup(t);
  const first = await addFavorite({en: "That sounds good.", zh: "听起来不错。", confirm: true});
  const again = await addFavorite({en: "  that   SOUNDS good.  ", zh: "重复的", confirm: true});
  assert.equal(again.duplicate, true);
  assert.equal(again.total, 1);
  assert.equal(again.item.id, first.item.id);
  assert.equal(again.item.zh, "听起来不错。", "重复时保留原有条目，不覆盖");
  assert.equal((await listFavorites()).total, 1);
});

test("列表按收藏时间倒序，DELETE 生效，删除不存在的 id 返回 404", async (t) => {
  await setup(t);
  const a = await addFavorite({en: "First one.", zh: "第一条", confirm: true});
  const b = await addFavorite({en: "Second one.", zh: "第二条", confirm: true});
  const list = await listFavorites();
  assert.equal(list.total, 2);
  assert.equal(list.limit, FAVORITES_LIMIT);
  assert.deepEqual(list.items.map((item) => item.id), [b.item.id, a.item.id]);

  const removed = await removeFavorite(a.item.id);
  assert.equal(removed.removed, true);
  assert.equal(removed.total, 1);
  await assert.rejects(() => removeFavorite(a.item.id), (error) => error.status === 404);
  await assert.rejects(() => removeFavorite("../../x"), (error) => error.status === 400);
});

test("容量上限 500：超限明确拒绝且不写坏已有数据", async (t) => {
  const {favDir} = await setup(t);
  await fs.mkdir(favDir, {recursive: true});
  const items = Array.from({length: FAVORITES_LIMIT}, (_, index) => ({
    id: `fav-${String(index).padStart(10, "0")}`,
    en: `sentence number ${index}`,
    zh: "",
    source: "",
    personSlug: "",
    createdAt: "2026-11-01T00:00:00.000Z",
  }));
  await fs.writeFile(path.join(favDir, "favorites.json"),
    JSON.stringify({schema: 1, updatedAt: items[0].createdAt, items}), "utf8");

  await assert.rejects(() => addFavorite({en: "one more sentence", confirm: true}), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, "FAVORITES_FULL");
    assert.match(error.message, /500/);
    return true;
  });
  const after = JSON.parse(await fs.readFile(path.join(favDir, "favorites.json"), "utf8"));
  assert.equal(after.items.length, FAVORITES_LIMIT, "超限不得写入或截断");
});

test("校验：缺少 confirm、空英文、非法人物标识都拒绝", async (t) => {
  await setup(t);
  await assert.rejects(() => addFavorite({en: "Hello there."}), (error) => error.code === "CONFIRM_REQUIRED");
  await assert.rejects(() => addFavorite({en: " ", confirm: true}), (error) => error.code === "EN_REQUIRED");
  await assert.rejects(() => addFavorite({en: "纯中文也行", confirm: true}), (error) => error.code === "EN_NOT_LATIN");
  await assert.rejects(() => addFavorite({en: "Valid sentence.", personSlug: "../../etc", confirm: true}),
    (error) => error.code === "INVALID_PERSON_SLUG");
});

test("不覆写 Profile：收藏只写自己的文件，Profile 目录保持不存在", async (t) => {
  const {profileDir, favDir} = await setup(t);
  await addFavorite({en: "Nice to meet you.", zh: "很高兴认识你。", confirm: true});
  await assert.rejects(() => fs.stat(profileDir), /ENOENT/, "收藏不得创建或改写 Profile");
  assert.deepEqual((await fs.readdir(favDir)).sort(), ["favorites.json", "favorites.md"]);
  const stored = JSON.parse(await fs.readFile(path.join(favDir, "favorites.json"), "utf8"));
  assert.equal(stored.schema, 1, "收藏文件有自己的 schema，与 Profile.schema 无关");
});
