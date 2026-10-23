/**
 * ツールの実装。definitions.ts の name と 1 対 1 で対応する。
 */
import {
  allowedNotations,
  checkAgainstBrexChain,
  checkAgainstBrexLayers,
  contextApplies,
  formatDmc,
  lookupSns,
  matchesAnyObjectValue,
  parseDmc,
  parseSchemaLocation,
  type BrexCheckReport,
  type BrexDocument,
  type BrexStructureRule,
} from '@shuji-bonji/s1000d-core';
import { LIMITS, specDir } from '../config.js';
import {
  loadDataModuleXml,
  locateBrex,
  makeResolver,
  searchDirs,
} from '../services/brex-locator.js';
import {
  brexHeader,
  explainNonContextRule,
  explainNotationRule,
  explainStructureRule,
  type ExplainedRule,
} from '../services/explain.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Args = Record<string, any>;
export type ToolHandler = (args: Args) => Promise<unknown>;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}
function strArray(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;
}
function int(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : def;
  return Math.min(max, Math.max(min, n));
}

/** スキーマ名（"descript"）を、contextApplies が受け取れる形にする */
function contextToLocation(context: string | undefined): string | undefined {
  if (!context) return undefined;
  const name =
    parseSchemaLocation(context).schemaName ?? context.toLowerCase().replace(/\.xsd$/, '');
  return `${name}.xsd`;
}

function ruleAppliesToContext(
  ruleContext: string | undefined,
  wanted: string | undefined,
): boolean {
  if (wanted === undefined) return true;
  return contextApplies(ruleContext, wanted);
}

async function explainBrex(args: Args) {
  const located = await locateBrex(str(args.brex), { extraDirs: strArray(args.csdbDirs) });
  const brex = located.brex;
  const kind = str(args.kind) ?? 'all';
  const wanted = contextToLocation(str(args.context));
  const search = str(args.search)?.toLowerCase();
  const offset = int(args.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const limit = int(args.limit, LIMITS.defaultRuleLimit, 1, LIMITS.maxRuleLimit);

  const rules: ExplainedRule[] = [];
  if (kind === 'all' || kind === 'structure') {
    for (const c of brex.contextRules) {
      if (!ruleAppliesToContext(c.rulesContext, wanted)) continue;
      for (const r of c.structureRules) rules.push(explainStructureRule(r, brex));
    }
  }
  if (kind === 'all' || kind === 'notation') {
    for (const c of brex.contextRules) {
      if (!ruleAppliesToContext(c.rulesContext, wanted)) continue;
      for (const r of c.notationRules) rules.push(explainNotationRule(r, brex));
    }
  }
  if (kind === 'all' || kind === 'nonContext') {
    for (const r of brex.nonContextRules) rules.push(explainNonContextRule(r, brex));
  }
  const filtered = search
    ? rules.filter((r) =>
        [
          r.ruleId,
          r.objectPath,
          r.objectUse,
          r.summary,
          r.text,
          ...(r.values ?? []).map((v) => `${v.allowed} ${v.meaning}`),
        ]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(search)),
      )
    : rules;
  const page = filtered.slice(offset, offset + limit);
  return {
    brex: brexHeader(brex),
    source: located.source,
    path: located.path,
    total: filtered.length,
    offset,
    returned: page.length,
    nextOffset: offset + page.length < filtered.length ? offset + page.length : null,
    rules: page,
    _note:
      'allowedObjectFlag: 0 = must not be used, 1 = must be present, 2 = optional (value restricted when values are listed). Rules of kind "nonContext" cannot be checked automatically. Severity codes (brslNN) are project-defined and not interpreted here.',
  };
}

