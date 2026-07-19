---
title: 'contract.yml 一枚から Firebase 全レイヤーの型を生成する'
description: 'Data Connect・Firestore・Zod・API DTO で同じモデルを多重管理する drift を、YAML 契約を single source of truth にしたコード生成で構造的に消す設計。'
category: 'firebase-gcp'
publishedAt: 2026-07-19
---

Cloud SQL (Data Connect) を SoT、Firestore を読み取り投影面とする構成（[Firestore を Public Cache として扱う](/notes/firebase-gcp/firestore-as-public-cache)）は、データの整合性の問題をうまく解決してくれます。ただ、この構成には型定義の側にも代償があります。**同じモデルが、レイヤーごとに別の表現で何度も書かれる** のです。

## 同じモデルが 6 回書かれる

`Product` というモデルを 1 つ足すと、手書きするファイルはこれだけあります。

- Data Connect の GraphQL スキーマ（`type Product @table(...)`）
- 共有 TypeScript 型（`interface Product`）
- Zod スキーマ（`ProductSchema`）
- Firestore 投影のスキーマ（relation は id に解決済み、`timestamp` は `Date`、`_meta_` 付き）
- API の request / response 型と、そのバリデーション Zod
- NestJS の class-validator DTO

どれも「同じもの」の別表現ですが、相互に検証する仕組みはありません。フィールドを 1 つ足すたびに 5〜6 ファイルを渡り歩き、どれか 1 つを忘れても、壊れるのはずっと後 — 実行時です。手順に気をつけて防ぐ類いの問題ではなく、多重管理という構造そのものが原因です。

## 契約を書いて、残りは全部生成する

