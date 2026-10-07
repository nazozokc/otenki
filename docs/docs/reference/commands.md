# コマンド一覧

すべてのコマンドは共通で次のオプションを受け付けます。

| オプション      | 内容             |
| --------------- | ---------------- |
| `-V, --version` | バージョンを表示 |
| `-h, --help`    | ヘルプを表示     |
| `--json`        | 生 JSON を出力   |

`-V` は Nix ビルドで焼き込まれた `OTENKI_VERSION` を最優先し、無ければ `package.json` の `version` を読みます。

## today

現在の天気。

```sh
bunx otenki-cli today <location...>
```

2 行で出します。表の 1 行が上の 2 行と同じ数字を繰り返していたので、桁の箱は使っていません。

```console
$ bunx otenki-cli today 函館
☀️ 13.8°C  函館市 北海道
2026-10-04 22:45 · 快晴 · 体感 12.1°C · 風 9.1 km/h · 湿度 72% · 降水 0.0 mm
```

| オプション | 内容           |
| ---------- | -------------- |
| `--json`   | 生 JSON を出力 |

## tomorrow

明日の予報。内部的には 2 日分を要求し、2 日目を使います。

```sh
bunx otenki-cli tomorrow <location...>
```

```console
$ bunx otenki-cli tomorrow 横浜
🌤️ 22.4°C ~ 16.1°C  横浜市 神奈川県
10-06 (水) · 晴れ時々くもり · 降水 0.4 mm (確率 30%) · 風 12.3 km/h
```

| オプション | 内容           |
| ---------- | -------------- |
| `--json`   | 生 JSON を出力 |

## weekly

7 日間の予報。

```sh
bunx otenki-cli weekly <location...>
```

罫線はヘッダーの真下に入る 1 行だけです。列は名前・日付が左、数字が右に寄るので、桁がそろって読み比較できます。

```console
$ bunx otenki-cli weekly 横浜
横浜市 神奈川県 — 7日間予報
date        icon  weather                    temp  precip  prob       wind
──────────────────────────────────────────────────────────────────────────
10-05 (火)  🌦️    晴れ時々くもり  22.4°C ~ 16.1°C  0.4 mm   30%  12.3 km/h
10-06 (水)  ☁️    曇れ            17.5°C ~ 21.1°C  0.0 mm   27%  11.9 km/h
```

表の幅は列の内容から決まります。端末幅で切り詰めたり列を落としたりはしません。狭い端末では右にはみ出します。

| オプション | 内容           |
| ---------- | -------------- |
| `--json`   | 生 JSON を出力 |

## fortnight

2 週間（14 日）の予報。

```sh
bunx otenki-cli fortnight <location...>
```

```console
$ bunx otenki-cli fortnight 横浜
横浜市 神奈川県 — 14日間予報
date        icon  weather                    temp  precip  prob       wind
──────────────────────────────────────────────────────────────────────────
10-07 (水)  ☁️    曇り            17.8°C ~ 22.8°C  0.0 mm   70%  13.6 km/h
10-08 (木)  🌤️    晴れ            15.9°C ~ 22.9°C  0.0 mm    0%   9.5 km/h
```

14 日は 2 週間分です。Forecast API の上限は 16 日で、`forecast_days` を 17 以上にすると拒否されます。

過去の天気が必要な場合は [Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) を直接使ってください。

| オプション | 内容           |
| ---------- | -------------- |
| `--json`   | 生 JSON を出力 |

## locate

地名を座標に解決します。天気は引きません。

```sh
bunx otenki-cli locate <place...>
```

```console
$ bunx otenki-cli locate 横浜
横浜市 神奈川県
35.43333, 139.65000
PPLA · 神奈川県 · 日本 · 標高21m
```

`--all` を付けると候補が全部表に出ます。順位の上から並ぶので、先頭が既定の候補です。

```console
$ bunx otenki-cli locate 横浜 --all
横浜市 神奈川県
35.43333, 139.65000
PPLA · 神奈川県 · 日本 · 標高21m

name              admin1         lat        lon  feature          pop
─────────────────────────────────────────────────────────────────────
横浜市            神奈川県  35.43333  139.65000  PPLA     3,777,491人
横浜              青森県    41.08333  141.25000  PPL          4,412人
横浜              福岡県    33.58608  130.26155  PPLX               -
横浜市児童遊園地  神奈川県  35.43648  139.57835  PRK                -
```

人口が不明な候補は `-` になります。

| オプション | 内容                                                           |
| ---------- | -------------------------------------------------------------- |
| `--all`    | 候補をすべて表で表示する                                       |
| `--pick`   | fzf で候補を選ぶ。fzf が無ければエラー                         |
| `--json`   | 生 JSON を出力。`--all` なら配列、`--pick` 併用時は選んだ 1 件 |

`--pick` は候補が 1 件だけのときは呼びません。`fzf` で Ctrl-C を押すと、順位の一番上の場所に戻ります。

表の列は `name` `admin1` `lat` `lon` `feature` `pop` です。`lat` と `lon` は数値なので右に寄り、`pop` の桁もそろいます。

## cache

地名キャッシュの操作。現状は `--clear` のみです。

```sh
bunx otenki-cli cache --clear
```

```console
$ bunx otenki-cli cache --clear
キャッシュを消去しました
```

`--clear` を付けない場合はエラーになり、`Usage:` を添えて終了コードは `1` です。

保存先は `$XDG_STATE_HOME/otenki/places.json`、保存期間は 30 日です。詳しくは [地名の指定](/guide/location) を参照してください。

## エラー

エラーは stderr に `✗ ` を付けて出力され、終了コードは `1` です。

```console
$ bunx otenki-cli today mars
✗ "mars" の場所が見つかりませんでした
```

よくあるメッセージと対処は [トラブルシューティング](/reference/troubleshooting) にまとめました。
