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

Full documentation: <https://nazozokc.github.io/otenki/> — sources in
[`docs/`](docs/), built with VitePress (`cd docs && bun run dev`).

## Install

With Nix, from a checkout:

```sh
nix run . -- today 函館     # run without installing
nix profile install .       # or install it onto your profile
```

From source:

```sh
bun install
bun run start -- <command>              # run from source
(cd apps/otenki && bun link)            # or: put `otenki` on your PATH
```

Requires [Bun](https://bun.sh) 1.4+. There is no build step; the `bin` entry runs
the TypeScript sources directly.

## Commands

| Command    | Description                                    |
| ---------- | ---------------------------------------------- |
| `today`    | current conditions                             |
| `tomorrow` | tomorrow's forecast                            |
| `weekly`   | 7 day forecast                                 |
| `monthly`  | 16 day forecast (see the note below)           |
| `locate`   | resolve a place name to latitude and longitude |
| `cache`    | inspect or drop the place name cache           |

Every weather command accepts a location either as a place name or as a
coordinate pair, and every command takes `--json` for scripting.

```sh
otenki today 横浜            # by name
otenki today 横浜市 神奈川     # name plus prefecture, still one string
otenki today 35.69 139.69    # latitude longitude
otenki today 35.69,139.69    # same, comma separated
otenki locate 横浜 --all     # every geocoder candidate, not just the best
otenki locate 横浜 --pick    # choose between candidates with fzf
otenki cache --clear         # forget every cached lookup
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

Output is coloured on a TTY and respects `NO_COLOR`, so piping into another tool
gives plain text.

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

| Query    | Bare query | Notes                                       |
| -------- | ---------- | ------------------------------------------- |
| `函館`   | no hits    | indexed as `函館市`                         |
| `仙台市` | no hits    | indexed as `仙台`                           |
| `横浜`   | wrong hit  | resolves to a 4,412 person hamlet in Aomori |
| `高崎`   | wrong hit  | all five hits sit outside Gunma             |
| `東京都` | ok         | —                                           |

`locate` walks the suffixes in both directions (`県 都 府 市 町 村`, appended and
stripped), issues the variants concurrently, and ranks the pooled results by
GeoNames feature code and then population. That is what turns `横浜` into
`横浜市 神奈川県` and `高崎` into `高崎市 群馬県`.

Resolved names are cached for 30 days under `$XDG_STATE_HOME/otenki/places.json`,
which takes a repeat lookup from about 1.5 s to about 0.08 s.

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
- **Ambiguous names need `--pick`.** `横浜` also exists in Aomori, Fukuoka and
  Kumamoto. Ranking picks the most populous match, which is usually right; use
  `--all` to see the rest or `--pick` to choose. `fzf` is optional — without it
  `--pick` falls back to the best match.

## Development

The repository is a Bun workspace: `apps/otenki` holds the CLI, and the root owns
the shared config, `bun.lock` and the Nix flake.

```sh
bun test                    # unit tests, no network
bun run typecheck           # tsc --noEmit
bun run build               # bundle to apps/otenki/dist/otenki.js
bun run start -- <cmd>      # run the CLI in dev mode
nix flake check             # build, tests and typecheck inside Nix
nix fmt                     # nixfmt + prettier
```

Each root script fans out with `bun run --filter otenki …`; run them from
`apps/otenki` directly when you want a single app.

After changing dependencies, refresh the Nix dependency definition:

```sh
bun install && nix run .#update
```

The `bun2nix` input is pinned to the head of
[PR #110](https://github.com/nix-community/bun2nix/pull/110), "Accept bun.lock
versions 2 and 3", because bun 1.4 writes `lockfileVersion: 2` and the 2.1.2
release cannot read it. Bump the rev once that lands.

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
