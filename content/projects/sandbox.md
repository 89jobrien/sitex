---
title: "sandbox"
date: 2026-08-18
description: "Rust workspace implementing a virtual bash interpreter over an in-memory VFS, with default-deny capability permissions and operation-count execution limits, for safely embedding shell-script evaluation in applications."
taxonomies:
  tags: [security, shell-tooling, systems-software]
extra:
  repo: "https://github.com/89jobrien/sandbox"
  related: [project:rslm]
---

A virtual bash interpreter with a sandboxed in-memory filesystem. No real OS
commands are executed — everything runs inside a `vfs::MemoryFS`. Designed for
embedding in applications that need to evaluate shell-like scripts safely.

## Usage

### As a library

```rust
use sandbox::{Shell, ShellOutput};

#[tokio::main]
async fn main() {
    let mut shell = Shell::builder()
        .env("HOME", "/home/user")
        .cwd("/home/user")
        .build();

    let output = shell.exec("echo hello world").await.unwrap();
    assert_eq!(output.stdout, "hello world\n");
    assert_eq!(output.exit_code, 0);
}
```

### CLI

```bash
cargo run -p sandbox-cli -- -c 'for i in a b c; do echo $i; done'
```

## Supported Shell Features

**Control flow:** `if/elif/else/fi`, `for/do/done`, `while/do/done`,
`until/do/done`, `case/esac`, `&&`, `||`, `!`, `;` sequences

**Functions:** `function name { ... }` and `name() { ... }`

**Pipelines:** `cmd1 | cmd2 | cmd3`

**Redirections:** `>`, `>>`, `<`, `2>`, `2>>`, `&>`, heredocs (`<<`),
herestrings (`<<<`)

**Expansion:** `$VAR`, `${VAR}`, `${VAR:-default}`, `${VAR:+alt}`,
`${#VAR}`, `$?`, `$0`..`$9`, `$@`, `$#`, double-quoted interpolation

