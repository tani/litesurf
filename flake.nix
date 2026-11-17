{
  description = "Nix tools for building the litesurf Node.js package";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];
      forSystems = nixpkgs.lib.genAttrs systems;
      toolsFor =
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          tools = with pkgs; [
            nodejs_24
            bash
            coreutils
            findutils
            gnugrep
            gnused
            git
            python3
            gnutar
            gzip
            xz
            unzip
            zip
            patch
            which
            pkg-config
            stdenv.cc
            stdenv.cc.bintools
          ];
          bazelConfig = pkgs.writeText "litesurf.bazelrc" ''
            common --repo_env=PATH=${pkgs.lib.makeBinPath tools}:/usr/bin:/bin
          '';
          bazel = pkgs.writeShellScriptBin "bazel" ''
            if [[ -z "''${USE_BAZEL_VERSION:-}" && -f upstream/kitesurf/.bazelversion ]]; then
              export USE_BAZEL_VERSION="$(< upstream/kitesurf/.bazelversion)"
            fi
            if [[ "''${1:-}" == --version ]]; then
              exec ${pkgs.bazelisk}/bin/bazelisk "$@"
            fi
            exec ${pkgs.bazelisk}/bin/bazelisk --bazelrc=${bazelConfig} "$@"
          '';
          build = pkgs.writeShellApplication {
            name = "litesurf-build";
            runtimeInputs = tools ++ [ bazel ];
            text = ''
              if [[ ! -f package.json ]] || [[ "$(node -p 'require("./package.json").name')" != litesurf ]]; then
                echo "Run this command from the litesurf checkout." >&2
                exit 1
              fi
              export BAZEL=${bazel}/bin/bazel
              git submodule update --init --recursive
              npm ci --no-audit --no-fund
              npm run build
              node scripts/verify-dist.mjs
            '';
          };
        in
        {
          inherit
            pkgs
            tools
            bazel
            build
            ;
        };
    in
    {
      devShells = forSystems (
        system:
        let
          env = toolsFor system;
        in
        {
          default = env.pkgs.mkShell {
            packages = env.tools ++ [ env.bazel ];
            BAZEL = "${env.bazel}/bin/bazel";
          };
        }
      );

      apps = forSystems (
        system:
        let
          env = toolsFor system;
          build = {
            type = "app";
            program = "${env.build}/bin/litesurf-build";
            meta.description = "Build litesurf from its pinned upstream checkout";
          };
        in
        {
          inherit build;
          default = build;
        }
      );

      checks = forSystems (system: {
        build-command = (toolsFor system).build;
      });

      formatter = forSystems (system: (toolsFor system).pkgs.nixfmt);
    };
}
