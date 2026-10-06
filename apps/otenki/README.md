# otenki

A terminal weather CLI. Give it a place name — a Japanese prefecture, a city, or
anything else on earth — and it resolves the coordinates and prints the forecast.

```console
$ otenki today 函館
☀️ 13.8°C  函館市 北海道
2026-10-04 22:45 · 快晴 · 体感 12.1°C · 風 9.1 km/h · 湿度 72% · 降水 0.0 mm

$ otenki weekly 横浜
横浜市 神奈川県 — 7日間予報
date        icon  weather                    temp  precip  prob       wind
──────────────────────────────────────────────────────────────────────────
10-05 (火)  🌦️    晴れ時々くもり  22.4°C ~ 16.1°C  0.4 mm   30%  12.3 km/h
```

## Install

**Bun is required.** The `bin` is a single file bundled by tsdown, and its
shebang asks for `bun` on `PATH`.

```sh
bunx otenki today 函館
```

or install it:

```sh
npm install -g otenki     # needs bun on PATH
```

If you have Nix, the flake is the better route and needs no Bun:

```sh
nix run . -- today 函館
nix profile install .
```

## Commands

| Command    | Description                                    |
| ---------- | ---------------------------------------------- |
| `today`    | current conditions                             |
| `tomorrow` | tomorrow's forecast                            |
| `weekly`   | 7 day forecast                                 |
| `monthly`  | 16 day forecast (the API caps at 16)           |
| `locate`   | resolve a place name to latitude and longitude |
| `cache`    | inspect or drop the place name cache           |

Every weather command accepts a location as a place name or a coordinate pair,
and every command takes `--json` for scripting. Output is coloured on a TTY and
respects `NO_COLOR`.

Built on the free, key-less [Open-Meteo](https://open-meteo.com/) APIs, with place
names from [GeoNames](https://www.geonames.org/).

Documentation: <https://nazozokc.github.io/otenki/>
Source: <https://github.com/nazozokc/otenki>

## Licence

MIT
