/**
 * BREX の所在を解決する。
 *
 * 利用者は BREX を次のどれかで指定できる。
 * - ファイルのパス（`.xml`）
 * - DMC（`DMC-` 付きでも無しでも）。環境変数とツール引数のフォルダーから探す
 * - 省略。配布物の既定 BREX（`DMC-S1000D-*-04-10-0301-00A-022A-D`）を使う
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import {
  createDirectoryBrexResolver,
  isBrexDmc,
  listDataModules,
  parseDmc,
  readBrex,
  sameDmc,
  type BrexDocument,
  type BrexResolver,
} from '@shuji-bonji/s1000d-core';
import { csdbDirs, specDir } from '../config.js';

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
export function findDefaultBrex(
  options: LocatorOptions = {},
): { path: string; brex: BrexDocument } | undefined {
  const spec = specDir();
  if (!spec || !existsSync(spec)) return undefined;
  const entries = listDataModules([spec]).filter(
    (e) =>
      e.name.dmCode.modelIdentCode === 'S1000D' &&
      e.name.dmCode.systemCode === '04' &&
      e.name.dmCode.subSystemCode === '1' &&
      e.name.dmCode.subSubSystemCode === '0' &&
      e.name.dmCode.assyCode === '0301' &&
      isBrexDmc(e.name.dmCode) &&
      e.name.issueInfo !== undefined,
  );
  void options;
  // 配布物のデータ辞書には、ファイル名と中身の DMC が一致しない見本がある。
  // 中身の DMC がファイル名と一致し、自分自身を参照しているもの（既定 BREX の性質）を優先する
  let fallback: { path: string; brex: BrexDocument } | undefined;
  for (const e of entries) {
    const r = readBrex(readFileSync(e.path, 'utf8'));
    if (!r.ok) continue;
    const consistent = sameDmc(r.value.dmCode, e.name.dmCode);
    const selfRef =
      r.value.brexDmRef !== undefined && sameDmc(r.value.brexDmRef.dmCode, r.value.dmCode);
    if (consistent && selfRef) return { path: e.path, brex: r.value };
    fallback ??= { path: e.path, brex: r.value };
  }
  return fallback;
}

export interface LocatedBrex {
  brex: BrexDocument;
  /** どう見つけたか */
  source: 'file' | 'dmc' | 'default';
  path?: string;
}

export async function locateBrex(
  spec: string | undefined,
  options: LocatorOptions = {},
): Promise<LocatedBrex> {
  if (spec === undefined || spec.trim() === '') {
    const d = findDefaultBrex(options);
    if (!d) {
      throw new Error(
        `No BREX specified and no default BREX found. Set ${'S1000D_SPEC_DIR'} to the folder where the S1000D distribution (containing the default BREX) is extracted, or pass "brex" as a file path or DMC.`,
      );
    }
    return { brex: d.brex, source: 'default', path: d.path };
  }
  const trimmed = spec.trim();
  if (/\.xml$/i.test(trimmed) || existsSync(trimmed)) {
    if (!existsSync(trimmed)) throw new Error(`BREX file not found: ${trimmed}`);
    const r = readBrex(readFileSync(trimmed, 'utf8'));
    if (!r.ok) throw new Error(`Not a BREX data module (${trimmed}): ${r.error}`);
    return { brex: r.value, source: 'file', path: trimmed };
  }
  const dmc = parseDmc(trimmed);
  if (!dmc.ok) throw new Error(`"brex" must be a file path or a DMC: ${dmc.error}`);
  const brex = await makeResolver(options)({ dmCode: dmc.value });
  if (!brex) {
    throw new Error(
      `BREX ${trimmed} was not found in: ${searchDirs(options).join(', ') || '(no folders configured)'}. Pass "csdbDirs" or set S1000D_CSDB_DIR / S1000D_SPEC_DIR.`,
    );
  }
  return { brex, source: 'dmc' };
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
