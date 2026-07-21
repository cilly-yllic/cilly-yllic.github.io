// サイト全体の言語 (ja / en) の判定・パス変換ユーティリティ。
//
// URL 設計: 日本語が正 (プレフィックスなし)、英語は /en/ プレフィックス。
//   ja: /notes/firebase-gcp/foo/
//   en: /en/notes/firebase-gcp/foo/
// 言語の切り替えはヘッダーのプルダウンで行い、選択は localStorage('locale') に
// 保存して次回以降のページ表示でも引き継ぐ (BaseLayout の inline script 参照)。

export const LOCALES = ['ja', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ja';

/** URL パスから言語を判定する。/en/ 配下なら en、それ以外は ja。 */
export function getLocaleFromPath(pathname: string): Locale {
  return pathname === '/en' || pathname.startsWith('/en/') ? 'en' : 'ja';
}

/** ja 基準のパス (例: '/notes/') を指定言語のパスに変換する。 */
export function localePath(locale: Locale, jaPath: string): string {
  if (locale === 'ja') return jaPath;
  return jaPath === '/' ? '/en/' : `/en${jaPath}`;
}

/** パスから /en プレフィックスを除いた ja 基準のパスを返す。 */
export function stripLocale(pathname: string): string {
  if (pathname === '/en' || pathname === '/en/') return '/';
  return pathname.startsWith('/en/') ? pathname.slice(3) : pathname;
}

/** 反対言語での同一ページのパスを返す (ページが存在するかは呼び出し側の責務)。 */
export function altPath(pathname: string): string {
  const locale = getLocaleFromPath(pathname);
  return locale === 'ja' ? localePath('en', pathname) : stripLocale(pathname);
}
