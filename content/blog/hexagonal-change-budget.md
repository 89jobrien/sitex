---
title: Hexagonal Architecture Is a Change-Budget Tool
date: 2026-09-11
description: "Why I judge ports and adapters by the amount of future change they contain, not by how clean the diagram looks."
---

A clean diagram proves nothing. Replace an adapter and count what breaks.

Hexagonal architecture earns its cost when an external change stays inside a known boundary. The
port defines the budget. The adapter spends it.

```rust
pub trait PipelineRunner {
    fn run_pipeline(
        &self,
        config_path: &Path,
        fail_fast: bool,
    ) -> Result<PipelineOutcome, TaskitError>;
}
```

## Buy room for a specific change

Taskit's `PipelineRunner` buys room to replace the execution mechanism. The application asks for a
`PipelineOutcome`. It does not ask whether the work happened in the built-in engine, a Crux
subprocess, or an embedded runner.

The built-in adapter reads the injected context. Source:
`crates/taskit-engine/src/pipeline_runner.rs` (shortened).

```rust
impl PipelineRunner for BuiltinRunner<'_> {
    fn run_pipeline(
        &self,
        _config_path: &Path,
        fail_fast: bool,
    ) -> Result<PipelineOutcome, TaskitError> {
        let outcome = match self.ctx.ci() {
            Some(config) if !config.steps.is_empty() => {
                crate::ci::run_from_config_internal(
                    self.ctx,
                    config,
                    fail_fast,
                    self.offline,
                )
            }
            Some(_) => crate::step::Pipeline::new(fail_fast).run(),
            None => crate::ci::run_default_internal(self.ctx, fail_fast, self.offline),
        };
        Ok(outcome)
    }
}
```

The underscore on `_config_path` matters. This adapter uses configuration already loaded into
`Ctx`, while `SubprocessCruxRunner` owns a `cruxfile_path`. The result contract is shared, but the
input semantics are not perfectly uniform.

That is still more honest than pushing runner names through the engine. Construction knows the
adapter. Application behavior knows the outcome.

```rust
impl PipelineRunner for SubprocessCruxRunner {
    fn run_pipeline(
        &self,
        _config_path: &Path,
        _fail_fast: bool,
    ) -> Result<PipelineOutcome, TaskitError> {
        let start = Instant::now();
        let output = std::process::Command::new("crux")
            .arg("run")
            .arg(&self.cruxfile_path)
            .output()?;
        let duration = start.elapsed();
        let passed = output.status.success();
        let error = if passed {
            None
        } else {
            Some(String::from_utf8_lossy(&output.stderr).trim().to_string())
        };
        Ok(PipelineOutcome {
            results: vec![StepResult {
                name: "crux-pipeline".into(),
                status: if passed { StepStatus::Pass } else { StepStatus::Fail },
                duration,
                error,
                gate: false,
                diagnostics: vec![],
                context: Default::default(),
            }],
            total: duration,
            passed,
            context: None,
        })
    }
}
```

## Put platform differences behind capabilities

Minibox has a larger budget. Native Linux, GKE, Colima, SmolVM, krun, and Apple's Virtualization
framework do not start containers the same way. Making every caller understand those paths would
spread platform change through the daemon.

The runtime port accepts domain inputs and reports capabilities instead of exposing adapter names.
Source: `crates/minibox-domain/src/runtime.rs` (shortened).

```rust
#[async_trait]
pub trait ContainerRuntime: AsAny + Send + Sync {
    fn capabilities(&self) -> RuntimeCapabilities;

    async fn spawn_process(
        &self,
        config: &ContainerSpawnConfig,
    ) -> Result<SpawnResult>;

    async fn wait_for_exit(
        &self,
        _runtime_id: Option<&str>,
        _pid: u32,
    ) -> Result<i32> {
        anyhow::bail!("adapter must override wait_for_exit")
    }
}
```

Capabilities are a controlled leak. Callers need to know whether cgroups or network isolation
exist. They should not need to know which adapter supplied them.

That keeps a new implementation from forcing provider-name checks through the codebase.

```rust
pub struct RuntimeCapabilities {
    pub supports_user_namespaces: bool,
    pub supports_cgroups_v2: bool,
    pub supports_overlay_fs: bool,
    pub supports_network_isolation: bool,
    pub max_containers: Option<usize>,
}
```

## Smaller ports cost less

Ports add vocabulary, wiring, mocks, and contract tests. A trait around every function spends that
cost without buying useful change room.

Minibox separates daemon-side rootfs setup from child-process initialization. Callers can depend on
the half they use. Source: `crates/minibox-domain/src/filesystem.rs`.

