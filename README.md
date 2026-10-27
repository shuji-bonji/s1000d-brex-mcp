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
| `list_notations` | Returns the illustration and multimedia formats that may be used, split into the base set (`baseSet`), exclusions from the base set (`baseExcluded`) and the per-schema redefinitions and exclusions (`perContext`). With `context`, it returns how that schema is restricted in `effectiveFor.mode` (`closed` = only `allowed` may be used, `open` = only `excluded` are forbidden, `unrestricted` = this BREX does not restrict notations). A BREX with exclusions only is `open` |
| `check_against_brex` | Checks a data module against a BREX and returns each violation with its location (XPath and line number), actual value, rule ID, description and severity level. By default it follows the `brexDmRef` chain (project BREX → … → default BREX) and checks each layer separately |

## What it does not do

> [!WARNING]
> - **It does not validate against the XML schema (XSD).** Schema errors can hide BREX violations or create false ones. Run schema validation with `validate_schema` / `verify_data_module` in `s1000d-verify-mcp`.
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

### Config file (when environment variables are not passed, as with plugins in Claude Desktop)

If `S1000D_SPEC_DIR` / `S1000D_CSDB_DIR` are not set, the server reads the config file `~/.config/s1000d-stack/config.json` (under `XDG_CONFIG_HOME` if it is set; `S1000D_CONFIG` changes the location). Claude Desktop does not pass environment variables to servers installed as plugins, and does not substitute `${VAR}` written in the plugin's `env`. When you install the server as a plugin, write the folders here.

```json
{
  "specDir": "/path/to/s1000d/issue-7",
  "csdbDirs": ["/path/to/your/csdb"]
}
```

Environment variables take precedence when they are set. Paths that start with `~/` are accepted. The config file is read again on every call, so the server does not need to be restarted after you edit it.

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

### Running over HTTP (embedding in a product)

The default is stdio. With `--http` the server starts over Streamable HTTP, so a CSDB product's server or a web application can call it over HTTP (the embedding foundation of stage 2.5).

```sh
npx -y @shuji-bonji/s1000d-brex-mcp --http                      # http://127.0.0.1:3000/mcp
npx -y @shuji-bonji/s1000d-brex-mcp --http --port 3100 --path /brex
```

| Argument | Default | Meaning |
|---|---|---|
| `--host` | `127.0.0.1` | Address to bind to |
| `--port` | `3000` | Port; `0` picks a free port |
| `--path` | `/mcp` | Path of the MCP endpoint. `GET /healthz` returns the name and version |
| `--allowed-host` | (see below) | Host names allowed in the `Host` header; comma-separated or repeated |
| `--allowed-origin` | (see below) | Host names allowed in the `Origin` header |

When `--host` is a loopback address (`127.0.0.1` / `::1` / `localhost`), `Host` and `Origin` are limited to localhost names (DNS rebinding protection). When bound to any other address they are not checked, so put the server behind the product's reverse proxy or authentication. Authentication, authorization and multi-tenancy are not part of this server. Environment variables and the config file work the same as with stdio.

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
