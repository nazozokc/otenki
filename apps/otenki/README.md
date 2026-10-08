# otenki

A terminal weather CLI. Give it a place name — a Japanese prefecture, a city, or
anything else on earth — and it resolves the coordinates and prints the forecast.

```console
$ otenki today 函館
函館市 北海道
☀️ 快晴  13.8℃  体感 12.1℃
風 9.1 km/h · 湿度 72% · 降水 0.0 mm · 2026-10-04 22:45

$ otenki weekly 横浜
横浜市 神奈川県 — 7日間予報
日付        天気                 最低    最高    降水  確率       風速
──────────────────────────────────────────────────────────────────────
10-07 (水)  ☁️ 曇り            17.9℃  23.5℃  0.0 mm   69%  13.6 km/h
10-08 (木)  🌤️ 晴れ            16.1℃  23.1℃  0.0 mm    0%   9.6 km/h
```

## Install

**Bun is required.** The `bin` is a single file bundled by tsdown, and its
shebang asks for `bun` on `PATH`.

```sh
bunx otenki-cli today 函館
```

or install it:

```sh
npm install -g otenki-cli     # needs bun on PATH
```

If you have Nix, the flake is the better route and needs no Bun:

```sh
nix run . -- today 函館
nix profile install .
```

## Commands

| Command     | Description                                    |
| ----------- | ---------------------------------------------- |
| `today`     | current conditions                             |
| `tomorrow`  | tomorrow's forecast                            |
| `weekly`    | 7 day forecast                                 |
| `fortnight` | 14 day forecast (two weeks)                    |
| `locate`    | resolve a place name to latitude and longitude |
| `cache`     | inspect or drop the place name cache           |

Every weather command accepts a location as a place name or a coordinate pair,
and every command takes `--json` for scripting. Output is coloured on a TTY and
respects `NO_COLOR`.

Each weather command also prints the exact API URL it used to stderr
(`API: https://api.open-meteo.com/v1/forecast?...`), so the link is clickable
and piped stdout stays clean.

Defaults live in `$XDG_CONFIG_HOME/otenki/config.json` (falling back to
`~/.config/otenki/config.json`): a default location, the command a bare
`otenki` runs, colour, units (`°F` / `mph` / `in`) and the forecast length for
`weekly` and `fortnight`. Command-line arguments beat the config, and
`--no-config` skips the file:

```json
{ "location": "函館", "command": "today" }
```

Built on the free, key-less [Open-Meteo](https://open-meteo.com/) APIs, with place
names from [GeoNames](https://www.geonames.org/).

Documentation: <https://nazozokc.github.io/otenki/>
Source: <https://github.com/nazozokc/otenki>

## Licence

MIT
