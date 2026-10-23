/**
 * サーバを InMemoryTransport で叩き、ツール定義とハンドラの対応、各ツールの応答の形を確かめる。
 * テストデータは自作（券売機）。配布物は使わない。
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { buildServer } from './server.js';
import { tools } from './tools/definitions.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures');
const projectBrex = join(fixtures, 'DMC-KENBAIKI-A-00-00-00-00A-022A-D_001-00_JA-JP.XML');
const dm = join(fixtures, 'DMC-KENBAIKI-A-10-20-00-00A-040A-D_002-01_JA-JP.XML');

let client: Client;

async function call(name: string, args: Record<string, unknown>) {
  const res = await client.callTool({ name, arguments: args });
  const text =
    (res.content as { type: string; text: string }[]).find((c) => c.type === 'text')?.text ?? '{}';
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text }; // SDK の入力検証エラーは素の文字列で返る
  }
  return { isError: res.isError === true, data: data as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

beforeAll(async () => {
  delete process.env.S1000D_SPEC_DIR;
  delete process.env.S1000D_CSDB_DIR;
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildServer();
  await server.connect(serverTransport);
  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
});

describe('server', () => {
  it('instructions で「しないこと」を宣言している', () => {
    const text = client.getInstructions() ?? '';
    expect(text).toContain('does NOT');
    expect(text).toContain('XSD');
    expect(text).toContain('S1000D_SPEC_DIR');
  });

  it('定義したツールがすべて登録されている', async () => {
    const listed = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(listed).toEqual(tools.map((t) => t.name).sort());
  });

  it('未知の引数は拒否される', async () => {
    const r = await call('lookup_sns', { brex: projectBrex, systemCode: '10', bogus: 1 });
    expect(r.isError).toBe(true);
  });
});

describe('explain_brex', () => {
  it('ヘッダーとルールを返し、context と kind で絞れる', async () => {
    const all = await call('explain_brex', { brex: projectBrex });
    expect(all.isError).toBe(false);
    expect(all.data.brex.dmc).toBe('KENBAIKI-A-00-00-00-00A-022A-D');
    expect(all.data.brex.parentBrex).toBe('KBWORKS-A-00-00-00-00A-022A-D');
    expect(all.data.brex.counts).toMatchObject({
      structure: 7,
      notation: 3,
      nonContext: 1,
      snsSystems: 1,
    });
    expect(all.data.total).toBe(11);
    const r3 = all.data.rules.find((r: { ruleId: string }) => r.ruleId === 'KB-00003');
    expect(r3.summary).toContain('may be used; value must match one of 3 allowed values');
    expect(r3.values).toHaveLength(3);

    const descript = await call('explain_brex', {
      brex: projectBrex,
      kind: 'structure',
      context: 'descript',
    });
    expect(descript.data.total).toBe(6); // proced 文脈の 1 件が外れる
    const proced = await call('explain_brex', {
      brex: projectBrex,
      kind: 'structure',
      context: 'proced',
    });
    expect(proced.data.total).toBe(7);

    const paged = await call('explain_brex', { brex: projectBrex, limit: 4, offset: 4 });
    expect(paged.data.returned).toBe(4);
    expect(paged.data.nextOffset).toBe(8);

    const searched = await call('explain_brex', { brex: projectBrex, search: '同期' });
    expect(searched.data.total).toBe(1);
    expect(searched.data.rules[0].kind).toBe('nonContext');
  });

  it('BREX を省略し既定 BREX も無ければ、設定方法を示すエラー', async () => {
    const r = await call('explain_brex', {});
    expect(r.isError).toBe(true);
    expect(r.data.error).toContain('S1000D_SPEC_DIR');
  });
});

describe('lookup_sns / lookup_value / list_notations', () => {
  it('DMC から SNS を引く', async () => {
    const r = await call('lookup_sns', {
      brex: projectBrex,
      dmc: 'KENBAIKI-A-10-20-00-00A-040A-D',
    });
    expect(r.data.found).toBe(true);
    expect(r.data.levels.map((l: { snsTitle: string }) => l.snsTitle)).toEqual([
      '発券部',
      '画面',
      '全般',
    ]);
    // assyCode "00" は定義に無いので exact は false
    expect(r.data.exact).toBe(false);
  });

  it('値の意味と許可を返す', async () => {
    const ok = await call('lookup_value', { brex: projectBrex, target: 'infoCode', value: '520' });
    expect(ok.data.matches).toHaveLength(1);
    expect(ok.data.matches[0].valueCheck).toMatchObject({ allowed: true, meaning: ['手順'] });
    const ng = await call('lookup_value', { brex: projectBrex, target: '@infoCode', value: '999' });
    expect(ng.data.matches[0].valueCheck.allowed).toBe(false);
    const none = await call('lookup_value', { brex: projectBrex, target: 'noSuchThing' });
    expect(none.data.matches).toEqual([]);
    expect(none.data._note).toContain('does not restrict');
  });

  it('NOTATION の基本セットと文脈別の差分', async () => {
    const r = await call('list_notations', { brex: projectBrex, context: 'proced' });
    expect(r.data.baseSet.map((b: { notation: string }) => b.notation)).toEqual(['png', 'cgm']);
    expect(r.data.perContext.proced[0]).toMatchObject({ notation: 'png', flag: '0' });
    expect(r.data.effectiveFor.allowed).toEqual(['CGM']);
  });
});

describe('check_against_brex', () => {
  it('連鎖をたどって各層の違反を返す', async () => {
    const r = await call('check_against_brex', { path: dm, csdbDirs: [fixtures] });
    expect(r.isError).toBe(false);
    expect(r.data.passed).toBe(false);
    expect(r.data.unresolvedBrex).toEqual([]);
    expect(r.data.layers.map((l: { brex: string }) => l.brex)).toEqual([
      'KENBAIKI-A-00-00-00-00A-022A-D',
      'KBWORKS-A-00-00-00-00A-022A-D',
    ]);
    const first = r.data.layers[0];
    expect(first.violationCount).toBe(2);
    expect(first.violations.map((v: { ruleId: string }) => v.ruleId).sort()).toEqual([
      'KB-00004',
      'KB-00005',
    ]);
    expect(first.manualChecks).toEqual([
      { ruleId: 'KB-00100', text: '月末に CSDB を同期する', severity: undefined },
    ]);
    expect(r.data._notes.join(' ')).toContain('XSD');
  });

  it('BREX を 1 つ指定して連鎖をたどらない', async () => {
    const r = await call('check_against_brex', { path: dm, brex: projectBrex, followChain: false });
    expect(r.data.layers).toHaveLength(1);
    expect(r.data.layers[0].violationCount).toBe(2);
  });

  it('BREX が見つからないときは unresolvedBrex と注記', async () => {
    const r = await call('check_against_brex', { path: dm });
    expect(r.data.passed).toBe(false);
    expect(r.data.unresolvedBrex).toEqual(['KENBAIKI-A-00-00-00-00A-022A-D']);
    expect(r.data._notes.join(' ')).toContain('S1000D_SPEC_DIR is not set');
  });

  it('path も xml も無ければエラー', async () => {
    const r = await call('check_against_brex', {});
    expect(r.isError).toBe(true);
  });
});
