---
name: devto-article
description: src/content/notes-en/ の英語記事をもとに dev.to 投稿用ファイル (devto/articles/<slug>.md) を生成・更新する。引数に記事の slug（例 config-driven-gcp-firebase-provisioning）または「all」を受け取る。
---

# dev.to 投稿用記事の生成

`src/content/notes-en/<category>/<slug>.md` を変換して `devto/articles/<slug>.md` を作る。
生成したファイルは main へのマージ時に `.github/workflows/devto.yml` が dev.to API へ同期する
（canonical_url で既存記事と突き合わせるため、再実行しても重複投稿にはならない）。

## 手順

1. 引数の slug から元記事 `src/content/notes-en/**/<slug>.md` を特定する（「all」なら全記事）。
2. 下記の変換ルールで `devto/articles/<slug>.md` を書き出す。
3. 生成後、frontmatter とリンク・画像が絶対 URL になっていることを確認して報告する。

## 変換ルール

### frontmatter

dev.to の front matter 形式に変換する:

```yaml
---
title: "<元記事の title をそのまま>"
published: false   # 既定は draft。公開は人が確認してから true に変える
description: "<元記事の description を 140 字程度に収める (長ければ要約)>"
tags: tag1, tag2, tag3, tag4
canonical_url: https://cilly-yllic.github.io/en/notes/<category>/<slug>/
---
```

- **tags は最大 4 つ、半角英数字のみ**（ハイフン・アンダースコア不可）。dev.to に実在する
  人気タグを優先する（例: firebase, gcp, terraform, typescript, ai, architecture,
  cloudflare, githubactions, devops, monorepo, database, security, codegen, graphql）。
- `published: false` を既定とする。ユーザーから公開指示があった場合のみ `true`。
- cover_image は指定しない（記事内の最初の図がプレビューに使われるのに任せる）。

### 本文

元記事の本文をベースに、次の置換を行う:

1. **画像を絶対 URL に**: `/images/foo.png` → `https://cilly-yllic.github.io/images/foo.png`
2. **SVG は PNG に差し替え**: dev.to の画像プロキシは SVG を表示できないことがあるため、
   `/images/*-en.svg` は同名の `.png` を参照する（無ければ `rsvg-convert -w 1600 -b white in.svg -o out.png`
   で `public/images/` に生成してコミットする）。
3. **サイト内リンクを絶対 URL に**: `(/en/notes/...)` や `(/notes/...)` →
   `(https://cilly-yllic.github.io/en/notes/...)` のように絶対化する。
4. **画像キャプション**: 画像直下の `*caption*` 行はそのまま残してよい（dev.to では
   イタリック段落として表示される）。
5. **末尾にフッターを追加**:

   ```markdown
   ---

   *Originally published at [cilly-yllic.github.io](<canonical_url と同じ URL>).*
   ```

### してはいけないこと

- 本文の文章自体の書き換え・要約（変換は上記の機械的な置換のみ）
- `devto/sync 対象外の記事` の生成（元記事が `draft: true` のものはスキップ）

## 公開フロー（参考）

1. このスキルでファイル生成 → PR → main マージで dev.to に **draft** として同期される
2. dev.to のダッシュボードで見た目を確認
3. 問題なければ `published: true` に変えて再度 main へマージ（同期スクリプトが更新をかける）
