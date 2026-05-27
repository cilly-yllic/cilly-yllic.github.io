---
title: 'Firestore を Public Cache として扱う'
description: 'Cloud SQL を SoT、Firestore を読み取り投影面と位置づけたときに見えてくる設計上の利点と、その代償。'
category: 'firebase-gcp'
publishedAt: 2026-05-27
---

Firestore を「アプリの主データベース」として使う設計は、最初は楽だ。書き込みと読み取りが同じ場所で完結し、`onSnapshot` で realtime push もそのまま手に入る。一方で、サービスが育つにつれて、Firestore を SoT (source of truth) のままにしておくと、いくつかの致命的な制約が顔を出す。

## SoT のままだと困る場面

トランザクション境界の弱さ、複雑なクエリの不足、コスト構造、移行のしづらさ。なかでも厳しいのは「関連の更新を `WHERE` で絞れない」ことだ。「ある条件を満たすドキュメント群を、まとめて整合的に更新する」というユースケースで、Firestore は構造的に弱い。

## Public Cache としての再定義

Task Tree では、Cloud SQL を SoT、Firestore を「読み取りに最適化された投影面」として扱う構成にした。書き込みは必ず Data Connect 経由で Cloud SQL に向かい、Firestore は後段の Reconciliation Worker からのみ書き込まれる。クライアントから見ると Firestore は **再生成可能なキャッシュ** であり、最悪の場合 SQL から rebuild できる。

```ts
// クライアントは Firestore に直接書かない
await dataConnect.mutation.updateTask({ id, title });

// 反映は Firestore の onSnapshot で押し返される
unsubscribe = onSnapshot(taskRef, (snap) => render(snap.data()));
```

## 利点と代償

利点は明らかだ。データモデルの自由度、整合性検査のしやすさ、外部システム (OpenSearch / BigQuery 等) との一貫した同期。

代償は、書き込み → 反映までのレイテンシが上がることと、Reconciliation 経路の運用コストだ。書き込み直後のクライアントは、自分の変更を Firestore で見るまで「自分が変えた値」を保持しておく必要がある。これは UI レイヤの責務として明示する。

## どちらを取るか

「Firestore を SoT」と「Firestore を Cache」の選択は、サービスの寿命の長さで決まる。短命なプロトタイプなら前者、長く育てる予定なら後者。中間にいるとき、後で寄せ替えるコストは、最初から Cache として扱うコストよりずっと高い。
