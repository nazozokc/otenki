---
layout: home
hero:
  name: otenki
  text: 端末から天気を読む
  tagline: 地名か座標を渡すだけで予報が引ける CLI。API キー不要、ビルド不要、無償の公開 API だけを使う。
  image:
    src: /hero.svg
    alt: otenki today と otenki weekly の出力例
  actions:
    - theme: brand
      text: はじめに
      link: /guide/getting-started
    - theme: alt
      text: コマンド一覧
      link: /reference/commands
    - theme: alt
      text: GitHub
      link: https://github.com/nazozokc/otenki
features:
  - title: API キーは要らない
    details: 天気と地名はどちらも無償の公開 API。アカウント登録も課金設定も要らない。
  - title: 地名だけで引ける
    details: 函館も横浜市 神奈川も、そのまま 1 引数で通る。日本語のサフィックス展開とランキングで自治体を当てる。
  - title: 今から 16 日先まで
    details: today / tomorrow / weekly / monthly の 4 コマンド。API の上限が 16 日なので、monthly は 16 日間と明記している。
  - title: 端末前提
    details: TTY では色付き、パイプへ渡せば素の色。NO_COLOR も尊重するので、そのままスクリプトに使える。
---

## インストール

```sh
nix run . -- today 函館          # インストールせずに実行
nix profile install .            # プロファイルに登録
```

```sh
bun install
bun run start -- today 函館      # ソースから実行
```

## 使う

```sh
otenki today 函館                # 現在の天気
otenki tomorrow 横浜             # 明日の予報
otenki weekly 35.69 139.69       # 7 日間。座標でもよい
otenki monthly 東京              # 16 日間
otenki locate 横浜 --all         # 同名地の候補を全部見る
otenki locate 横浜 --pick        # fzf で選ぶ
otenki today 横浜 --json         # スクリプト用に生 JSON
```

## 動く仕組み

地名から天気までを、2 回の API 呼び出しで片付ける。キャッシュが効くと 2 回目以降は 1.5 秒から 0.08 秒になる。

```text
otenki today 函館
  │
  ├─ Geocoding API ── 函館 / 函館県 / 函館都 / 函館府 / 函館市 / 函館町 / 函館村
  │                          feature code → 人口 の順で並べる
  │                   → 41.77583, 140.73666
  │
  └─ Forecast API ──── その座標の現在天気（timezone=auto）
                   → ☀️ 13.8°C
```

## 前提と制約

- `monthly` は 16 日で止まる。Forecast API が `forecast_days` 17 以上を拒否するため。
- 47 都道府県のうち 41 個は素の県名で引ける。残りは県庁所在地の市名で。
- `高知` は地名で引けない。`otenki today 32.98880 132.55970` と座標を渡す。
- 同名の地名は `横浜` のように複数ある。`--all` で確認し、`--pick` で選ぶ。

詳しくは [コマンド一覧](/reference/commands) と [トラブルシューティング](/reference/troubleshooting) に書いた。
