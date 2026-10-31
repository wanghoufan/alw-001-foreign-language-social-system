import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize } from './tokenize.js';
import { buildIndex } from './bm25.js';
import { parseV14 } from './parse-v14.js';
import { parseHainan } from './parse-hainan.js';
import { loadStories } from './stories.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../..');
const BRIDGE_ROOT = path.resolve(HERE, '../..');

export const DEFAULT_PATHS = Object.freeze({
  v14: path.join(
    REPO_ROOT,
    'docs/成果整理/2026-10-31 - Mac Mini - ChatGPT - Bilingual Software Portfolio-Demo Guide - V1.4.md',
  ),
  hainan: path.join(
    REPO_ROOT,
    'docs/成果整理/Hainan-Travel-Guide/dist/Hainan_115_Real_Photo_Guide/places.json',
  ),
  stories: path.join(BRIDGE_ROOT, 'content/personal-stories.json'),
});

function relative(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join('/');
}

function readRequired(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} 不存在：${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

export function loadContent(overrides = {}) {
  const paths = {
    v14: overrides.v14Path || process.env.CONTENT_V14_PATH || DEFAULT_PATHS.v14,
    hainan: overrides.hainanPath || process.env.CONTENT_HAINAN_PATH || DEFAULT_PATHS.hainan,
    stories: overrides.storiesPath || process.env.CONTENT_STORIES_PATH || DEFAULT_PATHS.stories,
  };

  const v14 = parseV14(readRequired(paths.v14, 'V1.4 主稿'), {
    sourcePath: relative(paths.v14),
  });
  const hainan = parseHainan(JSON.parse(readRequired(paths.hainan, '海南 115 地点')), {
    sourcePath: relative(paths.hainan),
  });
  const stories = loadStories(paths.stories, { sourcePath: relative(paths.stories) });

  const docs = [...v14, ...hainan, ...stories].map((doc) => ({
    ...doc,
    tokens: tokenize(
      [doc.title, doc.title, doc.titleEn, doc.titleEn, doc.title, doc.titleEn, doc.text]
        .filter(Boolean)
        .join(' '),
    ),
  }));

  return {
    docs,
    index: buildIndex(docs),
    counts: {
      software: v14.length,
      hainan: hainan.length,
      stories: stories.length,
    },
    paths: {
      v14: relative(paths.v14),
      hainan: relative(paths.hainan),
      stories: relative(paths.stories),
    },
  };
}
