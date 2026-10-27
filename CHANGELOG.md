# Changelog

## 0.4.0 (2026-10-27)

### 追加

- Streamable HTTP での起動（`--http`。`--host` / `--port` / `--path` / `--allowed-host` / `--allowed-origin`。段階 2.5 の作業 4、D-19）。MCP SDK v2 の `createMcpHandler` を `node:http` に載せました。`GET /healthz` は名前と版を返します。loopback に束縛したときは `Host` と `Origin` を localhost 系に限り、それ以外では検査しません。認証・権限・マルチテナントは持ちません（製品側の責務）。既定の stdio は変わりません。

## 0.3.0 (2026-10-27)

### 追加

- `S1000D_SPEC_DIR` / `S1000D_CSDB_DIR` が無いときに、設定ファイル `~/.config/s1000d-stack/config.json`（`XDG_CONFIG_HOME` に従う、`S1000D_CONFIG` で変更可）の `specDir` / `csdbDirs` を読むようにしました（core の `resolveStackConfig`）。Claude Desktop が plugin で入れたサーバーに環境変数を渡さず、plugin の `env` の `${VAR}` も置き換えないためです。置き換えられずに渡った `${VAR}` は使わず、応答の `_notes` に理由を書きます。配布物の場所が決まらないときの案内にも、設定ファイルの場所を出します。
- `instructions` と README（英語・日本語）に設定ファイルの説明を足しました。

**core 0.4.0（`resolveStackConfig`）の公開後に依存を上げてから公開します。**

## 0.2.0 (2026-10-27)

依存を `@shuji-bonji/s1000d-core` `^0.3.0` に上げました（Issue #1）。

### 変更

- core 0.3.0 で BREX の NOTATION の照合が直りました。許可（`allowedNotationFlag="1"`）が 1 つも無く除外（`"0"`）だけの `notationRuleList` を持つ BREX を「使ってよい NOTATION が 0 件」と読み、使われているすべての NOTATION を違反にしていた誤りです（根拠は S1000D Issue 7 Chap 4.10.2.2 Para 2.2.2）。`check_against_brex` では、除外されたものだけが違反になります（Bike Samples では NOTATION の違反が 36 件 → 0 件）。
- `list_notations` の `effectiveFor` に `mode`（`closed` / `open` / `unrestricted`）と `excluded` を足しました。除外だけの BREX では、これまで `allowed: null` だけが返り除外したものが分かりませんでしたが、`mode: "open"` と `excluded` で返します。`allowed` の意味（`closed` のときの使ってよい集合、それ以外は `null`）は変わりません。
- `list_notations` の応答に `baseExcluded`（`rulesContext` の無い `contextRules` の中の除外）を足しました。これまでは基本セットの一覧から黙って落としていました。

## 0.1.1 (2026-10-27)

MCP Registry と claude-plugins marketplace に載せるための版。ツールと応答は 0.1.0 から変わっていません。

### 追加

- `package.json` に `mcpName`（`io.github.shuji-bonji/s1000d-brex-mcp`）、リポジトリ直下に `server.json`（MCP Registry 用。npm パッケージには同梱しない）、`.claude-plugin/plugin.json`（Claude Code の plugin 定義）
- `scripts/sync-plugin-version.mjs`: `npm version` のフックで `plugin.json` と `server.json` の版を `package.json` に揃える

## 0.1.0 (2026-10-26)

最初の版。段階 1 の s1000d-brex-mcp です（ROADMAP の段階 1、DECISIONS D-16）。

### 追加

- 5 ツール: `explain_brex` / `lookup_sns` / `lookup_value` / `list_notations` / `check_against_brex`
- `initialize` の `instructions` に「しないこと」（XSD 検証、S1000D への準拠の判定、重大度コードの解釈）を先に書く
- BREX の読み取りと照合は `@shuji-bonji/s1000d-core` 0.2.0（`readBrex` / `lookupSns` / `checkAgainstBrexChain` / `locateBrex`）を呼ぶだけ。`check_against_brex` は既定で `brexDmRef` の連鎖（プロジェクト BREX → … → 既定 BREX）をたどり、各層に個別に照合する。見つからなかった層は `unresolvedBrex` で返す
- `nonContextRules`（文章で書かれた取り決め）は `manualChecks` として返し、判断は人に任せる

### 注記

- BREX の所在（ファイルのパス・DMC・省略時は配布物の既定 BREX）の解決は、0.1.0 の公開前に core 0.2.0 の `locateBrex` へ移しました（s1000d-verify-mcp と共有するため）。
- XML スキーマ（XSD）による検証は行いません。`s1000d-verify-mcp` を使ってください。
