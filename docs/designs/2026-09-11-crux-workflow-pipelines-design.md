# Design: Standalone Crux Workflow Pipelines

> **Status (2026-09-12): Planned.** Current main has only `scripts/format.crux` and
> `scripts/lint.crux`; `Cruxfile` still owns check, build, serve, and CI composition.

## Goal

Give every `Cruxfile` workflow target a dedicated, independently runnable `.crux` pipeline while preserving the existing site commands and execution order.

## Approved Approach

Use standalone pipelines: leaf pipelines own format, lint, check, build, and serve commands, while `ci.crux` invokes the first four leaf pipelines sequentially and each `Cruxfile` target becomes a thin dispatcher.

## Ownership

- **Workflow owner**: `scripts/*.crux` owns executable workflow behavior.
- **Dispatcher**: `Cruxfile` maps target names to their corresponding scripts.
- **Affected runtime**: the installed `crux` CLI and existing site tools only; this repository has no Rust crate or public API.

## Pipeline Contract

| Pipeline              | Command sequence                                                     | Failure behavior                             |
| --------------------- | -------------------------------------------------------------------- | -------------------------------------------- |
| `scripts/format.crux` | `prettier --write 'content/**/*.md' 'sass/**/*.scss'`                | Fails when Prettier cannot format input      |
| `scripts/lint.crux`   | `markdownlint-cli2 'content/**/*.md'`                                | Fails on Markdown lint errors                |
| `scripts/check.crux`  | `zola check`                                                         | Fails on Zola content or link errors         |
| `scripts/build.crux`  | `zola build`                                                         | Fails when the site cannot build             |
| `scripts/serve.crux`  | `zola serve --open`                                                  | Long-running, best-effort development target |
| `scripts/ci.crux`     | format pipeline -> lint pipeline -> check pipeline -> build pipeline | Stops at the first failed child pipeline     |

Every finite leaf pipeline logs the captured command output through `ctrl::log`. `serve.crux` remains a single long-running `shell::exec` step and is excluded from CI.

## Data Flow

1. A user runs `crux run Cruxfile <name>` through the repository `Cruxfile`.
2. The target invokes `crux run scripts/<name>.crux`.
3. The pipeline executes its site command through `shell::capture`, or `shell::exec` for the development server.
4. The handler result is retained in the Crux trace and finite pipelines emit a compact log result.
5. For CI, `scripts/ci.crux` invokes the format, lint, check, and build pipelines in order so each remains independently runnable.

## Integration Points

- Existing `scripts/format.crux` and `scripts/lint.crux` remain the source of truth for their commands.
- New `scripts/check.crux`, `scripts/build.crux`, `scripts/serve.crux`, and `scripts/ci.crux` use the same pipeline schema and naming conventions.
- `Cruxfile` removes the `build` and `ci` dependency graphs so commands are not executed twice; orchestration moves into `scripts/ci.crux`.
- The default target remains `ci`.

## Validation

- Validate every pipeline with `crux check scripts/<name>.crux`.
- Run finite leaf pipelines individually where they do not alter unrelated work.
- Run `crux run scripts/ci.crux` only when the worktree is safe for the mutating format step.
- Do not execute `serve.crux` as an automated gate because it is intentionally long-running and opens a browser.

## Out of Scope

- Changing the existing formatter, linter, Zola commands, or their file scopes.
- Adding external-link exceptions to make the current `zola check` pass.
- Adding package manifests, tool installation, deployment, or GitHub Actions changes.
- Modifying the concurrent untracked blog posts or unrelated existing worktree changes.

## Risk

- [x] Breaking API changes: no public API exists.
- [x] New external dependency: no; all commands already exist in the repository workflow.
- [x] Feature flag required: no.
- [x] Duplicate execution risk: controlled by moving CI ordering out of `Cruxfile` dependencies.
- [x] Mutating CI step: preserved intentionally because the existing format target uses Prettier write mode.
- [x] Nested trace boundary: child pipeline traces remain separate process outputs inside the CI pipeline trace.