そこで、**モデル定義を YAML の契約ファイルに一本化し、すべての表現をそこから生成する** ツールを作りました。[firebase-contract](https://github.com/cilly-yllic/my-packages/blob/main/packages/firebase-contract/README.md) です。

![contract.yml を single source of truth に、コンパイラを経て各レイヤーのコードを生成するアーキテクチャ図](/images/contract-driven-firebase-codegen-architecture.png)

*契約 → コンパイラ (IR) → 生成物の一方向。生成物と契約の drift は CI の `--check` が検出します。*

```yaml
# contract.yml (抜粋)
models:
  Product:
    key: [catalog, productNo]
    fields:
      catalog: { type: Catalog, relation: true }
      productNo: int
      title: { type: string, nonempty: true, maxLength: 200 }
      status: ProductStatus
      metadata: { type: ProductMetadata, optional: true }
      createdAt: timestamp

generators:
  - { generator: typescript, out: '#contracts', split: true }
  - { generator: zod, out: '#contracts', split: true }
  - { generator: data-connect-graphql, out: src, split: true }
  - { generator: firestore, out: '#contracts', split: true }
```

`fbc generate` の一回で、TS 型・Zod・GraphQL スキーマ・Firestore 投影がすべて出力されます。`title` の `nonempty: true, maxLength: 200` のような制約は、Zod にも API バリデーションにも DTO の class-validator にも同じように流れます。「バリデーションだけ古い」が起きません。

契約は `imports` で分割でき、複数アプリのモノレポでもリポジトリ構成に沿って yml を置けます。実際に導入したプロジェクトでは、ルートの契約から 2 アプリ・9 ファイルの yml に分割し、そこから 30 個超のファイルを生成しています。

## Firestore は「別のスキーマ」ではなく「投影」

このツールで一番効いているのがここです。Firestore を読み取り投影面として使うと、そのスキーマは Data Connect と **同じではないが、無関係でもない** という微妙な位置に立ちます。relation は解決済みの文字列 id になり、`timestamp` は `Date` になり、非正規化フィールドが足され、`_meta_` の整合性エンベロープが付く。手書きだと、この「規則的な変換 + 少しの追加」を丸ごと書き写すことになります。

契約では、投影を Data Connect モデルからの **派生** として宣言します。

```yaml
firestore:
  Product:
    from: Product
    collection: shops/{ws}/.../products/{productNo}
    omit: [catalog, log]
    fields:
      linkedCatalogTitle: { type: string, optional: true }
```

relation → id、timestamp → `z.date()`、`_meta_` の付与といった投影の規則は generator が一律に適用し、`pick` / `omit` と追加 `fields` だけを人が書きます。生成された Zod スキーマは、Data Connect 側とチェーンが同一のフィールドを `.pick()` で再利用するので、「表現が変わる部分」だけがファイル上に現れます。差分がそのまま設計の意図として読めます。

## Data Connect の Any 境界

Data Connect は埋め込みオブジェクトや JSON を `Any` スカラーとして保存し、論理型を消してしまいます。手書き運用だと `metadata` が「本当は何の型か」はコメントと記憶に頼ることになります。契約からの生成では、GraphQL 側に論理型をコメントとして残しつつ（`metadata: Any # logical: ProductMetadata`）、`Any` の行と論理型を相互変換する型付きアダプタも一緒に生成します。型が消える境界がどこかを、契約が知っているからできることです。

## 効いている設計判断

**Generator は YAML を見ません。** パースと import 解決を経て正規化された IR (中間表現) だけを入力にします。バリデーションも IR に対する独立したルール関数群です。generator を 1 つ足すのに既存コードの変更が要らず、OpenAPI 出力のような拡張も registry への登録だけで済みます。

**手書きファイルの byte-for-byte 再現に投資しました。** 導入対象は既に動いているプロダクトで、生成物が既存の手書きファイルと 1 バイトでも違えば diff に埋もれて検証できません。フォーマットの揺れを吸収する style オプションや `raw` エスケープハッチは、この「既存ファイルを完全一致で再現してから置き換える」という漸進的な移行のためにあります。おかげで移行は一括の書き換えではなく、ファイル単位で「生成に寄せては diff ゼロを確認する」の繰り返しにできました。

**再生成は冪等です。** 内容が変わらない限り、生成日時を含めてファイルは byte-for-byte で同じに保たれます（`generatedAt` は初回生成から引き継がれ、内容が変わったときだけ `updatedAt` が動く）。CI の `--check` で「契約とコードの drift」を機械的に検出できるのは、この冪等性があるからです。

## 代償

DSL は増えた複雑さそのものです。フィールドオプションや操作の表現力には天井があり、天井に当たるたびに generator を育てるか `raw` で逃げるかを選ぶことになります。生成コードのデバッグも 1 段間接的になります。

本来なら「チームが YAML DSL を新たに覚える」という学習コストも代償に数えるところですが、ここは AI で相殺できています。コーディングエージェントに DSL のルールとプロダクトの仕様を読み込ませておけば、「Product に在庫数フィールドを足したい」という指示から契約 yml の修正までは AI がやってくれます。宣言的な契約はモデル定義が一箇所に集まっていて差分も小さいので、AI にとっても扱いやすい対象です。出力がおかしければ `fbc generate` の diff に現れるので、検証も機械的に済みます。人が覚えるのは DSL の文法ではなく「契約を読んで意図を確認する」ことだけになりました。

それでも、フィールドを 1 つ足す作業が「契約に 1 行足して `fbc generate`」に収束した価値は大きいです。多重管理の drift は「気をつける対象」から「CI が検出する対象」に変わりました。型の整合性を人の注意力から仕組みへ移すと、レビューの関心事も個々の型定義の写経チェックから、契約そのものの設計へと移っていきます。

## 公開先

npm パッケージとして公開しています。現時点ではまだ RC 版で、DSL の表現力や generator の細部にはブラッシュアップの余地があります。実プロジェクトでの運用からのフィードバックを反映しながら改善を続け、正式バージョンのリリースを目指しています。

- npm — [npmjs.com/package/firebase-contract](https://www.npmjs.com/package/firebase-contract)
- README — [github.com/cilly-yllic/my-packages](https://github.com/cilly-yllic/my-packages/blob/main/packages/firebase-contract/README.md)
