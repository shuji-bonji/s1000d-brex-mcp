/**
 * BREX のルールを、LLM と人が読める形に直す。
 * 原文（objectPath、valueAllowed）は残し、意味を英語の短い文で添える。
 */
import {
  formatDmc,
  parseSchemaLocation,
  type BrexDocument,
  type BrexNonContextRule,
  type BrexNotationRule,
  type BrexObjectValue,
  type BrexStructureRule,
} from '@shuji-bonji/s1000d-core';

export const FLAG_MEANING: Record<string, string> = {
  '0': 'must NOT be used in this context',
  '1': 'MUST be present in this context',
  '2': 'may be used; if used, its value must be one of the listed values (when any are listed)',
};

export const NOTATION_FLAG_MEANING: Record<string, string> = {
  '0': 'excluded in this context',
  '1': 'allowed in this context',
};

export interface ExplainedValue {
  form: BrexObjectValue['valueForm'];
  allowed?: string;
  meaning: string;
  tailoring: BrexObjectValue['valueTailoring'];
}

export interface ExplainedRule {
  kind: 'structure' | 'notation' | 'nonContext';
  ruleId?: string;
  /** 対象スキーマ（ファイル名）。共通ルールなら "all" */
  context: string;
  severity?: string;
  /** 人が読む 1 行の要約 */
  summary: string;
  objectPath?: string;
  allowedObjectFlag?: string;
  objectUse?: string;
  values?: ExplainedValue[];
  notationName?: string;
  allowedNotationFlag?: string;
  text?: string;
}

function contextLabel(rulesContext: string | undefined): string {
  if (!rulesContext) return 'all';
  return parseSchemaLocation(rulesContext).schemaName ?? rulesContext;
}

function describeTarget(objectPath: string): string {
  // `//dmIdent/dmCode/@infoCode` → "attribute infoCode of dmIdent/dmCode"
  const m = /^\/\/?([A-Za-z0-9_/]+?)\/@([A-Za-z0-9_]+)$/.exec(objectPath);
  if (m) return `attribute @${m[2]} of <${m[1].split('/').pop()}>`;
  const e = /^\/\/?([A-Za-z0-9_/]+)$/.exec(objectPath);
  if (e) return `element <${e[1].split('/').pop()}>`;
  if (/^\/\/?@([A-Za-z0-9_]+)$/.test(objectPath))
    return `attribute ${objectPath.replace(/^\/\/?/, '')} (anywhere)`;
  return `nodes matching ${objectPath}`;
}

export function explainStructureRule(rule: BrexStructureRule, brex: BrexDocument): ExplainedRule {
  const values: ExplainedValue[] = rule.objectValues.map((v) => ({
    form: v.valueForm,
    allowed: v.valueAllowed,
    meaning: v.description,
    tailoring: v.valueTailoring,
  }));
  const target = describeTarget(rule.objectPath);
  let summary = `${target} ${FLAG_MEANING[rule.allowedObjectFlag] ?? rule.allowedObjectFlag}`;
  const constrained = values.filter((v) => v.allowed !== undefined);
  if (rule.allowedObjectFlag === '2' && constrained.length > 0) {
    const sample = constrained
      .slice(0, 5)
      .map((v) => (v.form === 'single' ? v.allowed : `${v.form}:${v.allowed}`))
      .join(', ');
    summary = `${target} may be used; value must match one of ${constrained.length} allowed values (${sample}${constrained.length > 5 ? ', …' : ''})`;
  }
  return {
    kind: 'structure',
    ruleId: rule.ruleId,
    context: contextLabel(rule.rulesContext),
    severity: rule.brSeverityLevel ?? brex.defaultBrSeverityLevel,
    summary,
    objectPath: rule.objectPath,
    allowedObjectFlag: rule.allowedObjectFlag,
    objectUse: rule.objectUse,
    values: values.length > 0 ? values : undefined,
  };
}

export function explainNotationRule(rule: BrexNotationRule, brex: BrexDocument): ExplainedRule {
  return {
    kind: 'notation',
    ruleId: rule.ruleId,
    context: contextLabel(rule.rulesContext),
    severity: rule.brSeverityLevel ?? brex.defaultBrSeverityLevel,
    summary: `notation ${rule.notationName} is ${NOTATION_FLAG_MEANING[rule.allowedNotationFlag ?? ''] ?? 'listed'}`,
    notationName: rule.notationName,
    allowedNotationFlag: rule.allowedNotationFlag,
    objectUse: rule.objectUse,
  };
}

export function explainNonContextRule(rule: BrexNonContextRule, brex: BrexDocument): ExplainedRule {
  return {
    kind: 'nonContext',
    ruleId: rule.ruleId,
    context: 'all',
    severity: rule.brSeverityLevel ?? brex.defaultBrSeverityLevel,
    summary: `manual check: ${rule.text}`,
    text: rule.text,
  };
}

export interface BrexHeader {
  dmc: string;
  issue?: string;
  title?: string;
  /** 上位の BREX。自分自身なら "self"（既定 BREX） */
  parentBrex?: string;
  defaultSeverity?: string;
  commonInfo?: string;
  counts: {
    structure: number;
    notation: number;
    nonContext: number;
    snsSystems: number;
    contexts: string[];
  };
}

export function brexHeader(brex: BrexDocument): BrexHeader {
  const dmc = formatDmc(brex.dmCode);
  const parent = brex.brexDmRef ? formatDmc(brex.brexDmRef.dmCode) : undefined;
  return {
    dmc,
    issue: brex.issueInfo ? `${brex.issueInfo.issueNumber}-${brex.issueInfo.inWork}` : undefined,
    title: brex.title,
    parentBrex: parent === undefined ? undefined : parent === dmc ? 'self' : parent,
    defaultSeverity: brex.defaultBrSeverityLevel,
    commonInfo: brex.commonInfo,
    counts: {
      structure: brex.contextRules.reduce((n, c) => n + c.structureRules.length, 0),
      notation: brex.contextRules.reduce((n, c) => n + c.notationRules.length, 0),
      nonContext: brex.nonContextRules.length,
      snsSystems: brex.snsRules.reduce((n, s) => n + s.systems.length, 0),
      contexts: brex.contextRules.map((c) => contextLabel(c.rulesContext)),
    },
  };
}
