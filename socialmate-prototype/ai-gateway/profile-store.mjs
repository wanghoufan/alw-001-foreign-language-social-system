/**
 * 本机档案持久化存储（仅本机回环服务调用）。
 * 数据落在 SocialMate-Data/Profile/，该目录已被 .gitignore 排除，不入公开仓库。
 * 只接受用户显式确认后的结构化快照；不读取、不写入任何密钥。
 */
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const DEFAULT_ROOT = path.join(REPO_ROOT, "SocialMate-Data", "Profile");

const LIMITS = {stories: 200, people: 200, text: 2000, tags: 12, notes: 50};

function dataRoot() {
  return process.env.SM_PROFILE_DIR || DEFAULT_ROOT;
}

function text(value, max = LIMITS.text) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function normalizeTags(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  return list.map((tag) => text(tag, 40).trim()).filter(Boolean).slice(0, LIMITS.tags);
}

function normalizeStory(story, index) {
  return {
    id: text(story?.id, 80) || `story-${index + 1}`,
    title: text(story?.title, 200),
    cat: text(story?.cat, 60) || "生活",
    tags: normalizeTags(story?.tags),
    cn: text(story?.cn),
    en: text(story?.en),
  };
}

function normalizePerson(person, index) {
  return {
    id: text(person?.id, 80) || `person-${index + 1}`,
    name: text(person?.name, 120),
    about: text(person?.about),
    notes: (Array.isArray(person?.notes) ? person.notes : [])
      .map((note) => text(note, 500).trim())
      .filter(Boolean)
      .slice(0, LIMITS.notes),
  };
}

/** 只保留已知字段，避免把浏览器里的主题/设置/未知内容带进档案。 */
export function normalizeProfile(input) {
  if (!input || typeof input !== "object") {
    throw new TypeError("档案必须是对象");
  }
  const stories = (Array.isArray(input.stories) ? input.stories : []).slice(0, LIMITS.stories);
  const people = (Array.isArray(input.people) ? input.people : []).slice(0, LIMITS.people);
  const updatedAt = new Date().toISOString();
  return {
    schema: 1,
    source: "v1.2-ui",
    confirmedByUser: true,
    updatedAt,
    stories: stories.map(normalizeStory),
    people: people.map(normalizePerson),
  };
}

function renderMarkdown(profile) {
  const lines = [
    "# SocialMate 本机档案",
    "",
    `> 由用户在界面显式确认后写入；更新时间 ${profile.updatedAt}。`,
    "> 本文件位于本机私有数据目录，不进入公开仓库。",
    "",
    `## 我的话题（${profile.stories.length}）`,
    "",
  ];
  for (const story of profile.stories) {
    lines.push(`### ${story.title || "(未命名)"}`, "");
    if (story.tags.length) lines.push(`标签：${story.tags.join("、")}`, "");
    if (story.cn) lines.push(`中文事实：${story.cn}`, "");
    if (story.en) lines.push(`English: ${story.en}`, "");
  }
  lines.push(`## 人物（${profile.people.length}）`, "");
  for (const person of profile.people) {
    lines.push(`### ${person.name || "(未命名)"}`, "");
    if (person.about) lines.push(person.about, "");
    for (const note of person.notes) lines.push(`- ${note}`);
    lines.push("");
  }
  return lines.join("\n");
}

export async function readProfile() {
  try {
    const raw = await fs.readFile(path.join(dataRoot(), "current.json"), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function writeProfile(input) {
  const profile = normalizeProfile(input);
  const root = dataRoot();
  await fs.mkdir(root, {recursive: true});
  const jsonPath = path.join(root, "current.json");
  const tempPath = path.join(root, `.current.json.${process.pid}.tmp`);
  await fs.writeFile(tempPath, JSON.stringify(profile, null, 2), {encoding: "utf8", mode: 0o600});
  await fs.rename(tempPath, jsonPath);
  await fs.writeFile(path.join(root, "current.md"), renderMarkdown(profile), "utf8");
  return profile;
}

export const PROFILE_PATHS = {dataRoot};