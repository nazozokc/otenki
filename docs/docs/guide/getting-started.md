# はじめに

`otenki` は、引数を地名か座標にするだけで天気予報を返すコマンドラインツールです。ビルド工程はありません。TypeScript のソースをそのまま Bun で実行します。

## 必要なもの

- [Bun](https://bun.sh) 1.4 以上（ソースから実行する場合）
- Linux / macOS。Bun が動く環境ならどの OS でも動きます

Nix を使う場合は Bun を用意する必要はありません。依存は flake が解決します。

## インストール

### Nix

チェックアウトした状態で、そのまま実行できます。

```sh
nix run . -- today 函館
```

恒久的に入れるならプロファイルへ。

```sh
nix profile install .
```

### ソースから

Bun ワークスペースなので、依存のインストールは 1 コマンドです。

```sh
bun install
```

リポジトリ内で動かすだけなら、これで十分です。

```sh
bun run start -- today 函館
```

`otenki` という名前で呼びたい場合は、リンクを張ります。

```sh
(cd apps/otenki && bun link)
```

## 最初の一回

```console
$ otenki today 函館
☀️ 13.8°C  函館市 北海道
2026-10-04 22:45 · 快晴 · 体感 12.1°C · 風 9.1 km/h · 湿度 72% · 降水 0.0 mm
```

地名で足りるなら、座標への変換は自動で走ります。

```console
$ otenki today 横浜市 神奈川
🌤️ 24.1°C  横浜市 神奈川県
```

## コマンドの一覧

よく使うのはこの 6 つです。

| コマンド   | 内容                 |
| ---------- | -------------------- |
| `today`    | 現在の天気           |
| `tomorrow` | 明日の予報           |
| `weekly`   | 7 日間の予報         |
| `monthly`  | 16 日間の予報        |
| `locate`   | 地名を座標に解決する |
| `cache`    | 地名キャッシュの操作 |

オプションまで含めた全仕様は [コマンド一覧](/reference/commands) を参照してください。

## シェルに入れておく

毎朝の定石化に使うなら、エイリアスで足ります。

```sh
# ~/.bashrc や fish の設定
alias tenki='otenki today'
alias tenki_w='otenki weekly'
```

地点を固定したい場合は、座標を環境変数に持ちます。

```sh
export HOME_TOKYO="35.6895 139.6917"
```

```sh
otenki today $HOME_TOKYO
```

## 次に読む

- 地名の指定で迷ったら → [地名の指定](/guide/location)
- スクリプトに組み込むなら → [スクリプトから使う](/guide/scripting)
- エラーが出たときは → [トラブルシューティング](/reference/troubleshooting)
