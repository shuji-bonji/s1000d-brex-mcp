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
import { ToolInputError, type ToolErrorCode } from '../errors.js';

export type { LocatedBrex };

export interface LocatorOptions {
  /** ツール引数の csdbDirs */
  extraDirs?: string[];
}

const isDir = (d: string) => existsSync(d) && statSync(d).isDirectory();

/**
 * CSDB として指定されたフォルダーの並び。ツール引数の `csdbDirs` を渡したときはそれだけを使い、
 * 設定（S1000D_CSDB_DIR・設定ファイルの csdbDirs）は使わない。渡さないときは設定を使う
 */
function requestedCsdbDirs(options: LocatorOptions): string[] {
  return options.extraDirs !== undefined && options.extraDirs.length > 0
    ? options.extraDirs
    : csdbDirs();
}

/** 検索対象のフォルダー（ツール引数の csdbDirs があればそれ、無ければ設定の CSDB。最後に配布物） */
export function searchDirs(options: LocatorOptions = {}): string[] {
  const dirs = [...requestedCsdbDirs(options)];
  const spec = specDir();
  if (spec) dirs.push(spec);
  return [...new Set(dirs.filter(isDir))];
}

/** 使わなかったフォルダー（存在しない、またはフォルダーでない）の注記。無ければ空 */
export function missingCsdbDirsNotes(options: LocatorOptions = {}): string[] {
  const missing = [...new Set(requestedCsdbDirs(options).filter((d) => !isDir(d)))];
  if (missing.length === 0) return [];
  const from =
    options.extraDirs !== undefined && options.extraDirs.length > 0
      ? 'the csdbDirs argument'
      : `${ENV.csdbDirs} / the config file`;
  return [
    `These CSDB folders from ${from} do not exist or are not folders, and were not searched: ${missing.join(', ')}`,
  ];
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
    if (e instanceof BrexLocateError) {
      const code: ToolErrorCode =
        e.reason === 'file-not-found'
          ? 'file-not-found'
          : e.reason === 'default-not-found' || e.reason === 'dmc-not-found'
            ? 'not-found'
            : 'input-error';
      throw new ToolInputError(code, '/brex', hint(e, options));
    }
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
      throw new ToolInputError('input-error', '/xml', `Inline XML exceeds ${maxBytes} bytes`);
    return input.xml;
  }
  if (input.path !== undefined && input.path.trim() !== '') {
    if (!existsSync(input.path))
      throw new ToolInputError(
        'file-not-found',
        '/path',
        `Data module file not found: ${input.path}`,
      );
    return readFileSync(input.path, 'utf8');
  }
  throw new ToolInputError(
    'input-error',
    '/path',
    'Either "path" or "xml" of the data module is required',
  );
}
