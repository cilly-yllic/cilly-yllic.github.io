// devto/articles/*.md を dev.to へ同期するスクリプト (CI から実行)。
//
// - 各ファイルの front matter 内 canonical_url をキーに、dev.to 上の既存記事と突き合わせる
//   (状態ファイル不要・再実行しても重複投稿にならない)
// - 既存があれば PUT で更新、無ければ POST で作成
// - body_markdown にファイル全文 (front matter 込み) を渡す。dev.to 側が front matter を解釈する
// - dev.to API のレート制限 (429) は待って再試行する
//
// 使い方:
//   DEV_TO_API_KEY=xxx node scripts/devto-publish.mjs           # 同期
//   node scripts/devto-publish.mjs --dry-run                    # API を呼ばず計画のみ表示
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const API = 'https://dev.to/api';
const DIR = 'devto/articles';
const DRY_RUN = process.argv.includes('--dry-run');
const API_KEY = process.env.DEV_TO_API_KEY;

if (!DRY_RUN && !API_KEY) {
  console.error('DEV_TO_API_KEY is not set');
  process.exit(1);
}

const canonicalOf = (markdown) => {
  const fm = markdown.match(/^---\n([\s\S]*?)\n---/);
  const line = fm?.[1].split('\n').find((l) => l.startsWith('canonical_url:'));
  return line?.slice('canonical_url:'.length).trim();
};

const titleOf = (markdown) => {
  const fm = markdown.match(/^---\n([\s\S]*?)\n---/);
  const line = fm?.[1].split('\n').find((l) => l.startsWith('title:'));
  return line
    ?.slice('title:'.length)
    .trim()
    .replace(/^["']|["']$/g, '');
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const request = async (method, path, body) => {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.forem.api-v1+json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      const wait = 30_000 * attempt;
      console.log(`  rate limited (429). waiting ${wait / 1000}s...`);
      await sleep(wait);
      continue;
    }
    return res;
  }
  throw new Error(`still rate limited after retries: ${method} ${path}`);
};

// 既存記事の canonical_url → { id, body } の対応表 (下書きも含むので /articles/me/all を使う)
// body_markdown は投稿した原文がそのまま返るので、変更なしの判定にも使う
const fetchExisting = async () => {
  const map = new Map();
  for (let page = 1; page <= 10; page++) {
    const res = await request('GET', `/articles/me/all?per_page=100&page=${page}`);
    if (!res.ok) throw new Error(`failed to list articles: ${res.status} ${await res.text()}`);
    const articles = await res.json();
    for (const a of articles) {
      if (a.canonical_url) map.set(a.canonical_url, { id: a.id, body: a.body_markdown ?? '' });
    }
    if (articles.length < 100) break;
  }
  return map;
};

const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.md'))
  .sort();
if (files.length === 0) {
  console.log('no articles under devto/articles/. nothing to do.');
  process.exit(0);
}

const existing = DRY_RUN ? new Map() : await fetchExisting();
let failed = 0;

for (const file of files) {
  const markdown = readFileSync(join(DIR, file), 'utf8');
  const canonical = canonicalOf(markdown);
  const title = titleOf(markdown) ?? file;
  if (!canonical) {
    console.error(`✖ ${file}: canonical_url がありません`);
    failed++;
    continue;
  }

  const found = existing.get(canonical);
  const action = found ? `update (id: ${found.id})` : 'create';
  if (DRY_RUN) {
    console.log(`[dry-run] ${action}: ${title} (${canonical})`);
    continue;
  }

  // 内容が dev.to 上の原文と同一なら何もしない (編集日時を無駄に動かさない)
  if (found && found.body.trim() === markdown.trim()) {
    console.log(`- skip (unchanged): ${title}`);
    continue;
  }

  const res = found
    ? await request('PUT', `/articles/${found.id}`, { article: { body_markdown: markdown } })
    : await request('POST', '/articles', { article: { body_markdown: markdown } });

  if (res.ok) {
    const data = await res.json();
    console.log(`✔ ${action}: ${title} → ${data.url ?? ''}`);
  } else {
    console.error(`✖ ${action} failed: ${title} (${res.status}) ${await res.text()}`);
    failed++;
  }

  // 記事作成の連投を避ける (dev.to はアカウント新規時の連続投稿に敏感)
  await sleep(3000);
}

if (failed > 0) {
  console.error(`${failed} 件失敗しました`);
  process.exit(1);
}
console.log('done.');
