---
title: "sparkfile"
date: 2026-08-18
description: "CLI that scaffolds new projects from YAML-defined presets, generating workspace-convention skeletons (e.g. a Rust 2024 CLI) with local guidance, validation commands, and handoff context."
taxonomies:
  tags: [automation, cli, developer-experience]
extra:
  repo: "https://github.com/89jobrien/sparkfile"
---

# sparkfile

Project scaffolding CLI for creating new projects with consistent workspace conventions.

## Usage

- `sparkfile new rust-cli <name>`
- `sparkfile new rust-cli <name> --description "Short description"`
- `sparkfile new rust-cli <name> --root /path/to/workspace`

The `rust-cli` preset creates a Rust 2024 CLI skeleton with local guidance, validation commands, ignore rules, and handoff context.

Scaffold definitions are populated from YAML files in `scaffolds/`. The default `rust-cli` preset is defined in `scaffolds/rust-cli.yaml`.

## Development

- `just check`: run `cargo check --all-targets`
- `just lint`: run `cargo clippy --all-targets -- -D warnings`
- `just test`: run `cargo test`
- `just gate`: run the local validation gate
