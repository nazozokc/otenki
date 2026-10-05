import { defineConfig } from "vitepress";

/**
 * otenki ドキュメントサイト。
 *
 * 配色は CLI 側 (apps/otenki/src/style.ts) から持ってきた。
 * brand = temperature のオレンジ、accent = heading のブルー。
 */
export default defineConfig({
  lang: "ja-JP",
  title: "otenki",
  titleTemplate: ":title | otenki",
  description:
    "地名か座標を渡すだけで天気予報が引ける、ターミナル用の天気 CLI。Open-Meteo の無料 API のみを使用。",

  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: false,

  // ローカルは指定なしで / に置く。Pages へ出すときは project site の
  // パスなので /otenki/ を DOCS_BASE で渡す。CI 側は workflow が設定する。
  base: process.env.DOCS_BASE ?? "/",

  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
    ["meta", { name: "theme-color", content: "#12141c" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "otenki" }],
    [
      "meta",
      {
        property: "og:description",
        content:
          "地名か座標を渡すだけで天気予報が引ける、ターミナル用の天気 CLI。",
      },
    ],
  ],

  // `console` / `sh` は実際は bash なので、ハイライトの言語だけ bash に寄せる。
  // コードブロックのラベルも bash と表示されるが、それは正しいので隠さない。
  markdown: {
    langAlias: {
      console: "bash",
      sh: "bash",
      shell: "bash",
      zsh: "bash",
    },
    lineNumbers: false,
  },

  themeConfig: {
    logo: { src: "/logo.svg", alt: "otenki" },
    siteTitle: "otenki",

    nav: [
      {
        text: "ガイド",
        link: "/guide/getting-started",
        activeMatch: "/guide/",
      },
      {
        text: "リファレンス",
        link: "/reference/commands",
        activeMatch: "/reference/",
      },
      { text: "GitHub", link: "https://github.com/nazozokc/otenki" },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "ガイド",
          items: [
            { text: "はじめに", link: "/guide/getting-started" },
            { text: "地名の指定", link: "/guide/location" },
            { text: "スクリプトから使う", link: "/guide/scripting" },
          ],
        },
      ],
      "/reference/": [
        {
          text: "リファレンス",
          items: [
            { text: "コマンド一覧", link: "/reference/commands" },
            { text: "天気コード", link: "/reference/weather-codes" },
            {
              text: "トラブルシューティング",
              link: "/reference/troubleshooting",
            },
            { text: "開発", link: "/reference/development" },
            { text: "使用的 API", link: "/reference/api" },
          ],
        },
      ],
    },

    // ローカル検索。外部サービスにクエリを投げずに済む。
    search: {
      provider: "local",
      options: {
        locales: {
          root: {
            translations: {
              button: {
                buttonText: "検索",
                buttonAriaLabel: "ドキュメントを検索",
              },
              modal: {
                displayDetails: "詳細を表示",
                resetButtonTitle: "検索をリセット",
                backButtonTitle: "戻る",
                noResultsText: "結果が見つかりません:",
                footer: {
                  selectText: "選択",
                  selectKeyAriaLabel: "選択キー",
                  navigateText: "移動",
                  navigateUpKeyAriaLabel: "上",
                  navigateDownKeyAriaLabel: "下",
                  closeText: "閉じる",
                  closeKeyAriaLabel: "閉じる",
                },
              },
            },
          },
        },
      },
    },

    outline: { level: [2, 3], label: "このページの内容" },

    docFooter: { prev: "前のページ", next: "次のページ" },
    darkModeSwitchLabel: "テーマ",
    lightModeSwitchTitle: "ライトモードに切り替える",
    darkModeSwitchTitle: "ダークモードに切り替える",
    sidebarMenuLabel: "メニュー",
    returnToTopLabel: "先頭へ",
    langMenuLabel: "言語を変更",

    lastUpdatedText: "最終更新",
    editLink: {
      pattern: "https://github.com/nazozokc/otenki/edit/main/docs/:path",
      text: "GitHub で編集",
    },

    footer: {
      message: "MIT ライセンス · データは Open-Meteo と GeoNames",
      copyright: "Weather data by Open-Meteo, place data by GeoNames",
    },
  },
});
