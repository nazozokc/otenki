# 開発

## リポジトリの構成

Bun ワークスペースです。CLI は `apps/otenki` にあり、ルートが設定とロックファイルを持ちます。CLI の runtime 依存は 0 で、`bun install` が拾うのは型検査用の `typescript` と `@types/bun` だけです。

```text
.
├── apps/otenki/       CLI 本体（bin は src/index.ts を直接指す）
├── docs/              このドキュメントサイト（独立したパッケージ）
├── bun.lock           依存のロック
├── bun.nix            bun.lock から生成した依存定義（bun2nix の生成物）
├── flake.nix          パッケージ、チェック、devShell、formatter
└── package.json       ワークスペースとルートのスクリプト
```

Nix の `src` フィルタは `apps/**` とルートの設定ファイルだけを通します。`docs/` はビルド対象ではないので、`docs/` に依存を足しても Nix 側は動きません。

## ふつうのループ

```sh
bun test                    # ユニットテスト。ネットワークに出ない
bun run typecheck           # tsc --noEmit
bun run start -- today 函館  # CLI を開発モードで実行
bun run build               # apps/otenki/dist/otenki.js へバンドル
```

ルートのスクリプトは `bun run --filter otenki …` でアプリ側へ渡します。単体のアプリだけを触るときは `apps/otenki` で直接実行してください。

```sh
(cd apps/otenki && bun test)
```

## Nix

```sh
nix run . -- today 函館   # ビルドから実行
nix flake check           # build、テスト、型検査
nix fmt                   # nixfmt と prettier
```

devShell に入れるのは、`bun` `typescript` `bun2nix` `fzf` `gh` `git` `jq` と、treefmt の設定です。`direnv` を入れておけば、シェルに入るだけで揃います。

## 依存を更新したあと

`bun.lock` を変えても `bun.nix` は自動更新されません。2 つのコマンドを順に走らせます。

```sh
bun install && nix run .#update
```

`nix run .#update` は `bun install` のあと `bun2nix` で `bun.nix` を再生成し、`nix flake lock` を更新します。CLI の runtime 依存は 0 なので、この定義を使うのは `checks.typecheck` だけです。tsc が Bun のグローバル型と `bun:test` を解決するため、型チェックの derivation だけが `bun install --linker=isolated --offline --frozen-lockfile` で `@types/bun` を復元します。`bun.nix` が古いままだとこの手順は失敗します。

パッケージのビルドと `checks.tests` は `bun install` を走りません。`bun build` が bare import を解決してインライン化するため、成果物もテストも `node_modules` を要しません。

