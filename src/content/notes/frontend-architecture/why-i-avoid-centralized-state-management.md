---
title: '中央集権的な状態管理を避ける理由'
description: 'Vuex / Pinia / Redux のような store パターンが、SPA の規模に対して構造的に過剰になりやすい理由。'
category: 'frontend-architecture'
publishedAt: 2026-05-27
---

ここでいう「中央集権的な状態管理」とは、Vuex / Pinia / Redux のような、ある単一の store にアプリケーション全体の状態を集めて、コンポーネントはそれを参照・変更するという設計のことだ。多くのプロジェクトで採用されているし、わたしも昔はそうしていた。今は、最初の選択肢として採るのをやめている。

## 構造的に何が過剰か

store パターンが解決したい問題は「離れた 2 つのコンポーネントが、同じデータを見たい」だ。けれど、ほとんどの SPA で実際に「離れた 2 つのコンポーネントが同じデータを見たい」ケースは、思っているほど多くない。実装してみると、`store` は事実上「巨大なバッグ」になり、最終的にはほぼ全 state がそこに集まる。

集まると何が起こるか。

- **テストが書きにくくなる**: コンポーネントの単体テストが store を要求するようになる
- **依存方向が逆転する**: コンポーネントが store の形に縛られ、コンポーネントを動かすたびに store を直す
- **責務がぼやける**: 「これは store の責務か、コンポーネントの責務か」の判断がブレ続ける

## わたしが採るパターン

Vue では `provide` / `inject`、React では Context + Custom Hook。データの所有者をできるだけ近くのコンポーネントに置き、`provide` の階層構造で「どのスコープがどのデータを持つか」を表す。

```ts
// Vue
const TaskTreeKey = Symbol() as InjectionKey<TaskTreeState>;

export const TaskTreeProvider = defineComponent({
  setup(_, { slots }) {
    const state = useTaskTree();
    provide(TaskTreeKey, state);
    return () => slots.default?.();
  },
});

export const useTaskTreeState = () => {
  const state = inject(TaskTreeKey);
  if (!state) throw new Error('Use inside <TaskTreeProvider>');
  return state;
};
```

スコープが明示的なので、テストも `Provider` でラップするだけで済む。状態は階層と一致し、ファイルツリーを読めば「どのデータがどこで生まれるか」が分かる。

## 例外

「複数のページにまたがって永続化する設定 (現在の workspace、テーマ等)」のような、構造的に "アプリ全体のもの" であるデータは、中央集権で持っていい。問題は「最初から全部 store に入れる」ことであって、「全部 store に入れない」ことではない。

## 結論

中央集権的な状態管理は、本当に必要になったタイミングで導入すれば間に合う。コンポーネントの近くにデータを置く設計は、後から store に寄せるのは簡単で、その逆は難しい。
