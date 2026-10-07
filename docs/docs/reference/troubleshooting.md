# トラブルシューティング

## 地名が見つからない

```console
$ bunx otenki-cli today 不存在の地名
✗ "不存在の地名" の場所が見つかりませんでした
```

Geocoding API は索引の綴り方に弱いので、次の順に試します。

1. 市町村名を最後まで書く。`函館` がだめなら `函館市`
2. 都道府県を足す。`横浜` なら `横浜市 神奈川`
3. 県名と市名の順を入れ替える
4. 座標で直接指定する

```sh
bunx otenki-cli today 41.77583 140.73666
```

`locate --all` で候補を全部確認し、`--pick` で選ぶ方法もあります。詳しくは [地名の指定](/guide/location) に書きました。

## 別の自治体が引かれた

同名の地名は複数存在します。順位は feature code、人口、名前の順です。

```console
$ bunx otenki-cli locate 高崎
高崎市 群馬県
36.10333, 139.03375
PPLA · 群馬県 · 日本 · 標高360m
```

`--all` で候補を並べ、意図と違えば `--pick` で選び直します。

## monthly が 16 日で止まる

仕様です。Forecast API が `forecast_days` 17 以上を拒否します。`monthly` は 16 日間の見通しとして実装しています。

過去の天気が欲しい場合は [Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) を直接使ってください。

## fzf が入っていない

```console
$ bunx otenki-cli locate 横浜 --pick
✗ fzf がインストールされていません
```

`--pick` は任意です。使うならパッケージマネージャで入れてください。

```sh
nix profile install nixpkgs#fzf
```

```sh
brew install fzf
```

入れない場合は `--all` で候補を見るか、順位の上位を使います。

## 地名の解決が遅い

地名キャッシュが効いていない可能性があります。初回はサフィックス展開のために複数回のリクエストを並行で投げます。

```sh
bunx otenki-cli cache --clear
```

2 回目以降は `$XDG_STATE_HOME/otenki/places.json` から読むので、短くなります。天気側は毎回ネットワークに出ます。

## 通信に失敗する

```console
$ bunx otenki-cli today 函館
✗ api.open-meteo.com へのリクエストに失敗しました
```

```console
$ bunx otenki-cli today 函館
✗ api.open-meteo.com が HTTP 429 を返しました
```

- リクエストは 10 秒で打ち切ります。タイムアウトしたら 1 回だけ再試行します
- 429 はレート制限です。しばらく待ってから再実行してください
- 400 以外の 4xx は再試行しません。同じエラーが続くなら、プロキシの設定を確認してください

## 色が付かない

色は stdout が TTY のときだけ付きます。パイプへ渡した状態では出ません。

```sh
bunx otenki-cli today 函館 | cat      # 色なし
NO_COLOR=1 bunx otenki-cli today 函館  # 色なし
```

`--json` を使うと、表も色も出力されません。

## キャッシュの場所

```console
$ bunx otenki-cli cache
cache: --clear を指定してください
```

キャッシュの読み書きは自動です。中身を見たいときはファイルを開きます。

```sh
jq 'keys' "${XDG_STATE_HOME:-$HOME/.local/state}/otenki/places.json"
```

読み出しに失敗したキャッシュは空として扱われます。壊れたままでもコマンドは止まりません。消すなら `cache --clear` です。

## バージョンを確認する

```console
$ bunx otenki-cli --version
0.2.4
```

`OTENKI_VERSION` が設定されていれば、それが優先されます。Nix ビルドではパッケージングのときにこの値が焼き込まれます。

## それでも直らないとき

- まず `--version` で、想定したビルドになっているか確認する
- `locate` で座標が正しいか確認する。座標が正しければ、通信か API の問題
- `nix flake check` でテストと型検査が通るか確認する
