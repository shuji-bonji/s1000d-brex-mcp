# @shuji-bonji/s1000d-brex-mcp

**English** | [日本語](./README.ja.md)

An MCP server that lets an LLM read S1000D® BREX (Business Rules Exchange) data modules and check data modules against a BREX. It returns, in a form people can read, what a project or organisation has written in its BREX: which elements and attributes may be used, which values are allowed and what they mean, what the standard numbering system (SNS) codes mean, and which illustration formats may be used. It also reports whether a data module follows those rules, with the location of each violation.

> [!IMPORTANT]
> This is a personal project and is not affiliated with ASD (Aerospace, Security and Defence Industries Association of Europe). S1000D® is a registered trademark of ASD.
> The S1000D specification, XML schemas, default BREX and official samples are not included in any package or repository, because their terms of use do not grant redistribution. Obtain them from [s1000d.org](https://s1000d.org/) and point the `S1000D_SPEC_DIR` environment variable at the extracted folder.

## What it does

| Tool | Description |
|---|---|
| `explain_brex` | Lists the rules of a BREX. Returns the target (XPath), whether it may be used (forbidden, required or optional), the allowed values and their meaning, the severity level and the schemas the rule applies to. Narrow the list with `kind`, `context` and `search`, and read it in parts with `offset` and `limit` |
| `lookup_sns` | Returns what a standard numbering system (SNS) code refers to, from a DMC or a code |
| `lookup_value` | Returns what an element or attribute value means in the project, and which values are allowed |
| `list_notations` | Returns the illustration and multimedia formats that may be used, split into the base set and the per-schema additions and exclusions |
| `check_against_brex` | Checks a data module against a BREX and returns each violation with its location (XPath and line number), actual value, rule ID, description and severity level. By default it follows the `brexDmRef` chain (project BREX → … → default BREX) and checks each layer separately |

## What it does not do

> [!WARNING]
> - **It does not validate against the XML schema (XSD).** Schema errors can hide BREX violations or create false ones. Run schema validation separately (it is planned for `s1000d-verify-mcp` in stage 2).
> - **It does not judge conformance to S1000D.** `passed: true` from `check_against_brex` means only that no machine-checkable BREX rule was violated in every layer that could be resolved. `nonContextRules` (rules written as prose) are returned as `manualChecks`, and a person makes the judgement.
> - It does not interpret the meaning of severity level codes (`brsl01` to `brsl99`). The project defines them, so they are returned as they are.

> [!NOTE]
> The absence of a rule in one BREX does not mean the absence of a restriction. A higher BREX (followed through `brexDmRef`, ending at the S1000D default BREX) or a business rules document written for people may restrict it. `check_against_brex` reports the layers it could not find in `unresolvedBrex`. Treat a result in which this field is not empty as incomplete.

## Configuration

| Environment variable | Description |
|---|---|
| `S1000D_SPEC_DIR` | The folder where the S1000D distribution you obtained is extracted. The default BREX (`DMC-S1000D-*-04-10-0301-00A-022A-D_*.XML`) is searched for under it. Extract the inner zip files as well |
| `S1000D_CSDB_DIR` | The folder that holds the project's data modules. Several folders can be given, separated by `:` (`;` on Windows). A BREX given by DMC, and the layers of the chain, are searched for here |

Folders can also be added with the tool argument `csdbDirs`. A BREX can be given as a file path, as a DMC (the `DMC-` prefix is optional), or omitted (the default BREX).

### Example configuration for Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "s1000d-brex": {
      "command": "npx",
      "args": ["-y", "@shuji-bonji/s1000d-brex-mcp"],
      "env": {
        "S1000D_SPEC_DIR": "/path/to/s1000d/issue-7",
        "S1000D_CSDB_DIR": "/path/to/project/csdb"
      }
    }
  }
}
```

## Check rules

The check follows Chap 4.10.2 (BREX data module) and Chap 7.9 (Business rules processing) of S1000D Issue 7. See the README of [`@shuji-bonji/s1000d-core`](https://github.com/shuji-bonji/s1000d-core) for details.

| Item | Handling |
|---|---|
| `allowedObjectFlag` | `0` = a violation if the target is present, `1` = a violation if it is absent, `2` = if present, the value is checked against `objectValue` (single / range / pattern) |
| `rulesContext` | The blocks whose schema matches the target data module, and the common blocks, are applied |
| `notationRuleList` | A violation if a NOTATION declared in the DOCTYPE is not in the allowed set |
| Layers | Each layer is checked separately; the layers are not merged. `passed` only when no layer has a violation and no reference is unresolved |

## Development

```sh
npm install
npm run build
npm test            # runs on self-made test data only
npm run test:spec   # uses the S1000D distribution (set its location with S1000D_SPEC_DIR)
```

## License

MIT