`bun2nix` は PR [#110](https://github.com/nix-community/bun2nix/pull/110) の head を指しています。Bun 1.4 が書く `lockfileVersion: 2` を 2.1.2 は読めないためです。その PR が着いたら、rev を差し替えて 2.1.3 へ上げる予定です。

`nix build .` は git のスナップショットを見るので、未追跡のファイルはビルドに入りません。作業ディレクトリのまま検証したいときは `nix build "path:$PWD"` を渡します。CI が `nix flake check` を素の形で通せるのは、CI ではすべてが commit 済みだからです。

## CI と公開

workflow は 3 本あります。

| workflow          | 起動条件                 | やること                                                       |
| ----------------- | ------------------------ | -------------------------------------------------------------- |
| `ci.yml`          | main への push / PR      | Bun で test・型検査・build、`nix flake check` で全部のチェック |
| `publish.yml`     | `v*` タグの push / 手動  | GitHub Release と npm publish                                  |
| `deploy-docs.yml` | `docs/**` の push / 手動 | VitePress をビルドして GitHub Pages へ                         |

`ci.yml` の Nix job は `checks.build` `checks.tests` `checks.typecheck` `checks.treefmt` を全部含みます。ローカルで `nix flake check` が green なら CI も green です。

Bun の版は 3 本とも 1.4.2 に固定しています。nixpkgs が bun を上げたら 3 箇所を同時に直してください。

### 公開の流れ

バージョンの情報源は `apps/otenki/package.json` だけです。Nix ビルドもここを読み、`publish.yml` はタグと package.json が食い違うと落ちます。公開は「bump して tag を push」の 2 手順です。

```sh
# apps/otenki/package.json の version を bump して main へ入れる
git tag "v$(jq -r .version < apps/otenki/package.json)"
git push origin v0.1.0
```

タグを push すると `publish.yml` が走り、`npm pack` → 型検査とテスト → tarball を実際に起動 → GitHub Release（コミットログから notes を生成、npm tarball を添付）→ `npm publish --provenance` の順に処理します。`NPM_TOKEN` が無いリポジトリでは npm の job だけが飛ばされ、GitHub Release は出ます。

同じタグを再実行したいときは Actions タブの `workflow_dispatch` を使います。main ではなく **タグの commit** を取り直すので、後から drift した版が publish されることはありません。

npm には `files` で `src` と `README.md` だけを載せています。`test/` や `tsconfig.json` は入りません。bin は `src/index.ts` を指し、shebang が `#!/usr/bin/env bun` なので、利用側に Bun が必要です。

## テスト

```text
apps/otenki/test/format.test.ts    数値と日付の表示
apps/otenki/test/geocode.test.ts   サフィックス展開と順位付け
apps/otenki/test/locate.test.ts    fzf の候補行と選択の突き合わせ
apps/otenki/test/location.test.ts  座標と地名の振り分け
apps/otenki/test/table.test.ts     表示幅と表の組版
apps/otenki/test/cli.test.ts       引数解析、ヘルプ、終了コード
```

ネットワークは叩きません。対象のロジックは純関数だけです。

- `candidateQueries` 地名から作る問い合わせの一覧
- `rankCandidates` feature code → 人口 → 名前 の並び替え
- `resolveLocation` 座標か地名かの判定
- `fzfChoices` と `matchChoice` fzf との受け渡し
- `displayWidth` と `renderTable` CJK・絵文字・ANSI を含む列幅の計算

表のテストは `NO_COLOR` と `process.stdout.isTTY` を明示的に固定します。`bun test` は PTY Sandbox どちらの上でも動くので、この 2 つを素直に読むと期待値が端末によって変わります。

## ソースの地図

| ファイル           | 役割                                                          |
| ------------------ | ------------------------------------------------------------- |
| `index.ts`         | コマンド定義と終了コード                                      |
| `cli.ts`           | 引数解析、ヘルプ、dispatch                                    |
| `table.ts`         | 表示幅の計算と表の組版                                        |
| `location.ts`      | 引数を座標か地名に振り分け                                    |
| `geocode.ts`       | サフィックス展開、候補の順位付け、地名ラベルの組み立て        |
| `cache.ts`         | `$XDG_STATE_HOME` 配下の places.json の読み書きと 30 日の TTL |
| `forecast.ts`      | Forecast API の要求と応答の型付け                             |
| `today.ts`         | `today` の出力                                                |
| `daily.ts`         | `tomorrow` `weekly` `monthly` の出力                          |
| `locate.ts`        | `locate` の出力と fzf の起動                                  |
| `format.ts`        | 温度、風、湿度、日付の表示形式                                |
| `style.ts`         | ANSI 色。TTY と `NO_COLOR` を見る                             |
| `weather.icon.ts`  | 天気コードから絵文字                                          |
| `weather.label.ts` | 天気コードから日本語表示名                                    |
| `http.ts`          | タイムアウトと再試行を持つ fetch                              |
| `version.ts`       | `OTENKI_VERSION` と `package.json` から版を読む               |

## このドキュメントサイト

`docs/` はルートのワークスペース（`apps/*`）に含めていません。独立したパッケージなので、必要なときは `docs/` で作業します。

```sh
cd docs
bun install          # 初回のみ
bun run dev          # 開発サーバー
bun run build        # docs/docs/.vitepress/dist に出力
bun run serve        # 出力をローカルで確認
```

設定は `docs/docs/.vitepress/config.ts`、配色は `docs/docs/.vitepress/theme/custom.css` です。色は CLI の `style.ts` に合わせています。

VitePress のキャッシュは `.vitepress/cache` に出ます。`.gitignore` に入れてあるので、ステージされることはありません。

## 公開

このサイトは GitHub Actions で main へ入るたびにビルドし、GitHub Pages へ配備します。ワークフローは `.github/workflows/deploy-docs.yml` です。

| 項目 | 値 |
| URL | `https://nazozokc.github.io/otenki/` |
| ビルドの base | `/otenki/`（`DOCS_BASE` で渡す） |
| ローカルの base | `/`（`DOCS_BASE` を渡さなければ） |
| Pages の方式 | workflow（branch や Jekyll は使わない） |

`paths` のフィルタがあるので、`docs/` とワークフローのファイルを変えたときだけ走ります。他のファイルだけを変えた場合は起動しません。そのときはワークフローの「Run workflow」から手動で走らせてください。

ワークフローの中で `bun install --frozen-lockfile` を実行するので、`docs/bun.lock` は必ずコミット物です。

```sh
gh api repos/nazozokc/otenki/pages --jq '.build_type'   # workflow になっていること
```
