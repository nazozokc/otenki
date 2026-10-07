# 開発

## リポジトリの構成

Bun ワークスペースです。CLI は `apps/otenki` にあり、ルートが設定とロックファイルを持ちます。CLI の runtime 依存は 0 で、`bun install` が拾うのは型検査用の `typescript` と `@types/bun`、ビルド用の `tsdown` だけです。

```text
.
├── apps/otenki/       CLI 本体（bin は tsdown の成果物 dist/index.mjs を指す）
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
bun run build               # apps/otenki/dist/index.mjs へバンドル（tsdown）
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

パッケージのビルドと `checks.tests` は `bun install` を走りません。Nix の成果物は `bun build` が bare import を解決してインライン化するため、`node_modules` を要しません。tsdown は `bun run build`、つまり npm に載せるバンドルにだけ使います。

`bun2nix` は PR [#110](https://github.com/nix-community/bun2nix/pull/110) の head を指しています。Bun 1.4 が書く `lockfileVersion: 2` を 2.1.2 は読めないためです。その PR が着いたら、rev を差し替えて 2.1.3 へ上げる予定です。

`nix build .` は git のスナップショットを見るので、未追跡のファイルはビルドに入りません。作業ディレクトリのまま検証したいときは `nix build "path:$PWD"` を渡します。CI が `nix flake check` を素の形で通せるのは、CI ではすべてが commit 済みだからです。

## CI と公開

workflow は 3 本あります。

| workflow          | 起動条件                 | やること                                                       |
| ----------------- | ------------------------ | -------------------------------------------------------------- |
| `ci.yml`          | main への push / PR      | Bun で test・型検査・build、`nix flake check` で全部のチェック |
| `publish.yml`     | release の公開 / 手動    | npm tarball の添付と npm publish                               |
| `deploy-docs.yml` | `docs/**` の push / 手動 | VitePress をビルドして GitHub Pages へ                         |

`ci.yml` の Nix job は `checks.build` `checks.tests` `checks.typecheck` `checks.treefmt` を全部含みます。ローカルで `nix flake check` が green なら CI も green です。

Bun の版は 3 本とも 1.4.2 に固定しています。nixpkgs が bun を上げたら 3 箇所を同時に直してください。

### 公開の流れ

版は **release のタグ**が決めます。`apps/otenki/package.json` の version は `publish.yml` がタグから書いてくれるので、手で bump する手順はありません。Nix ビルドはその package.json を読むので、常に release の版と一致します。

```sh
# 必要な変更を main へ入れる
gh release create 0.1.3 --generate-notes
```

`gh release create` の引数がそのまま版です（先頭の `v` は付けても付けなくても動きます）。タグを別々に push する必要はありません。release を**公開した**時点で `publish.yml` が走り、次の順に処理します。

1. `resolve` タグから版を引く（`v` を剥がし、`0.1.3` のような形でなければそこで落とす）
2. `sync` main の `apps/otenki/package.json` と `bun.lock` をその版に直して `chore(release)` コミットを push する
3. `build` タグの commit を取り出し `sync` と同じ版を当てて、`npm pack` → 型検査とテスト → tarball を実際に起動
4. `release` その release に tarball を添付
5. `npm` `npm publish --provenance`

`bun.lock` も直すのは、`bun install --frozen-lockfile` が workspace の version を照合するからです。package.json の版だけ直すと `lockfile had changes, but lockfile is frozen` で落ちます（`ci.yml` と `checks.typecheck` も同じ install を使います）。書き換えは composite action `.github/actions/sync-version` が担当し、`build` と `npm` と `sync` の 3 つがこれを共有します。

`NPM_TOKEN` が無いリポジトリでは npm の job だけが飛ばれ、tarball は添付されます。release notes は `--generate-notes` が書いたままです。workflow は書き換えません。

release を手で作った場合も `release: published` で起動するので同じです。逆に、タグの push だけでは走りません（`gh release create` がタグも push するため、両方を受けると 1 回の release で 2 本走って 2 本目の `npm publish` が必ず「その版は既に存在する」で落ちます）。

同じタグを再実行したいときは Actions タブの `workflow_dispatch` を使います。main ではなく **タグの commit** を取り直すので、後から drift した版が publish されることはありません。

npm には `files` で `dist` と `README.md` だけを載せています。`test/` や `tsconfig.json` は入りません。bin は `dist/index.mjs` を指し、`prepack` が `bun run build`（tsdown）でそれを書き出します。shebang `#!/usr/bin/env bun` は tsdown が出力に残し、実行権も付けるので、利用側に必要なのは Bun だけです。

## テスト

```text
apps/otenki/test/format.test.ts    数値と日付の表示
apps/otenki/test/geocode.test.ts   サフィックス展開と順位付け
apps/otenki/test/fzf.test.ts       fzf の候補行と選択の突き合わせ
apps/otenki/test/location.test.ts  座標と地名の振り分け
apps/otenki/test/table.test.ts     表示幅と表の組版
apps/otenki/test/cache.test.ts     キャッシュの有効期限と形状検証
apps/otenki/test/sanitize.test.ts  制御シーケンスの除去
apps/otenki/test/cli.test.ts       引数解析、ヘルプ、終了コード
```

ネットワークは叩きません。対象のロジックは純関数とローカルファイルの読み書きだけです。

- `candidateQueries` 地名から作る問い合わせの一覧
- `rankCandidates` feature code → 人口 → 名前 の並び替え
- `resolveLocation` 座標か地名かの判定
- `fzfChoices` と `matchChoice` fzf との受け渡し
- `displayWidth` と `renderTable` CJK・絵文字・ANSI を含む列幅の計算
- `sanitizeText` 外来文字列からの制御シーケンス除去
- `cachedGeocode` 不正なキャッシュエントリをミスとして扱うこと

表のテストは `NO_COLOR` と `process.stdout.isTTY` を明示的に固定します。`bun test` は PTY Sandbox どちらの上でも動くので、この 2 つを素直に読むと期待値が端末によって変わります。

## ソースの地図

| ファイル           | 役割                                                          |
| ------------------ | ------------------------------------------------------------- |
| `index.ts`         | コマンド定義と終了コード                                      |
| `cli.parse.ts`     | コマンド定義、`UsageError`、引数解析                          |
| `cli.help.ts`      | ヘルプと usage の組み立て                                     |
| `cli.dispatch.ts`  | コマンドの選択、実行、エラー報告                              |
| `width.ts`         | 端末セル幅の計算（CJK・絵文字・ANSI 除去）                    |
| `table.ts`         | 表の組版                                                      |
| `location.ts`      | 引数を座標か地名に振り分け                                    |
| `geocode.ts`       | サフィックス展開、候補の順位付け、地名ラベルの組み立て        |
| `sanitize.ts`      | 外来文字列からの制御シーケンス除去                            |
| `cache.ts`         | `$XDG_STATE_HOME` 配下の places.json の読み書きと 30 日の TTL |
| `forecast.ts`      | Forecast API の要求と応答の型付け                             |
| `today.ts`         | `today` の出力                                                |
| `daily.ts`         | `tomorrow` `weekly` `monthly` の出力                          |
| `locate.ts`        | `locate` の出力                                               |
| `fzf.ts`           | fzf の候補行、選択の突き合わせ、プロセス起動                  |
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
