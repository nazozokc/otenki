import { defineConfig } from "tsdown";

// エントリの shebang (`#!/usr/bin/env bun`) は出力に残り、tsdown が実行権を付ける。
// コード分割は切って単一ファイルに畳む —— モジュール数が減るぶん起動が速い。
export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  format: ["esm"],
  platform: "node",
  minify: true,
  dts: false,
  outputOptions: {
    codeSplitting: false,
  },
});
