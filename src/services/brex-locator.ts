/**
 * BREX の所在を解決する。
 *
 * 探索そのもの（ファイルのパス・DMC・省略＝配布物の既定 BREX）は s1000d-core の `locateBrex` が行う
 * （0.2.0 で core に移した。s1000d-verify-mcp と同じ探索を共有するため）。
 * ここに残すのは、環境変数（S1000D_SPEC_DIR / S1000D_CSDB_DIR）の解釈と、見つからなかったときの案内文だけ。
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import {
  BrexLocateError,
  createDirectoryBrexResolver,
  findDefaultBrex as coreFindDefaultBrex,
  locateBrex as coreLocateBrex,
  type BrexDocument,
  type BrexResolver,
  type LocatedBrex,
} from '@shuji-bonji/s1000d-core';
import { ENV, csdbDirs, specDir, stackConfig } from '../config.js';

export type { LocatedBrex };

export interface LocatorOptions {
  /** ツール引数で追加されたフォルダー */
  extraDirs?: string[];
}

/** 検索対象のフォルダー（優先順: ツール引数 → CSDB 環境変数 → 配布物） */
export function searchDirs(options: LocatorOptions = {}): string[] {
  const dirs = [...(options.extraDirs ?? []), ...csdbDirs()];
  const spec = specDir();
  if (spec) dirs.push(spec);
  return [...new Set(dirs.filter((d) => existsSync(d) && statSync(d).isDirectory()))];
}

export function makeResolver(options: LocatorOptions = {}): BrexResolver {
  return createDirectoryBrexResolver(searchDirs(options));
}

/** 配布物の中の既定 BREX を探す。無ければ undefined。 */
export function findDefaultBrex(): { path: string; brex: BrexDocument } | undefined {
  const spec = specDir();
  if (!spec || !existsSync(spec)) return undefined;
  return coreFindDefaultBrex([spec]);
}

/** core の理由コードを、環境変数の設定方法を含む案内文にする */
function hint(e: BrexLocateError, options: LocatorOptions): string {
  switch (e.reason) {
    case 'default-not-found':
      return `No BREX specified and no S1000D default BREX found. Set ${ENV.specDir} to the folder where the S1000D distribution (containing the default BREX, DMC-S1000D-*-04-10-0301-00A-022A-D) is extracted, or pass "brex" as a file path or DMC.${specDir() ? '' : ` ${ENV.specDir} is not set and the config file ${stackConfig().configPath} has no specDir.`}`;
    case 'dmc-not-found':
      return `${e.message}. Pass "csdbDirs" or set ${ENV.csdbDirs} / ${ENV.specDir}. Searched: ${searchDirs(options).join(', ') || '(no folders configured)'}.`;
    case 'invalid-spec':
      return `"brex" must be a file path or a DMC: ${e.message}`;
    default:
      return e.message;
  }
}

export async function locateBrex(
  spec: string | undefined,
  options: LocatorOptions = {},
): Promise<LocatedBrex> {
  try {
    return await coreLocateBrex(spec, { dirs: searchDirs(options) });
  } catch (e) {
    if (e instanceof BrexLocateError) throw new Error(hint(e, options));
    throw e;
  }
}

/** データモジュールの入力（パスか XML 文字列）を XML 文字列にする。 */
export function loadDataModuleXml(
  input: { path?: string; xml?: string },
  maxBytes: number,
): string {
  if (input.xml !== undefined && input.xml.trim() !== '') {
    if (Buffer.byteLength(input.xml, 'utf8') > maxBytes)
      throw new Error(`Inline XML exceeds ${maxBytes} bytes`);
    return input.xml;
  }
  if (input.path !== undefined && input.path.trim() !== '') {
    if (!existsSync(input.path)) throw new Error(`Data module file not found: ${input.path}`);
    return readFileSync(input.path, 'utf8');
  }
  throw new Error('Either "path" or "xml" of the data module is required');
}
