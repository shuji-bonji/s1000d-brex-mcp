/**
 * 設定。環境変数とパッケージ情報をここに集める。
 */
import { createRequire } from 'node:module';
import { delimiter } from 'node:path';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { name: string; version: string };

export const PACKAGE_INFO = {
  name: packageJson.name,
  version: packageJson.version,
} as const;

/** 環境変数の名前 */
export const ENV = {
  /** 利用者が入手した S1000D の配布物を展開したフォルダー。既定 BREX をここから探す */
  specDir: 'S1000D_SPEC_DIR',
  /** プロジェクトの CSDB（データモジュールが置かれたフォルダー）。区切り文字で複数指定できる */
  csdbDirs: 'S1000D_CSDB_DIR',
} as const;

export function specDir(): string | undefined {
  const v = process.env[ENV.specDir]?.trim();
  return v ? v : undefined;
}

export function csdbDirs(): string[] {
  const v = process.env[ENV.csdbDirs];
  if (!v) return [];
  return v
    .split(delimiter)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** 応答の大きさの上限 */
export const LIMITS = {
  /** explain_brex が 1 回で返すルールの既定数 */
  defaultRuleLimit: 50,
  maxRuleLimit: 500,
  /** check_against_brex が 1 層あたりに返す違反の上限 */
  maxViolationsPerLayer: 200,
  /** XML 文字列を直接渡すときの上限（バイト） */
  maxInlineXmlBytes: 5 * 1024 * 1024,
} as const;
