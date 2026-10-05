{
  description = "otenki — terminal weather CLI built on the Open-Meteo APIs";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    treefmt-nix.url = "github:numtide/treefmt-nix";
    # bun.lock → bun.nix を生成し、依存を Nix store からオフライン取得する。
    # 2.1.2 は lockfileVersion 2 (bun 1.4 の既定) を解釈できないので、
    # 「Accept bun.lock versions 2 and 3」(PR #110) の head を指している。
    # マージ後に 2.1.3 へ上げるか、この rev を外して最新に差し替えること。
    bun2nix.url = "github:nix-community/bun2nix/0456acb1b7394fc14c414b056aa889df5124943a";
  };

  nixConfig = {
    extra-substituters = [ "https://nix-community.cachix.org" ];
    extra-trusted-public-keys = [
      "nix-community.cachix.org-1:mB9FSh9qf2cDimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs="
    ];
  };

  outputs =
    inputs@{
      self,
      nixpkgs,
      flake-parts,
      treefmt-nix,
      bun2nix,
      ...
    }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      imports = [
        treefmt-nix.flakeModule
      ];

      perSystem =
        {
          system,
          self',
          config,
          ...
        }:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          # ビルドに必要な物だけをソースに含める。node_modules と dist は
          # ビルド中に作る（あるいは不要）なので除外する。
          # apps/** だけでワークスペースの中身全部が拾える。
          src = pkgs.lib.cleanSourceWith {
            src = ./.;
            filter =
              path: type:
              let
                rel = pkgs.lib.removePrefix (toString ./. + "/") (toString path);
              in
              builtins.match "^(flake|package|tsconfig).*|^bun\\.(nix|lock)$|^README.md$|^LICENSE$" rel != null
              || (
                builtins.match "^apps(/.*)?$" rel != null
                && builtins.match ".*/node_modules(/.*)?" rel == null
                && builtins.match "^apps/[^/]+/dist(/.*)?$" rel == null
              );
          };
          # apps/otenki/package.json を唯一のバージョン情報源にする
          version = (pkgs.lib.importJSON ./apps/otenki/package.json).version;
          bun2nix' = bun2nix.packages.${system}.bun2nix;
          # bun.nix から作った bun 互換キャッシュ（sandbox 内のオフライン install 用）
          bunDeps = bun2nix'.fetchBunDeps { bunNix = ./bun.nix; };
          # bunInstallFlagsArray は Nix のリストだと bash 配列として復元されず
          # 1 要素扱いになるため、スペース区切りの文字列で渡す
          bunFlags = "--linker=isolated --offline --frozen-lockfile";
        in
        {
          # -----------------------------------------------------------------
          # packages
          # -----------------------------------------------------------------
          packages.default = pkgs.stdenvNoCC.mkDerivation {
            pname = "otenki";
            inherit src version bunDeps;

            nativeBuildInputs = [
              pkgs.bun
              pkgs.makeWrapper
              bun2nix'.hook
            ];

            dontUseBunBuild = true;
            dontUseBunCheck = true;
            bunInstallFlags = bunFlags;

            # bun2nix issue #73: fetchBunDeps のキャッシュをコピーすると
            # read-only になり、bun がリンクを作れず ENOENT で失敗する。
            postBunSetInstallCacheDirPhase = ''
              chmod -R u+rwx "$BUN_INSTALL_CACHE_DIR"
            '';

            # `bun build --compile` は自己完結バイナリ（80MB）を作れるが、
            # orbase と同じ方針で bundle + makeWrapper を採る（156KB）。
            # bundle は bare import を解決してインライン化するので、
            # 実行時に node_modules は不要。
            buildPhase = ''
              runHook preBuild
              bun build ./apps/otenki/src/index.ts --outfile ./otenki.js --target bun
              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall
              install -Dm755 otenki.js $out/libexec/otenki/otenki.js
              makeWrapper ${pkgs.bun}/bin/bun $out/bin/otenki \
                --add-flags "$out/libexec/otenki/otenki.js" \
                --set-default OTENKI_VERSION "${version}" \
                --prefix PATH : ${pkgs.lib.makeBinPath [ pkgs.fzf ]}
              runHook postInstall
            '';

            meta = {
              description = "Terminal weather CLI for any place on earth";
              homepage = "https://github.com/nazozokc/otenki";
              license = pkgs.lib.licenses.mit;
              mainProgram = "otenki";
              platforms = pkgs.lib.platforms.all;
            };
          };

          # -----------------------------------------------------------------
          # apps
          # -----------------------------------------------------------------
          apps.default = {
            type = "app";
            program = "${pkgs.lib.getExe self'.packages.default}";
          };

          # bun.lock を更新した後に、依存定義とこのスクリプトを走らせる。
          # リポジトリのルートで `bun install && nix run .#update` を実行する。
          # writeShellScript は $out そのものがスクリプトファイルのパスに
          # なるので、文字列補間して program に渡す必要がある。
          apps.update = {
            type = "app";
            program = "${pkgs.writeShellScript "otenki-update-bun-nix" ''
              set -euo pipefail
              bun install
              ${pkgs.lib.getExe bun2nix'} -l bun.lock -o bun.nix
              nix flake lock
              echo "bun.nix と flake.lock を更新しました"
            ''}";
          };

          # -----------------------------------------------------------------
          # checks
          # -----------------------------------------------------------------
          checks.build = self'.packages.default;

          checks.tests = pkgs.stdenvNoCC.mkDerivation {
            pname = "otenki-tests";
            inherit src version bunDeps;

            nativeBuildInputs = [
              pkgs.bun
              bun2nix'.hook
            ];

            dontUseBunBuild = true;
            dontUseBunCheck = true;
            doCheck = true;
            bunInstallFlags = bunFlags;

            postBunSetInstallCacheDirPhase = ''
              chmod -R u+rwx "$BUN_INSTALL_CACHE_DIR"
            '';

            # bun2nix の hook が configurePhase のあとに
            # bunNodeModulesInstallPhase を挿入するので、ここでは何もしなくてよい。
            # bun install を自分で書くと --offline / --frozen-lockfile を失って
            # sandbox 内でネットワークを訪れてしまう。

            checkPhase = ''
              runHook preCheck
              bun test
              runHook postCheck
            '';

            installPhase = ''
              runHook preInstall
              mkdir -p $out
              runHook postInstall
            '';
          };

          checks.typecheck = pkgs.stdenvNoCC.mkDerivation {
            pname = "otenki-typecheck";
            inherit src version bunDeps;

            nativeBuildInputs = [
              pkgs.bun
              pkgs.typescript
              bun2nix'.hook
            ];

            dontUseBunBuild = true;
            dontUseBunCheck = true;
            doCheck = true;
            bunInstallFlags = bunFlags;

            postBunSetInstallCacheDirPhase = ''
              chmod -R u+rwx "$BUN_INSTALL_CACHE_DIR"
            '';

            checkPhase = ''
              runHook preCheck
              tsc --project tsconfig.json --noEmit
              runHook postCheck
            '';

            installPhase = ''
              runHook preInstall
              mkdir -p $out
              runHook postInstall
            '';
          };

          # -----------------------------------------------------------------
          # devShell
          # -----------------------------------------------------------------
          # mkShellNoCC: コンパイラ不要の shell なので stdenvNoCC を使い、
          # gcc/binutils 等のダウンロードを避けて direnv の読み込みを高速化する
          devShells.default = pkgs.mkShellNoCC {
            name = "otenki";
            packages = [
              # ランタイム & テストランナー
              pkgs.bun
              # 型チェック & エディタの TS LSP バックエンド
              pkgs.typescript
              # bun.lock から bun.nix を再生成する CLI
              bun2nix'
              # locate --pick の候補選択 UI
              pkgs.fzf
              # プロジェクト設定入り treefmt (nix fmt と同じ挙動)
              config.formatter
              # VCS と GitHub 操作 (PR / release)
              pkgs.gh
              pkgs.git
              # JSON の整形・検索 (places.json の確認用)
              pkgs.jq
            ];
            shellHook = ''
              echo "[devShell:otenki] bun $(bun --version), tsc $(tsc --version), fzf $(fzf --version)"
              echo ""
              echo "  Tasks:"
              echo "    bun test                    run tests"
              echo "    bun run typecheck           type check"
              echo "    bun run build               bundle to apps/otenki/dist/otenki.js"
              echo "    bun run start -- <cmd>      run the CLI (dev mode)"
              echo "    nix run . -- <cmd>          run the Nix build"
              echo "    nix run .#update            refresh bun.nix after bun.lock changes"
              echo "    nix fmt                     format sources"
            '';
          };

          # -----------------------------------------------------------------
          # formatter
          # -----------------------------------------------------------------
          treefmt.config = {
            projectRootFile = "flake.nix";
            programs.nixfmt.enable = true;
            programs.prettier.enable = true;
            settings.global.excludes = [
              # bun.lock は trailing comma を含む JSON なので prettier 不可
              "bun.lock"
              # bun.nix は bun2nix の生成物なので整形しない
              "bun.nix"
              # dist はビルド生成物
              "**/dist"
              # node_modules は install の生成物
              "**/node_modules"
              # VitePress が作る依存の predeps キャッシュ。生成物なので触らない
              "**/.vitepress/cache"
            ];
          };
        };
    };
}