Command substitution is **parsed but not executed** -- see
[Not supported](#not-supported).

**Assignments:** `VAR=value`, `export VAR=value`, prefix assignments

**Grouping:** `{ ...; }`, `(...)`

## Built-in Commands

| Category   | Commands                                     |
| ---------- | -------------------------------------------- |
| Core       | echo, printf, cat, read, head, tail, test, [ |
| Navigation | cd, pwd, ls                                  |
| File       | mkdir, rm, cp, mv, touch, find               |
| Flow       | true, false, exit                            |
| Variables  | export, set, unset                           |
| Text       | wc, basename, dirname, sort, uniq, tee, grep |

28 builtins total. Unknown commands return exit code 127. Implement the
`ExecHandler` trait to intercept and handle external commands, or register
custom builtins via `shell.register_builtin(impl Builtin)`.

## Capabilities

The shell uses a capability-based permission model. Each `Shell` instance has
a `CapabilitySet` that controls what operations are allowed:

| Capability   | Controls                                      |
| ------------ | --------------------------------------------- |
| ReadFs       | Reading files and listing dirs                |
| WriteFs      | Writing, creating, removing files             |
| EnvRead      | Reading environment variables                 |
| EnvWrite     | Modifying environment variables               |
| RealFs       | Host filesystem access (declared, unused)     |
| Network      | Network operations (declared, unused)         |
| NetAllowlist | Per-host network allowlist (declared, unused) |
| Exec         | Spawning real processes (declared, unused)    |
| Signal       | Signal handling (declared, unused)            |

Default set: `ReadFs`, `WriteFs`, `EnvRead`, `EnvWrite`. Restrict with:

```rust
use sandbox::capabilities::{Cap, CapabilitySet};

let shell = Shell::builder()
    .capabilities(CapabilitySet::new([Cap::ReadFs, Cap::EnvRead]))
    .build();
```

## Execution Limits

Limits are **operation-count** bounds. The table below marks which are
actually enforced; the remainder are declared and clamped but never checked.

| Limit                 | Default   | Hard cap   | Enforced |
| --------------------- | --------- | ---------- | -------- |
| Commands              | 10,000    | 1,000,000  | yes      |
| Loop iterations       | 10,000    | 1,000,000  | yes      |
| Total loop iterations | 1,000,000 | 10,000,000 | yes      |
| AST depth             | 100       | 100        | yes      |
| Parser fuel (tokens)  | 100,000   | 1,000,000  | yes      |
| Stdout                | 1 MB      | 100 MB     | yes      |
| Input size            | 10 MB     | 100 MB     | yes      |
| Function depth        | 100       | 100        | **no**   |
| Substitution depth    | 32        | 64         | **no**   |
| Var size              | 1 MB      | 10 MB      | **no**   |
| VFS size              | 100 MB    | 1 GB       | **no**   |
| Stderr                | 1 MB      | 100 MB     | **no**   |
| Timeout               | 30s       | 3,600s     | **no**   |

**There is no wall-clock timeout.** `ShellError::Timeout` is declared but never
constructed anywhere in the crate. Termination comes from operation counting --
`tick_command` and `tick_loop` return `Err` above their limit, and every loop
construct's first statement is a fallible tick, so `while true; do echo x; done`
is killed. This bounds _steps_, not elapsed time: a single builtin that does
real work is not bounded in duration.

`crates/sandbox-bench` contains no benchmarks yet, so interpretation overhead
is **unmeasured**.

```rust
use sandbox::limits::ExecutionLimits;

let shell = Shell::builder()
    .limits(ExecutionLimits {
        max_loop_iterations: 100,
        ..Default::default()
    })
    .build();
```

## Not supported

Verified against `main` @ `53c1e7f`.

- **Command substitution.** `$(...)` and backticks parse into the AST, then
  expand to an empty string (`interpreter/expansion.rs:25,29` -- both read
  `// handled by interpreter`, and no interpreter path exists). `echo $(whoami)`
  prints the word `echo` and nothing else, with exit code 0. This fails closed,
  but it is a silent wrong answer.
- **Globbing.** Word expansion is variables-only, so `echo *.txt` emits the
  literal `*.txt`. The only glob matcher is a predicate for `find -name`.
- **Background execution.** `&` is refused explicitly with exit code 1.
- **Real programs.** There is no `gcc`, `git`, `python`, or `curl`. To run a
  real program you must inject an `ExecHandler`, which is the one escape hatch
  the design otherwise forecloses.
- **Unbounded recursion.** Function-depth is not enforced; recursion is bounded
  only indirectly through the command counter.

## Why it is safe

The safety argument is structural rather than configurational, and greppable:

- The library crate contains **zero** references to `std::process`,
  `Command::new`, `libc`, or `nix`. Its dependency list has no process crate.
- `DefaultExecHandler::handle` returns `None` unconditionally -- unknown
  commands cannot reach outside.
- The filesystem root is a `MemoryFS`; path normalization pops a stack on
  `..`, so no path can ascend above root, and there is no host filesystem
  underneath to escape into.
- No `std::env` access -- the shell's environment is seeded only by the builder.
- `CapabilitySet::check` is default-deny: denial is the `else` branch, so
  granting requires positive insertion. Five of nine capabilities (`RealFs`,
  `Network`, `NetAllowlist`, `Exec`, `Signal`) are declared but never consumed
  anywhere, which means the grants that would open escape hatches are inert.
- 3 `cargo-fuzz` targets with 5,162 corpus entries, and 11 `proptest!`
  properties including arbitrary-Unicode parser input.

## Custom Builtins

```rust
use async_trait::async_trait;
use sandbox::builtins::{Builtin, Context};
use sandbox::error::ShellResult;
use sandbox::interpreter::hooks::ExecResult;

struct Hello;

#[async_trait]
impl Builtin for Hello {
    fn name(&self) -> &str { "hello" }

    async fn execute(&self, _ctx: Context<'_>) -> ShellResult<ExecResult> {
        Ok(ExecResult::success("hello from custom\n"))
    }
}

let mut shell = Shell::builder().build();
shell.register_builtin(Hello);
```

## License

MIT OR Apache-2.0