async function lookupSnsTool(args: Args) {
  const located = await locateBrex(str(args.brex), { extraDirs: strArray(args.csdbDirs) });
  let codes: {
    systemCode: string;
    subSystemCode?: string;
    subSubSystemCode?: string;
    assyCode?: string;
  };
  const dmcText = str(args.dmc);
  if (dmcText) {
    const dmc = parseDmc(dmcText);
    if (!dmc.ok) throw new Error(dmc.error);
    codes = {
      systemCode: dmc.value.systemCode,
      subSystemCode: dmc.value.subSystemCode,
      subSubSystemCode: dmc.value.subSubSystemCode,
      assyCode: dmc.value.assyCode,
    };
  } else {
    const systemCode = str(args.systemCode);
    if (!systemCode) throw new Error('Pass either "dmc" or "systemCode"');
    codes = {
      systemCode,
      subSystemCode: str(args.subSystemCode),
      subSubSystemCode: str(args.subSubSystemCode),
      assyCode: str(args.assyCode),
    };
  }
  const result = lookupSns(located.brex, codes);
  const hasSns = located.brex.snsRules.length > 0;
  return {
    brex: formatDmc(located.brex.dmCode),
    codes,
    found: result !== undefined,
    exact: result?.exact ?? false,
    levels: result?.levels ?? [],
    _note: hasSns
      ? result
        ? undefined
        : 'This BREX defines SNS rules, but none matched the given codes.'
      : 'This BREX has no snsRules; the SNS may be defined in a parent BREX or in a separate business rules document.',
  };
}

function targetMatches(rule: BrexStructureRule, target: string): boolean {
  const t = target.trim();
  const p = rule.objectPath;
  if (p.includes(t)) return true;
  const attr = t.replace(/^@/, '');
  if (new RegExp(`@${attr}(?![A-Za-z0-9_])`).test(p)) return true;
  if (new RegExp(`(^|/)${attr}(?![A-Za-z0-9_])`).test(p)) return true;
  return false;
}

async function lookupValue(args: Args) {
  const located = await locateBrex(str(args.brex), { extraDirs: strArray(args.csdbDirs) });
  const target = str(args.target);
  if (!target) throw new Error('"target" is required');
  const value = str(args.value);
  const wanted = contextToLocation(str(args.context));
  const matches: unknown[] = [];
  for (const c of located.brex.contextRules) {
    if (!ruleAppliesToContext(c.rulesContext, wanted)) continue;
    for (const r of c.structureRules) {
      if (!targetMatches(r, target)) continue;
      const explained = explainStructureRule(r, located.brex);
      const constrained = r.objectValues.filter((v) => v.valueAllowed !== undefined);
      let valueCheck: unknown = undefined;
      if (value !== undefined) {
        const matched = r.objectValues.filter(
          (v) => v.valueAllowed !== undefined && matchesAnyObjectValue(value, [v]),
        );
        valueCheck = {
          value,
          allowed: constrained.length === 0 ? null : matched.length > 0,
          meaning: matched.map((v) => v.description).filter((d) => d.length > 0),
        };
      }
      matches.push({ ...explained, valueCheck });
    }
  }
  return {
    brex: formatDmc(located.brex.dmCode),
    target,
    value,
    matches,
    _note:
      matches.length === 0
        ? 'No rule in this BREX mentions the target. That means the BREX does not restrict it here; the XML schema may still constrain it, and a parent BREX may have rules.'
        : '"allowed: null" means the rule lists no value restriction (only usage/meaning).',
  };
}