```rust
pub trait RootfsSetup: AsAny + Send + Sync {
    fn setup_rootfs(
        &self,
        image_layers: &[PathBuf],
        container_dir: &Path,
    ) -> Result<RootfsLayout>;

    fn cleanup(&self, container_dir: &Path) -> Result<()>;
}

pub trait ChildInit: Send + Sync {
    fn pivot_root(&self, new_root: &Path) -> Result<()>;
}
```

The combined `FilesystemProvider` still exists for adapters implementing both phases. The smaller
traits stop unrelated callers from paying for the whole interface.

The useful question is blunt: what replacement or failure mode is this boundary meant to contain?
If the answer is vague, the trait is probably early.

```rust
pub trait FilesystemProvider: RootfsSetup + ChildInit + Send + Sync {}

impl<T: RootfsSetup + ChildInit> FilesystemProvider for T {}
```

## Contract tests define the budget

Compiling against a trait only proves that method names line up. A swappable adapter needs behavior
that another implementation can prove.

Taskit's conformance helpers assert domain invariants. Source:
`crates/taskit-core/src/conformance.rs` (shortened).

```rust
pub fn assert_success_outcome_invariants(outcome: &PipelineOutcome) {
    assert!(outcome.passed);
    assert!(!outcome.results.is_empty());
    for result in &outcome.results {
        assert_eq!(result.status, StepStatus::Pass);
    }
}

pub fn assert_failure_outcome_invariants(outcome: &PipelineOutcome) {
    assert!(!outcome.passed);
    assert!(outcome.results.iter().any(|result| result.status == StepStatus::Fail));
}
```

The current full runner contract is still small. `assert_pipeline_runner_contract` only checks that
a nonexistent configuration path returns an error. The stronger outcome checks are separate. That
is a start, not proof that every runner behaves identically.

Minibox has the same caveat. Its generic runtime conformance module currently exercises
`MockRuntime`, not every production adapter.

```rust
crate::conformance_test! {
    name: "spawn_failure_returns_err",
    adapter: "runtime",
    category: EdgeCase,
    |ctx| {
        let runtime = MockRuntime::new().with_spawn_failure();
        ctx.assert_err(
            rt().block_on(runtime.spawn_process(&default_config())),
            "failure-configured mock returns Err",
        );
        ctx.result()
    }
}
```

Mock conformance checks expected domain behavior. It does not prove that namespace setup, VM boot,
or process waiting works on a real adapter. Integration and system tests still carry that bill.

A leaky port pays twice. The code gets indirection, then callers still branch on the concrete
adapter. Minibox keeps those names in its construction registry.

```rust
pub enum AdapterSuite {
    Native,
    Gke,
    Colima,
    SmolVm,
    Krun,
    Vz,
}
```

Construction is allowed to know concrete choices. Domain behavior should not. Even then, changing
an adapter can require registry wiring, platform gates, protocol handling, and production tests. A
port limits the blast radius. It does not make the blast radius one file.

Pick the external thing most likely to move. List the domain types that stay fixed, the wiring that
changes, and the tests the replacement must pass. If most of the application moves, the budget
failed.

```rust
#[test]
fn subprocess_runner_conformance() {
    let runner = SubprocessCruxRunner::new(PathBuf::from("/nonexistent"));
    assert_pipeline_runner_contract(&runner);
}
```

The hexagon is only a map. The useful result is a future change with an obvious home, a bounded set
of callers, and a contract that can reject a bad replacement.

```rust
pub trait ConflictResolver {
    fn resolve(&self, files: &[ConflictFile]) -> Result<Vec<ResolvedFile>, TaskitError>;
}
```

## Sources

- [Taskit pipeline port](https://github.com/89jobrien/taskit/blob/ed428faa61f563fc8d84761fa1846613a9aa9500/crates/taskit-core/src/pipeline_runner.rs)
- [Taskit runner adapters](https://github.com/89jobrien/taskit/blob/ed428faa61f563fc8d84761fa1846613a9aa9500/crates/taskit-engine/src/pipeline_runner.rs)
- [Taskit conformance helpers](https://github.com/89jobrien/taskit/blob/ed428faa61f563fc8d84761fa1846613a9aa9500/crates/taskit-core/src/conformance.rs)
- [Minibox runtime ports](https://github.com/89jobrien/minibox/blob/fedcc644d8381927fca900ac2db384fb141dad58/crates/minibox-domain/src/runtime.rs)
- [Minibox filesystem ports](https://github.com/89jobrien/minibox/blob/fedcc644d8381927fca900ac2db384fb141dad58/crates/minibox-domain/src/filesystem.rs)
- [Minibox adapter registry](https://github.com/89jobrien/minibox/blob/fedcc644d8381927fca900ac2db384fb141dad58/crates/miniboxd/src/adapter_registry.rs)
- [Minibox mock runtime conformance](https://github.com/89jobrien/minibox/blob/fedcc644d8381927fca900ac2db384fb141dad58/crates/minibox-testsuite/src/adapters/runtime.rs)
