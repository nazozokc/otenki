# otenki

A terminal weather CLI. Give it a place name — a Japanese prefecture, a city, or
anything else on earth — and it resolves the coordinates and prints the forecast.

```console
$ otenki locate 函館
函館市 北海道
41.77583, 140.73666
PPLA2 · 北海道 · 日本 · 標高5m

$ otenki today 函館
☀️ 13.8°C  函館市 北海道
2026-10-04 22:45 · 体感 12.1°C · 風 9.1 km/h · 湿度 72% · 降水 0.0 mm
```

## Install

```sh
bun install
bun link          # or: bun run src/index.ts <command>
```

Requires [Bun](https://bun.sh). There is no build step; the `bin` entry runs
the TypeScript sources directly.

## Commands

| Command   | Description                                        |
| --------- | -------------------------------------------------- |
| `today`   | current conditions                                 |
| `tomorrow`| tomorrow's forecast                                |
| `weekly`  | 7 day forecast                                     |
| `monthly` | 16 day forecast (see the note below)               |
| `locate`  | resolve a place name to latitude and longitude     |

Every command accepts a location either as a place name or as a coordinate pair,
and every command takes `--json` for scripting.

```sh
otenki today 横浜            # by name
otenki today 横浜市 神奈川     # name plus prefecture, still one string
otenki today 35.69 139.69    # latitude longitude
otenki today 35.69,139.69    # same, comma separated
otenki locate 横浜 --all     # every geocoder candidate, not just the best
```

```console
$ otenki locate --json 横浜
{
  "id": 1848352,
  "name": "横浜市",
  "latitude": 35.43333,
  "longitude": 139.65,
  "elevation": 21,
  "feature_code": "PPLA",
  "admin1": "神奈川県",
  "country": "日本",
  "population": 3777491
}
```

## How a lookup works

```
otenki today 函館
  │
  ├─ Geocoding API ── 函館 / 函館県 / 函館都 / 函館府 / 函館市 / 函館町 / 函館村
  │                          ranked by feature code, then population
  │                   → 41.77583, 140.73666
  │
  └─ Weather API ──── current weather for those coordinates
                   → ☀️ 13.8°C
```

The geocoder is the awkward half. It indexes one name per GeoNames record and
matches on a prefix, so whether a Japanese place resolves depends on how its
suffix happens to be spelled in the index:

| Query     | Bare query | Notes                                        |
| --------- | ---------- | -------------------------------------------- |
| `函館`    | no hits    | indexed as `函館市`                          |
| `仙台市`  | no hits    | indexed as `仙台`                            |
| `横浜`    | wrong hit  | resolves to a 4,412 person hamlet in Aomori  |
| `高崎`    | wrong hit  | all five hits sit outside Gunma              |
| `東京都`  | ok         | —                                            |

`locate` walks the suffixes in both directions (`県 都 府 市 町 村`, appended and
stripped), issues the variants concurrently, and ranks the pooled results by
GeoNames feature code and then population. That is what turns `横浜` into
`横浜市 神奈川県` and `高崎` into `高崎市 群馬県`.

### Known gaps

- **`monthly` is capped at 16 days.** The Forecast API rejects
  `forecast_days` above 16, so this command is a 16 day outlook, not a calendar
  month. For past weather, use the [Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api).
- **41 of the 47 prefectures resolve from their bare name.** The remaining six
  — 岩手 群馬 愛知 滋賀 愛媛 高知 — have no same-named municipality, so no suffix
  exists to append. Five work under their prefectural capital: `盛岡市`,
  `前橋市`, `名古屋市`, `大津市`, `松山市`.
- **`高知` is unreachable by name entirely**, including `高知市` and `高知県`. Pass
  coordinates instead: `otenki today 32.98880 132.55970`.
- **Ambiguous names are not interactive.** `locate` shows every candidate with
  `--all`, but there is no fuzzy prompt to pick between them.

## Special Thanks

This project stands on two free, public, no-key APIs. Both are operated by
[Open-Meteo](https://open-meteo.com/) and are usable without an account.

- **[Weather Forecast API](https://open-meteo.com/en/docs)** ·
  endpoint `https://api.open-meteo.com/v1/forecast`
- **[Geocoding API](https://open-meteo.com/en/docs/geocoding-api)** ·
  endpoint `https://geocoding-api.open-meteo.com/v1/search`

The forecast is stitched from the national weather services that feed Open-Meteo
— DWD, NOAA, Météo-France, ECMWF, the UK Met Office, JMA, KMA, and others. See
the [data sources table](https://open-meteo.com/en/docs#data_sources) for who
covers which region.

Geocoding results are **[GeoNames](https://www.geonames.org)** data, licensed
under CC BY 4.0. Country flags come from
[HatScripts/circle-flags](https://github.com/HatScripts/circle-flags).

- **Open-Meteo** — <https://open-meteo.com/> · [licence](https://open-meteo.com/en/licence)
- **GeoNames** — <https://www.geonames.org/> · [licence](https://www.geonames.org/about.php)

If you find this useful, please consider [supporting Open-Meteo](https://open-meteo.com/en/pricing);
it is free for non-commercial use and runs on donations.

## Licence

MIT