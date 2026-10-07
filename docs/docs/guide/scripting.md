# スクリプトから使う

## 生 JSON

`today` `tomorrow` `weekly` `fortnight` `locate` はすべて `--json` を受け付けます。色も表の罫線も出ないので、他のコマンドへそのまま渡せます。`--json` は TTY でもパイプでも同じ形なので、端末の設定に左右されません。

```console
$ bunx otenki-cli today 函館 --json
{
  "location": {
    "latitude": 41.77583,
    "longitude": 140.73666,
    "label": "函館市 北海道"
  },
  "time": "2026-10-04T22:45",
  "temperature": 13.8,
  "apparentTemperature": 12.1,
  "weatherCode": 0,
  "windSpeed": 9.1,
  "humidity": 72,
  "precipitation": 0.0
}
```

`location` には、入力が地名なら解決後の名前と座標が、入力が座標ならその座標が入ります。

`weekly` と `fortnight` は `days` 配列です。

```console
$ bunx otenki-cli weekly 横浜 --json
{
  "location": { "latitude": 35.43333, "longitude": 139.65, "label": "横浜市 神奈川県" },
  "days": [
    {
      "time": "2026-10-05",
      "weatherCode": 2,
      "temperatureMax": 22.4,
      "temperatureMin": 16.1,
      "precipitationSum": 0.4,
      "precipitationProbabilityMax": 30,
      "windSpeedMax": 12.3
    }
  ]
}
```

`tomorrow` は 1 日分なので、`days` ではなく日付のフィールドが直接並びます。

`locate --json` は仕様が違います。Geocoding API の返り値をそのまま出力します。キーは snake_case です。`--all` を付けると 1 件ではなく配列になりますが、`--pick` と組み合わせたときは選んだ 1 件だけが出ます。

## jq と組む

気温だけ取り出す。

```sh
bunx otenki-cli today 函館 --json | jq -r '.temperature'
```

明日の最高気温と降水確率を並べる。

```sh
bunx otenki-cli tomorrow 横浜 --json | jq '"\(.temperatureMax)°C / \(.precipitationProbabilityMax)%"'
```

7 日間で一番降る日を探す。

```sh
bunx otenki-cli weekly 横浜 --json \
  | jq -r '.days | max_by(.precipitationSum) | "\(.time) \(.precipitationSum)mm"'
```

天気が悪い日だけを列挙する。

```sh
bunx otenki-cli weekly 横浜 --json \
  | jq -r '.days[] | select(.weatherCode >= 51) | "\(.time) \(.weatherCode)"'
```

## 色と TTY

色は TTY のときだけ付きます。パイプやリダイレクト就先では無効になるので、同じコマンドが端末でもファイルでも同じ結果になります。

```sh
bunx otenki-cli today 函館 > today.txt      # 色なし
NO_COLOR=1 bunx otenki-cli today 函館       # 明示的に色なし
```

`NO_COLOR` は空でない値を定義した時点で有効になります。値を空にして定義しても有効ですが、`unset` すると元に戻ります。

## 終了コード

- `0` 正常終了
- `1` エラー。メッセージは stderr に出ます

```sh
if ! out=$(bunx otenki-cli today 函館 --json 2>/dev/null); then
  echo "otenki が失敗しました: $out" >&2
  exit 1
fi
```

地名が見つからない場合も、座標の指定が不正な場合も、終了コードは `1` です。

## fzf と組み合わせる

`locate --pick` はすでに fzf を呼びます。`--all` との組み合わせで、同じ地名から好きな場所を選べます。

```sh
# 候補をそのまま fzf へ渡す
bunx otenki-cli locate 横浜 --all
```

## タイムゾーン

日時の解釈はすべて Open-Meteo 側に任せています。リクエストには `timezone=auto` を付けるので、座標のある地域の現地時刻で返ってきます。実行マシンの設定には左右されません。

`--json` の `time` は現地時刻の文字列（`2026-10-04T22:45`）です。タイムゾーンの別名が付かないので、パースするときは座標側のゾーンとして扱ってください。
