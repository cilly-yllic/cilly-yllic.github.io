---
title: 'Parent-Child Query Performance Pitfalls'
description: 'OpenSearch の has_parent / has_child は便利に見えるが、ある規模を超えると書き込みのたびに global ordinals 再構築のコストを払うことになる。'
category: 'search-opensearch'
publishedAt: 2026-05-27
---

OpenSearch (Elasticsearch) の join field は、`has_parent` / `has_child` を使うと「親子関係のあるドキュメントを跨いだ検索」が書けるという、非常に魅力的な機能だ。ところがある規模を超えると、書き込みのたびにクラスタが詰まる。原因は global ordinals の再構築コストにある。

## global ordinals とは

集約 (terms aggregation や join) のために、各シャードで保持されているフィールド値の辞書 (segment ordinals) を、シャード単位でグローバルに整列したものが global ordinals だ。Parent-Child query では、親 ID を引くためにこれが使われる。

問題は **書き込みが入ると global ordinals が無効化される** こと。書き込みが多いインデックスでは、検索のたびに ordinals を再構築するか、あるいは事前にプリウォームしておく必要がある。プリウォーム自体も書き込みごとに走るので、書き込みヘビーなワークロードでは恒常的に CPU が削られていく。

```text
[write] → [refresh] → invalidate ordinals
[search] → rebuild global ordinals (slow!)
```

## 何が起こるか

特に hot index (直近のデータが集中するインデックス) で発生しやすい。書き込みが秒間数十程度を越えてくると、99th percentile レイテンシが安定しなくなる。CPU はピン留めされ、indexing スループットも落ちる。

## 取れる選択肢

1. **Parent-Child を諦め、ドキュメントをフラット化する**
   検索面ではこれが最も筋がいい。書き込み時点で親情報をコピーして子に埋め込み、検索は単一のドキュメント単位に閉じる。
2. **Nested に置き換える**
   親と子のスキーマが固定で、子の数が少ない場合に有効。書き込みが「親丸ごとの再 index」になる点に注意。
3. **インデックスを分ける**
   親と子を別インデックスに置き、検索は 2 段クエリにする。シンプルだが、フロント側のロジックは複雑になる。

## 結論

「親子関係をスキーマ上の概念として表現したい」気持ちと「検索クエリで横断したい」気持ちは、分けて考えたほうが良い。スキーマは join で表現されていても、**検索面ではフラット化する** のがほぼ常に正解だ。
