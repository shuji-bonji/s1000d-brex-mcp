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
| `list_notations` | 使ってよい図・マルチメディアの形式を、基本セット（`baseSet`）・基本セットからの除外（`baseExcluded`）・スキーマ別の再定義と除外（`perContext`）に分けて返します。`context` を渡すと、そのスキーマでの扱いを `effectiveFor.mode` で返します（`closed` = `allowed` だけ使える、`open` = `excluded` だけ禁止、`unrestricted` = この BREX は制限しない）。除外だけの BREX は `open` です |
| `check_against_brex` | データモジュールを BREX に照合し、違反を箇所（XPath と行番号）・実際の値・ルール ID・説明・重大度付きで返します。既定では `brexDmRef` の連鎖（プロジェクト BREX → … → 既定 BREX）をたどり、各層に個別に照合します |

## できないこと

> [!WARNING]
> - **XML スキーマ（XSD）による検証は行いません。** スキーマの誤りは BREX の違反を隠したり、逆に生んだりします。スキーマ検証は `s1000d-verify-mcp` の `validate_schema` / `verify_data_module` で行ってください。
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

### 設定ファイル（Claude Desktop の plugin など、環境変数が渡らないとき）

`S1000D_SPEC_DIR` / `S1000D_CSDB_DIR` が無いときは、設定ファイル `~/.config/s1000d-stack/config.json`（`XDG_CONFIG_HOME` があればその下、`S1000D_CONFIG` で場所を変更可）を読みます。Claude Desktop は、plugin で入れたサーバーに環境変数を渡さず、plugin の `env` に書いた `${VAR}` も置き換えません。plugin で入れたときは、こちらに書いてください。

```json
{
  "specDir": "/path/to/s1000d/issue-7",
  "csdbDirs": ["/path/to/your/csdb"]
}
```

環境変数があれば、そちらが優先します。`~/` で始まるパスも使えます。設定ファイルは呼び出しのたびに読み直すので、書き換えたあとにサーバーを再起動する必要はありません。

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

### HTTP で起動する（製品への組み込み）

既定は stdio です。`--http` を付けると Streamable HTTP で起動し、CSDB 製品のサーバーや Web アプリから HTTP で呼べます（段階 2.5 の組み込み基盤）。

```sh
npx -y @shuji-bonji/s1000d-brex-mcp --http                      # http://127.0.0.1:3000/mcp
npx -y @shuji-bonji/s1000d-brex-mcp --http --port 3100 --path /brex
```

| 引数 | 既定 | 内容 |
|---|---|---|
| `--host` | `127.0.0.1` | 束縛するアドレス |
| `--port` | `3000` | ポート。`0` で空いているポート |
| `--path` | `/mcp` | MCP のエンドポイントのパス。`GET /healthz` は名前と版を返します |
| `--allowed-host` | （下記） | `Host` ヘッダーに許すホスト名。カンマ区切りか複数回 |
| `--allowed-origin` | （下記） | `Origin` ヘッダーに許すホスト名 |

`--host` が loopback（`127.0.0.1` / `::1` / `localhost`）のときは、`Host` と `Origin` を localhost 系に限ります（DNS rebinding 対策）。それ以外のアドレスに束縛したときは検査しないので、製品側のリバースプロキシや認証の後ろに置いてください。認証・権限・マルチテナントはこのサーバーでは持ちません。環境変数と設定ファイルの扱いは stdio と同じです。

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
