# 使用的 API

`otenki` は API キーを使わない無償の公開 API を 2 つだけ使います。

| 用途       | エンドポイント                                   |
| ---------- | ------------------------------------------------ |
| 天気       | `https://api.open-meteo.com/v1/forecast`         |
| 地名と座標 | `https://geocoding-api.open-meteo.com/v1/search` |

どちらも Open-Meteo が運営しています。公式ドキュメントは [Forecast API](https://open-meteo.com/en/docs) と [Geocoding API](https://open-meteo.com/en/docs/geocoding-api) です。

## Geocoding API

### 送るパラメータ

| パラメータ | 値     | 意味                   |
| ---------- | ------ | ---------------------- |
| `name`     | 地名   | 索引の接頭辞で照合する |
| `count`    | `10`   | 候補を最大 10 件取る   |
| `language` | `ja`   | 表示名を日本語で返す   |
| `format`   | `json` | JSON で受け取る        |

`countryCode` は意図的に付けません。漢字は中国語と共有し、かなは韓国の地名にも出るため、日本に絞ると上海や Seoul が丸ごと消えます。同名の処理は順位付けに任せます。

### サフィックス展開

地名はそのままでは索引に載らないことがあります。`県 都 府 市 町 村` を両方向に振ります。

```text
函館    → 函館 函館県 函館都 函館府 函館市 函館町 函館村
函館市  → 函館 函館県 函館都 函館府 函館市 函館町 函館村
          函館市 函館市県 函館市都 函館市府 函館市市 函館市町 函館市村
```

末尾にサフィックスがあるときは、剥がした形を先に試します。そのほうが安い失敗だからです。

ラダーは日本語の文字を含む場合だけ組まれます。`Tokyo` に `県` を付ける必要は無いので、そのまま 1 回だけ問い合わせます。

展開した問い合わせは逐次ではなく並行で投げます。逐次だと最悪 14 回分の往復が積み上がるためです。

### 順位付け

結果が重複するものは GeoNames の `id` で潰してから、点数順に並べます。

| feature code        | 点数 | 意味           |
| ------------------- | ---- | -------------- |
| `PPLC`              | 0    | 都府県庁所在地 |
| `PPLA` `PPLA2`      | 1    | 県庁所在地     |
| `PPL` `PPLX` `PPLL` | 2    | その他の集落地 |
| その他の `PPL*`     | 3    | 集落地         |
| `PRL*`              | 4    | 地形名         |
| その他の `P*`       | 5    | その他の地物名 |
| 未指定              | 9    | 種別が不明     |

点が同じなら人口の降順、さらに日本語の表記順です。`横浜` が青森の集落ではなく `横浜市 神奈川県` に落ちるのは、この並び替えのおかげです。

## Forecast API

### 送るパラメータ

座標と `timezone=auto` は常に送ります。`auto` を付けると、座標からタイムゾーンを引いてくれるので、実行マシンの設定に左右されません。

| 変数                            | コマンド                      |
| ------------------------------- | ----------------------------- |
| `temperature_2m`                | `today`                       |
| `apparent_temperature`          | `today`                       |
| `weather_code`                  | `today`                       |
| `wind_speed_10m`                | `today`                       |
| `relative_humidity_2m`          | `today`                       |
| `precipitation`                 | `today`                       |
| `temperature_2m_max` `_min`     | `tomorrow` `weekly` `monthly` |
| `precipitation_sum`             | `tomorrow` `weekly` `monthly` |
| `precipitation_probability_max` | `tomorrow` `weekly` `monthly` |
| `wind_speed_10m_max`            | `tomorrow` `weekly` `monthly` |

`forecast_days` は 1 から 16 に丸めます。API 側が 17 以上を拒否するためです。

## HTTP の扱い

- タイムアウトは 10 秒。切断されない接続でコマンドが待たされ続けるのを防ぐためです
- リトライは 1 回だけ。待ち時間は 250 ms を回数で掛けます
- ネットワークエラー、タイムアウト、5xx は再試行します。4xx は再試行しません。続けても成功しないからです

## キャッシュ

地名の解決結果だけをキャッシュします。天気は毎回取りに行きます。

| 項目 | 値                                                  |
| ---- | --------------------------------------------------- |
| 場所 | `$XDG_STATE_HOME/otenki/places.json`                |
| 代替 | `$HOME/.local/state/otenki/places.json`             |
| 形式 | `{ "地名": { "savedAt": 数字, "results": [...] } }` |
| TTL  | 30 日                                               |

保存時に期限切れのエントリを落とします。読み出しに失敗したら空として扱います。キャッシュが壊れていてもコマンドは止まりません。

## 天気データの中身

予報は Open-Meteo が各国の気象機関から集めた数値です。出典は DWD、NOAA、Meteo-France、ECMWF、英国気象庁、JMA、KMA などです。どの地域を誰が担当しているかは [データソースの表](https://open-meteo.com/en/docs#data_sources) にあります。

## ライセンスとクレジット

- **Open-Meteo** <https://open-meteo.com/> · [ライセンス](https://open-meteo.com/en/licence)
- **GeoNames** <https://www.geonames.org/> · [ライセンス](https://www.geonames.org/about.php)

地名のデータは GeoNames のもので、CC BY 4.0 です。`otenki` 自体は MIT です。

[Open-Meteo への寄付](https://open-meteo.com/en/pricing) 無償での運営は寄付で支えられています。使えるなら寄付を検討してください。
