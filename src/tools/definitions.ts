/**
 * ツール定義（入力スキーマ）。実装は handlers.ts。
 * すべてのツールは additionalProperties: false を持ち、未知の引数は SDK の入力検証で弾かれる。
 */
import type { JsonSchemaType, Tool } from '@modelcontextprotocol/server';

export type ToolDefinition = Omit<Tool, 'inputSchema'> & { inputSchema: JsonSchemaType };

const brexParam = {
  type: 'string',
  description:
    'Which BREX to use: a file path to a BREX data module (.xml), or a DMC (e.g. "KENBAIKI-A-00-00-00-00A-022A-D", "DMC-" prefix optional) searched in csdbDirs / S1000D_CSDB_DIR / S1000D_SPEC_DIR. Omit to use the S1000D default BREX found under S1000D_SPEC_DIR.',
} as const;

const csdbDirsParam = {
  type: 'array',
  items: { type: 'string' },
  description:
    'Extra folders to search for data modules and BREX by DMC (in addition to S1000D_CSDB_DIR and S1000D_SPEC_DIR).',
} as const;

export const tools: ToolDefinition[] = [
  {
    name: 'explain_brex',
    description:
      'List the rules of a BREX data module in readable form: for each rule, the target (XPath), whether it is forbidden / required / optional, the allowed values with their meanings, severity, and the schema context it applies to. Also returns the BREX header (DMC, parent BREX, counts). Use "kind" and "context" to narrow, "offset"/"limit" to page.',
    inputSchema: {
      type: 'object',
      properties: {
        brex: brexParam,
        csdbDirs: csdbDirsParam,
        kind: {
          type: 'string',
          enum: ['all', 'structure', 'notation', 'nonContext'],
          description: 'Rule kind to list (default: all).',
          default: 'all',
        },
        context: {
          type: 'string',
          description:
            'Only rules that apply to this schema (file name such as "descript", "proced", "pm") plus the common rules. Omit for all contexts.',
        },
        search: {
          type: 'string',
          description:
            'Case-insensitive text to find in objectPath, objectUse, rule id or value meanings.',
        },
        offset: {
          type: 'number',
          description: 'Index of the first rule to return (default 0).',
          default: 0,
        },
        limit: {
          type: 'number',
          description: 'Maximum rules to return (default 50, max 500).',
          default: 50,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'lookup_sns',
    description:
      'Explain what a Standard Numbering System (SNS) code means in a BREX: pass a DMC (the system / subsystem / sub-subsystem / assembly codes are taken from it) or the codes directly. Returns the matched hierarchy with titles; "exact: false" means only a prefix matched.',
    inputSchema: {
      type: 'object',
      properties: {
        brex: brexParam,
        csdbDirs: csdbDirsParam,
        dmc: { type: 'string', description: 'A DMC whose SNS part should be looked up.' },
        systemCode: {
          type: 'string',
          description: 'System code (2-3 characters), when not passing dmc.',
        },
        subSystemCode: { type: 'string', description: 'Subsystem code (1 character).' },
        subSubSystemCode: { type: 'string', description: 'Sub-subsystem code (1 character).' },
        assyCode: { type: 'string', description: 'Assembly code (2 or 4 characters).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'lookup_value',
    description:
      'Explain what a value of an element or attribute means in a BREX, or list the allowed values. Pass "target" as an attribute name (e.g. "securityClassification"), an element name, or an XPath fragment; optionally "value" to check one value. Returns the matching rules with allowed values and their meanings, and whether the value is allowed.',
    inputSchema: {
      type: 'object',
      properties: {
        brex: brexParam,
        csdbDirs: csdbDirsParam,
        target: {
          type: 'string',
          description:
            'Attribute name ("infoCode", "@infoCode"), element name ("language"), or XPath fragment to match against objectPath.',
        },
        value: {
          type: 'string',
          description: 'The value to check against the allowed values (optional).',
        },
        context: {
          type: 'string',
          description:
            'Schema file name (e.g. "descript") to pick context-specific rules in addition to common ones.',
        },
      },
      required: ['target'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_notations',
    description:
      'List the illustration / multimedia notations (file formats) a BREX allows: the base set (common to all schemas) and the per-schema additions and exclusions. Pass "context" to get the effective rule for one schema: mode "closed" (only the listed notations may be used), "open" (only the excluded ones are forbidden; a BREX with exclusions only) or "unrestricted". Returns an empty base set when the BREX has no notation rules (then the BREX does not restrict notations).',
    inputSchema: {
      type: 'object',
      properties: {
        brex: brexParam,
        csdbDirs: csdbDirsParam,
        context: {
          type: 'string',
          description: 'Schema file name (e.g. "ipd", "proced") to compute the effective set for.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'check_against_brex',
    description:
      'Check a data module against BREX rules and report violations with location (XPath + line), actual value, rule id, objectUse text and severity. Also accepts a publication module (pm) or a comment (the brexDmRef in pmStatus / commentStatus is followed). By default follows the document\'s brexDmRef chain (project BREX → … → S1000D default BREX found under S1000D_SPEC_DIR) and checks each layer separately; pass "brex" to check against one specific BREX instead or in addition. Does NOT validate against the XML schema (XSD): run schema validation separately. nonContextRules cannot be checked automatically and are returned as manualChecks.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path of the data module to check.' },
        xml: {
          type: 'string',
          description: 'The data module as an XML string (alternative to path; max 5 MB).',
        },
        brex: {
          type: 'string',
          description:
            'A specific BREX (file path or DMC) to check against. With followChain=false it is the only layer; otherwise it is added to the chain.',
        },
        followChain: {
          type: 'boolean',
          description: 'Follow the brexDmRef chain of the data module (default true).',
          default: true,
        },
        csdbDirs: csdbDirsParam,
        includeManualChecks: {
          type: 'boolean',
          description: 'Include nonContextRules as manualChecks in each layer (default true).',
          default: true,
        },
        maxViolationsPerLayer: {
          type: 'number',
          description:
            'Cap on violations returned per layer (default 200). The total count is always reported.',
          default: 200,
        },
      },
      additionalProperties: false,
    },
  },
];
