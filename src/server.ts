/**
 * s1000d-brex-mcp の組み立て。index.ts は起動だけを担い、テストからはこの関数を直接叩く。
 */
import { McpServer, fromJsonSchema } from '@modelcontextprotocol/server';
import { ENV, PACKAGE_INFO } from './config.js';
import { tools } from './tools/definitions.js';
import { toolHandlers } from './tools/handlers.js';
import { ToolInputError } from './errors.js';
import { missingCsdbDirsNotes } from './services/brex-locator.js';

/**
 * `initialize` の応答としてクライアントへ返す説明。README やツール説明より早く読まれる。
 *
 * 潰したい誤解:
 * 1. このサーバが XSD 検証も行う「完全な検証器」だと読まれること。BREX の照合だけを行う。
 * 2. `check_against_brex` が合格と言えば S1000D 準拠だと読まれること。合格は「BREX の機械で検査できるルールに
 *    違反が無い」ことだけで、nonContextRules（手動確認）と XSD は含まれない。
 * 3. 「このルールは無い」と「この BREX には無い」の混同。上位の BREX やビジネスルール文書にあることがある。
 */
const INSTRUCTIONS = `This server READS S1000D BREX (Business Rules Exchange) data modules and CHECKS data modules against them. It is not a schema validator and not a judge of S1000D conformance.

It does NOT do the following:
- It does not validate against the S1000D XML schemas (XSD). Run schema validation separately (s1000d-verify-mcp, planned); schema errors can hide or cause BREX findings.
- It does not decide conformance. "passed: true" from \`check_against_brex\` means only that no machine-checkable BREX rule was violated in any resolved layer. nonContextRules are returned as \`manualChecks\` and must be judged by a person.
- It does not interpret severity codes (brsl01..brsl99); they are project-defined and are passed through.
- It does not ship any S1000D specification, schema or default BREX. The user must download the S1000D distribution from s1000d.org and set ${ENV.specDir} to the extracted folder (or write {"specDir": "/absolute/path"} to ~/.config/s1000d-stack/config.json, for hosts that do not pass environment variables to plugins); project data modules are found via ${ENV.csdbDirs}, "csdbDirs" in that config file, or the \`csdbDirs\` argument. When the \`csdbDirs\` argument is given, it replaces the other two (it is not added to them); the S1000D default BREX is still searched under ${ENV.specDir}. Folders that do not exist are skipped and listed in \`_notes\`.\n\nAn input the server cannot use comes back as {"error": {"code": "...", "path": "/brex", "detail": "..."}} (not as a tool failure), in the same shape as the other S1000D Stack servers. code is "file-not-found" (the file at that argument does not exist), "not-found" (the BREX DMC, or the default BREX, was not found in the folders) or "input-error" (the argument is malformed or missing). path names the argument to fix. Fix it and call again.

Reading results: a rule that is absent from a BREX means "this BREX does not restrict it", NOT "it is unrestricted" — a parent BREX (followed via brexDmRef, ending at the S1000D default BREX) or a human-readable business rules document may restrict it. \`check_against_brex\` reports \`unresolvedBrex\` when a layer could not be found; treat such a result as incomplete.

Costly options: \`explain_brex\` without \`kind\`/\`context\`/\`search\` on the default BREX returns hundreds of rules; use \`limit\`/\`offset\` or narrow by \`context\` (schema name such as "descript").`;

export function buildServer(): McpServer {
  const server = new McpServer(
    { name: PACKAGE_INFO.name, version: PACKAGE_INFO.version },
    { instructions: INSTRUCTIONS },
  );
  for (const tool of tools) {
    const handler = toolHandlers[tool.name];
    if (!handler) throw new Error(`No handler registered for tool: ${tool.name}`);
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: fromJsonSchema<Record<string, unknown>>(tool.inputSchema),
      },
      async (args) => {
        try {
          const result = await handler(args as Record<string, unknown>);
          // 使わなかった CSDB のフォルダーを _notes で知らせる（どのツールも csdbDirs を受け取る）
          const csdb = (args as Record<string, unknown>).csdbDirs;
          const missing = missingCsdbDirsNotes({
            extraDirs: Array.isArray(csdb)
              ? csdb.filter((d): d is string => typeof d === 'string')
              : undefined,
          });
          if (
            missing.length > 0 &&
            result &&
            typeof result === 'object' &&
            !Array.isArray(result)
          ) {
            const r = result as Record<string, unknown>;
            r._notes = [...(Array.isArray(r._notes) ? r._notes : []), ...missing];
          }
          return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          // 呼び出し側が直せる、想定内の失敗は isError にせず、他の 3 本と同じ形で返す
          if (error instanceof ToolInputError) {
            const body = { error: { code: error.code, path: error.path, detail: error.detail } };
            return { content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }] };
          }
          const message = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: message }, null, 2) }],
            isError: true,
          };
        }
      },
    );
  }
  return server;
}
