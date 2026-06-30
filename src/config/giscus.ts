// giscus（GitHub Discussions ベースのコメント機能）の一元設定。
//
// 値はあとから差し替える前提のプレースホルダー。コード側で参照するのはこの
// ファイルだけにして、リポジトリ移行やカテゴリ変更が 1 箇所で済むようにする。
// giscus.app で発行した実値を下の定数に貼り替えればよい。

export type GiscusMapping = 'pathname' | 'url' | 'title' | 'og:title' | 'specific' | 'number';
export type GiscusInputPosition = 'top' | 'bottom';
/** giscus の data-* 属性は文字列の '0' / '1' を取る */
export type GiscusFlag = '0' | '1';

export interface GiscusConfig {
  /** "owner/repo" */
  repo: string;
  repoId: string;
  category: string;
  categoryId: string;
  mapping: GiscusMapping;
  /** タイトル完全一致を強制するか。term が一意なら不要なので '0' */
  strict: GiscusFlag;
  reactionsEnabled: GiscusFlag;
  emitMetadata: GiscusFlag;
  inputPosition: GiscusInputPosition;
  lang: string;
}

export const GISCUS_CONFIG: GiscusConfig = {
  repo: 'cilly-yllic/cilly-yllic.github.io',
  repoId: 'R_kgDOKAZ3rw',
  category: 'Announcements',
  categoryId: 'DIC_kwDOKAZ3r84DAMwW',
  // mapping は specific を採用（理由は Giscus.astro 上部のコメント参照）。
  mapping: 'specific',
  strict: '0',
  reactionsEnabled: '1',
  emitMetadata: '1',
  inputPosition: 'top',
  lang: 'ja',
};

export const GISCUS_ORIGIN = 'https://giscus.app';
export const GISCUS_SCRIPT_SRC = `${GISCUS_ORIGIN}/client.js`;

/**
 * 記事 (note.id = "<category>/<slug>") を Discussion の検索語(term)へ変換する。
 * note.id は URL を変えても不変なので、これを term に使うと URL 変更に強い。
 * mapping: 'specific' のとき giscus はこの term をそのまま Discussion タイトルにする。
 */
export function termForNote(noteId: string): string {
  return noteId;
}

/** プレースホルダーのままなら未設定とみなす（カウント取得やウィジェット描画をスキップ）。 */
export function isGiscusConfigured(config: GiscusConfig = GISCUS_CONFIG): boolean {
  return !config.repo.includes('YOUR_') && !config.repoId.includes('YOUR_');
}
