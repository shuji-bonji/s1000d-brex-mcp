/**
 * 利用者が入手した S1000D の配布物を使うテスト。`S1000D_SPEC_TESTS=1` のときだけ動く。
 * 配布物の場所は `S1000D_SPEC_DIR`（既定: ../../specs/s1000d/issue-7）。
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toolHandlers } from './tools/handlers.js';

const enabled = process.env.S1000D_SPEC_TESTS === '1';
const specDir = resolve(process.env.S1000D_SPEC_DIR ?? '../../specs/s1000d/issue-7');

function findDir(root: string, name: RegExp): string | undefined {
  if (!existsSync(root)) return undefined;
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const p = join(root, e.name);
    if (name.test(e.name)) return p;
    const inner = findDir(p, name);
    if (inner) return inner;
  }
  return undefined;
}

describe.skipIf(!enabled || !existsSync(specDir))('配布物（既定 BREX と Bike Samples）', () => {
  let saved: string | undefined;
  beforeAll(() => {
    saved = process.env.S1000D_SPEC_DIR;
    process.env.S1000D_SPEC_DIR = specDir;
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.S1000D_SPEC_DIR;
    else process.env.S1000D_SPEC_DIR = saved;
  });

  it('explain_brex は BREX を省略すると既定 BREX を読む', async () => {
    const r = (await toolHandlers.explain_brex({ kind: 'structure', limit: 5 })) as {
      source: string;
      brex: { dmc: string; parentBrex: string; counts: { structure: number } };
      total: number;
      rules: { summary: string }[];
    };
    expect(r.source).toBe('default');
    expect(r.brex.dmc).toMatch(/^S1000D-[A-Z]-04-10-0301-00A-022A-D$/);
    expect(r.brex.parentBrex).toBe('self');
    expect(r.brex.counts.structure).toBeGreaterThan(200);
    expect(r.total).toBe(r.brex.counts.structure);
    expect(r.rules).toHaveLength(5);
  });

  it('lookup_value で既定 BREX の securityClassification の意味を引ける', async () => {
    const r = (await toolHandlers.lookup_value({
      target: 'securityClassification',
      value: '01',
    })) as {
      matches: { valueCheck: { allowed: boolean | null; meaning: string[] } }[];
    };
    expect(r.matches.length).toBeGreaterThan(0);
    expect(r.matches.some((m) => m.valueCheck.allowed === true)).toBe(true);
  });

  it('check_against_brex は Bike Samples のデータモジュールを 2 層（自転車 BREX → 既定 BREX）で照合する', async () => {
    const bike = findDir(specDir, /Bike Samples/);
    expect(bike).toBeDefined();
    const files = readdirSync(bike!).filter((f) => /^DMC-S1000DBIKE-.*-041A-A_.*\.XML$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    const r = (await toolHandlers.check_against_brex({
      path: join(bike!, files[0]),
      csdbDirs: [bike!],
    })) as {
      unresolvedBrex: string[];
      layers: { brex: string; evaluatedRules: number; skipped: unknown[] }[];
    };
    expect(r.unresolvedBrex).toEqual([]);
    expect(r.layers.map((l) => l.brex)).toEqual([
      'S1000DBIKE-AAA-D00-00-00-00AA-022A-D',
      expect.stringMatching(/^S1000D-[A-Z]-04-10-0301-00A-022A-D$/),
    ]);
    expect(r.layers.every((l) => l.skipped.length === 0)).toBe(true);
    expect(r.layers[1].evaluatedRules).toBeGreaterThan(200);
  });
});
