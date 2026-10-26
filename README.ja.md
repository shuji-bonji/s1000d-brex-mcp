# @shuji-bonji/s1000d-brex-mcp

[English](./README.md) | **日本語**

S1000D® の BREX（Business Rules Exchange）データモジュールを LLM が読み、データモジュールを BREX に照合できるようにする MCP サーバーです。プロジェクトや組織が BREX に書いた「使ってよい要素・属性」「許可する値とその意味」「システム番号（SNS）の意味」「使ってよい図の形式」を人が読める形で返し、データモジュールがそれに従っているかを箇所付きで報告します。

> [!IMPORTANT]
> このサーバーは ASD（Aerospace, Security and Defence Industries Association of Europe）とは無関係の個人プロジェクトです。S1000D® は ASD の登録商標です。
> S1000D の仕様書・XML スキーマ・既定 BREX・公式サンプルは、利用条件により再配布できないため、このパッケージには含まれていません。既定 BREX を使うには、利用者ご自身で [s1000d.org](https://s1000d.org/) から配布物を入手し、展開したフォルダーを環境変数 `S1000D_SPEC_DIR` で指定してください。

## できること

| ツール | 内容 |
|---|---|
| `explain_brex` | BREX のルールを一覧にします。対象（XPath）、使用可否（禁止・必須・任意）、許可する値とその意味、重大度、適用されるスキーマを返します。`kind`・`context`・`search` で絞り、`offset`・`limit` で分けて読めます |
| `lookup_sns` | DMC またはコードから、システム番号（SNS）が何を指すかを返します |
| `lookup_value` | 要素・属性の値がプロジェクトで何を意味するか、どの値が許可されているかを返します |
| `list_notations` | 使ってよい図・マルチメディアの形式を、基本セットとスキーマ別の追加・除外に分けて返します |
| `check_against_brex` | データモジュールを BREX に照合し、違反を箇所（XPath と行番号）・実際の値・ルール ID・説明・重大度付きで返します。既定では `brexDmRef` の連鎖（プロジェクト BREX → … → 既定 BREX）をたどり、各層に個別に照合します |

## できないこと

> [!WARNING]
> - **XML スキーマ（XSD）による検証は行いません。** スキーマの誤りは BREX の違反を隠したり、逆に生んだりします。スキーマ検証は別に行ってください（段階 2 の `s1000d-verify-mcp` で扱う予定です）。
> - **S1000D への準拠を判定しません。** `check_against_brex` の `passed: true` は「解決できたすべての層で、機械で検査できる BREX のルールに違反が無かった」ことだけを意味します。`nonContextRules`（文章で書かれた取り決め）は `manualChecks` として返し、判断は人が行います。
> - 重大度コード（`brsl01`〜`brsl99`）の意味は解釈しません。プロジェクトが定めるものなので、そのまま返します。

> [!NOTE]
> ある BREX にルールが無いことは「制限が無い」ことではありません。上位の BREX（`brexDmRef` でたどる。終端は S1000D の既定 BREX）や、人が読むビジネスルール文書に制限があることがあります。`check_against_brex` は見つからなかった層を `unresolvedBrex` で報告します。この項目が空でない結果は不完全なものとして扱ってください。

## 設定

| 環境変数 | 内容 |
|---|---|
| `S1000D_SPEC_DIR` | 利用者が入手した S1000D の配布物を展開したフォルダー。既定 BREX（`DMC-S1000D-*-04-10-0301-00A-022A-D_*.XML`）をこの下から探します。内側の zip も展開しておいてください |
| `S1000D_CSDB_DIR` | プロジェクトのデータモジュールが置かれたフォルダー。`:`（Windows は `;`）区切りで複数指定できます。BREX を DMC で指定したときや、連鎖をたどるときにここから探します |

ツールの引数 `csdbDirs` でフォルダーを追加することもできます。BREX は、ファイルのパス、DMC（`DMC-` 接頭辞は任意）、省略（既定 BREX）のどれでも指定できます。

### Claude Desktop / Claude Code の設定例

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

## 照合の規則

S1000D Issue 7 の Chap 4.10.2（BREX data module）と Chap 7.9（Business rules processing）に沿っています。詳細は [`@shuji-bonji/s1000d-core`](https://github.com/shuji-bonji/s1000d-core) の README を参照してください。

| 項目 | 扱い |
|---|---|
| `allowedObjectFlag` | `0` = 対象があれば違反、`1` = 無ければ違反、`2` = あれば値を `objectValue`（single / range / pattern）と照合 |
| `rulesContext` | 対象データモジュールのスキーマに一致するブロックと、共通のブロックを適用 |
| `notationRuleList` | DOCTYPE で宣言された NOTATION が許可された集合に無ければ違反 |
| 階層 | 各層に個別に照合し、層の統合はしない。どの層にも違反が無く、未解決の参照も無いときだけ `passed` |

## 開発

```sh
npm install
npm run build
npm test            # 自作のテストデータだけで動く
npm run test:spec   # S1000D の配布物を使う（S1000D_SPEC_DIR で場所を指定）
```

## ライセンス

MIT
