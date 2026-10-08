# 設定ファイル

設定ファイルは任意です。置かなければ、これまで通り引数だけで動きます。

保存先は XDG 準拠で、次の順に解決されます。

1. `$XDG_CONFIG_HOME/otenki/config.json`（`XDG_CONFIG_HOME` が絶対パスのとき）
2. `~/.config/otenki/config.json`

`XDG_CONFIG_HOME` が未設定か相対パスのときは 2 を使います。

## 書き方

```json
{
  "location": "函館",
  "command": "today",
  "color": "auto",
  "units": "metric",
  "days": 7
}
```

すべてのキーは任意です。

| キー       | 型                           | 内容                                      |
| ---------- | ---------------------------- | ----------------------------------------- |
| `location` | 文字列 または `[緯度, 経度]` | 地点の引数を省略したときの既定の地点      |
| `command`  | 文字列                       | `otenki` だけを実行したときに走るコマンド |
| `color`    | `auto` / `always` / `never`  | 色付けの方針。既定は `auto`               |
| `units`    | `metric` / `imperial`        | 単位系。既定は `metric`（°C・km/h・mm）   |
| `days`     | 1〜16 の整数                 | `weekly` `fortnight` の予報日数           |

```json
{
  "location": [35.69, 139.69],
  "command": "weekly",
  "units": "imperial",
  "days": 5
}
```

`location` の文字列は地名（`函館` `横浜市 神奈川`）でも座標（`"35.69,139.69"`）でも構いません。地名の場合は実行ごとにジオコーディングされ、結果は 30 日間キャッシュされます。

## 動き

### コマンドを省略したとき

`command` を置くと、コマンド名なしの実行がそのコマンドになります。フラグから始める実行も同じです。

```sh
otenki                   # otenki today と同じ
otenki --json            # otenki today --json と同じ
```

`command` が無ければ、引数なしの実行はヘルプを表示して終了コード `1` を返します。

### 地点を省略したとき

`location` を置くと、地点の引数を書かずに済みます。引数を書いた場合はそちらが勝ちます。

```sh
otenki today             # config の location で引く
otenki today 東京        # 明示した引数が優先
```

### 単位

`units: "imperial"` は表示だけでなく API への問い合わせそのものを変えます（`temperature_unit` `wind_speed_unit` `precipitation_unit`）。表示は `°F` `mph` `in` になり、降水量は小数 2 桁です。

`--json` は API の生の数値をそのまま返すので、単位のラベルも変換もありません。

### 色

`color: "always"` と `never` は TTY の判定と `NO_COLOR` より優先します。`auto` と未設定はこれまで通り、TTY と `NO_COLOR` で決めます。

### 予報日数

`days` は `weekly`（既定 7 日）と `fortnight`（既定 14 日）に効きます。`today` `tomorrow` は対象外です。上限は Forecast API の 16 日で、範囲外はエラーになります。

## 優先順位

引数が最も優先し、次に設定ファイル、残りは既定値です。

```sh
otenki weekly 函館              # 引数が勝つ
otenki --no-config today 東京   # 設定ファイルを読まない
```

`--no-config` は引数のどこに書いても効きます。`--` の後ろは地点名として扱われるので、`--no-config` という名前の場所も壊れません。

## エラー

設定ファイルが読めない・JSON が壊れている・値が範囲外のときは、パス付きのメッセージを出して終了コード `1` です。推測で続行せず、書いた人に知らせます。

```console
$ otenki today
✗ config: /home/you/.config/otenki/config.json: unknown key 'colo'
```

設定ファイルを疑わないときは `--no-config` を付ければ、読まずに実行できます。
