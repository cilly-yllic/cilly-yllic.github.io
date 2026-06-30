/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_GA_MEASUREMENT_ID?: string;
}

// ビルド時のみ参照する（クライアントへは出力しない）GitHub トークン用。
// @types/node を入れずに process.env を型安全に使うための最小宣言。
declare const process: {
  readonly env: Record<string, string | undefined>;
};

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// gtag.js globals for future custom event tracking.
interface Window {
  dataLayer: unknown[];
  gtag: (...args: unknown[]) => void;
}