async function listNotations(args: Args) {
  const located = await locateBrex(str(args.brex), { extraDirs: strArray(args.csdbDirs) });
  const brex = located.brex;
  const base: { notation: string; objectUse: string; ruleId?: string }[] = [];
  const perContext: Record<
    string,
    { notation: string; flag?: string; objectUse: string; ruleId?: string }[]
  > = {};
  for (const c of brex.contextRules) {
    for (const r of c.notationRules) {
      if (c.rulesContext === undefined) {
        if (r.allowedNotationFlag !== '0')
          base.push({ notation: r.notationName, objectUse: r.objectUse, ruleId: r.ruleId });
      } else {
        const key = parseSchemaLocation(c.rulesContext).schemaName ?? c.rulesContext;
        (perContext[key] ??= []).push({
          notation: r.notationName,
          flag: r.allowedNotationFlag,
          objectUse: r.objectUse,
          ruleId: r.ruleId,
        });
      }
    }
  }
  const wanted = contextToLocation(str(args.context));
  const effective = wanted ? allowedNotations(brex, wanted) : undefined;
  return {
    brex: formatDmc(brex.dmCode),
    restricts: base.length > 0 || Object.keys(perContext).length > 0,
    baseSet: base,
    perContext,
    effectiveFor: wanted
      ? { context: str(args.context), allowed: effective ? [...effective] : null }
      : undefined,
    _note:
      base.length === 0 && Object.keys(perContext).length === 0
        ? 'This BREX has no notationRuleList, so it does not restrict illustration/multimedia formats. Check the parent BREX and the project business rules document.'
        : 'flag 1 = allowed in that context (redefines the set for that schema), flag 0 = excluded in that context.',
  };
}

function trimReport(report: BrexCheckReport, maxPerLayer: number, includeManual: boolean) {
  return {
    passed: report.passed,
    target: {
      dmc: report.target.dmCode ? formatDmc(report.target.dmCode) : undefined,
      schema: report.target.schemaName,
      schemaLocation: report.target.schemaLocation,
    },
    unresolvedBrex: report.unresolved.map((u) => formatDmc(u.dmCode)),
    layers: report.layers.map((l) => ({
      brex: formatDmc(l.brex.dmCode),
      title: l.brex.title,
      evaluatedRules: l.evaluatedRules,
      violationCount: l.violations.length,
      violations: l.violations.slice(0, maxPerLayer),
      truncated: l.violations.length > maxPerLayer,
      skipped: l.skipped,
      manualChecks: includeManual
        ? l.manualChecks.map((m) => ({
            ruleId: m.ruleId,
            text: m.text,
            severity: m.brSeverityLevel,
          }))
        : undefined,
    })),
  };
}

async function checkAgainst(args: Args) {
  const xml = loadDataModuleXml(
    { path: str(args.path), xml: str(args.xml) },
    LIMITS.maxInlineXmlBytes,
  );
  const extraDirs = strArray(args.csdbDirs);
  const followChain = args.followChain !== false;
  const includeManual = args.includeManualChecks !== false;
  const maxPerLayer = int(args.maxViolationsPerLayer, LIMITS.maxViolationsPerLayer, 1, 5000);
  const brexSpec = str(args.brex);

  let extra: BrexDocument[] = [];
  if (brexSpec) extra = [(await locateBrex(brexSpec, { extraDirs })).brex];

  let report: BrexCheckReport;
  if (followChain) {
    report = await checkAgainstBrexChain(xml, makeResolver({ extraDirs }), { extraLayers: extra });
  } else {
    if (extra.length === 0) throw new Error('followChain=false requires "brex"');
    report = checkAgainstBrexLayers(xml, extra);
  }
  const notes: string[] = [
    'This check does not include XML schema (XSD) validation. Schema errors can hide or cause BREX violations.',
    'Severity codes (brslNN) are defined by the project; they are reported, not interpreted.',
  ];
  if (report.unresolved.length > 0) {
    notes.push(
      `Some BREX in the chain were not found (${report.unresolved.map((u) => formatDmc(u.dmCode)).join(', ')}). Searched: ${searchDirs({ extraDirs }).join(', ') || '(none)'}. ${specDir() ? '' : 'S1000D_SPEC_DIR is not set, so the S1000D default BREX cannot be found.'}`,
    );
  }
  return { ...trimReport(report, maxPerLayer, includeManual), _notes: notes };
}

export const toolHandlers: Record<string, ToolHandler> = {
  explain_brex: explainBrex,
  lookup_sns: lookupSnsTool,
  lookup_value: lookupValue,
  list_notations: listNotations,
  check_against_brex: checkAgainst,
};
