# Changelog

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
