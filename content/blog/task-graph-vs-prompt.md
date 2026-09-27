---
title: What a Task Graph Can Enforce That a Prompt Cannot
date: 2026-09-11
description: "Why I moved the important parts of an agent workflow out of instructions and into godmode's locally persisted task state."
---

A prompt cannot remember that work stopped halfway through. It can say what
should happen, but it cannot record what happened.

That matters after a context window closes. "Run tests before committing"
remains prose. "The regression test is still failing" is state. Godmode gives
that state a small model instead of asking the next agent to infer it.

Shortened excerpt from
`/Users/joe/dev/godmode/crates/godmode-core/src/model.rs`.

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Pending,
    Running,
    Done,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub status: Status,
    #[serde(default)]
    pub depends_on: Vec<String>,
    #[serde(default)]
    pub notes: String,
    pub commit: Option<String>,
    pub run: Option<String>,
}
```

## A prompt describes the workflow

Prompts are good at intent. They explain why a check matters, what style to use,
and what done should mean. They are bad at answering current-state questions.

A task graph can answer whether work is ready without model interpretation. A
pending task is runnable only when every recorded dependency is done.

Exact excerpt from
`/Users/joe/dev/godmode/crates/godmode-core/src/graph.rs`.

```rust
pub fn runnable(graph: &TaskGraph) -> Vec<&Task> {
    let done_ids = graph.done_ids();

    graph
        .tasks
        .iter()
        .filter(|task| {
            task.status == Status::Pending
                && task
                    .depends_on
                    .iter()
                    .all(|dep| done_ids.contains(dep.as_str()))
        })
        .collect()
}
```

Godmode also rejects a direct attempt to start work with unmet dependencies.
The prompt may recommend an order. The graph calculates and enforces it.

Shortened excerpt from
`/Users/joe/dev/godmode/crates/godmode-core/src/graph.rs`.

```rust
pub fn start(graph: &mut TaskGraph, id: &str) -> Result<()> {
    let unmet: Vec<String> = {
        let done_ids = graph.done_ids();
        let task = graph.tasks.iter().find(|task| task.id == id)?;

        task.depends_on
            .iter()
            .filter(|dep| !done_ids.contains(dep.as_str()))
            .cloned()
            .collect()
    };

    if !unmet.is_empty() {
        bail!("task has unmet dependencies: {}", unmet.join(", "));
    }

    graph.tasks.iter_mut().find(|task| task.id == id)?.status =
        Status::Running;
    Ok(())
}
```

The invariant is tested at two levels. Unit tests check concrete chains.
Property tests check that `runnable()` never returns a task whose dependencies
are not done.

Shortened excerpt from
`/Users/joe/dev/godmode/tests/conformance/src/property_tests.rs`.

```rust
proptest! {
    #[test]
    fn runnable_always_has_satisfied_deps(
        ids in prop::collection::vec("[a-z]{2}", 1..6)
    ) {
        let mut graph = TaskGraph::default();
        for id in ids {
            graph.tasks.push(Task::new(id, "x"));
        }

        let done_ids: HashSet<&str> = graph.tasks.iter()
            .filter(|task| task.status == Status::Done)
            .map(|task| task.id.as_str())
            .collect();

        for task in graph::runnable(&graph) {
            for dep in &task.depends_on {
                prop_assert!(done_ids.contains(dep.as_str()));
            }
        }
    }
}
```

## Godmode records the workflow

The graph lives in `.ctx/godmode/tasks.yaml`. Loading an absent file returns an
empty graph. Saving creates the local state directory and writes YAML. The file
is gitignored, so persistence is local to that checkout.

That scope is useful across sessions. It is not a distributed coordinator.
Separate worktrees need an orchestration layer to reconcile their graphs.

Shortened excerpt from
`/Users/joe/dev/godmode/crates/godmode-core/src/graph.rs`.

```rust
pub fn load(root: &Path) -> Result<TaskGraph> {
    let path = task_file(root);
    if !path.exists() {
        return Ok(TaskGraph::default());
    }

    let raw = std::fs::read_to_string(&path)?;
    Ok(serde_yaml::from_str(&raw)?)
}

pub fn save(root: &Path, graph: &TaskGraph) -> Result<()> {
    let path = task_file(root);
    std::fs::create_dir_all(path.parent().unwrap())?;
    std::fs::write(path, serde_yaml::to_string(graph)?)?;
    Ok(())
}
```

Session transitions save after changing state. Starting records a timestamp.
Completing can record a commit SHA and notes. Blocking records the reason the
next session needs.

Shortened excerpt from
`/Users/joe/dev/godmode/crates/godmode-core/src/session.rs`.

```rust
pub fn start_task(&mut self, id: &str) -> Result<()> {
    graph::start(&mut self.graph, id)?;

    if let Some(task) = self.graph.tasks.iter_mut().find(|task| task.id == id) {
        task.started_at = Some(Utc::now());
    }

    self.auto_save();
    Ok(())
}

pub fn block_task(&mut self, id: &str, reason: &str) -> Result<()> {
    graph::block(&mut self.graph, id, reason)?;
    self.auto_save();
    Ok(())
}
```

## Enforcement must be on the real path

Recorded state becomes enforcement only when the command path reads it. The
Rust pre-commit action blocks running and blocked tasks before Cargo gates.

Shortened excerpt from the locally audited
`/Users/joe/dev/godmode/crates/godmode-core/src/hooks/pre_commit.rs`.

```rust
fn check_task_state(root: &Path) -> Result<(), String> {
    let task_graph = graph::load(root).map_err(|error| error.to_string())?;

    let running: Vec<&str> = task_graph.tasks.iter()
        .filter(|task| task.status == Status::Running)
        .map(|task| task.id.as_str())
        .collect();

    if !running.is_empty() {
        return Err(format!("tasks still running: {}", running.join(", ")));
    }

    let blocked = task_graph.tasks.iter()
        .any(|task| task.status == Status::Blocked);
    if blocked {
        return Err("blocked tasks must be resolved before committing".into());
    }

    Ok(())
}
```

The older installed Nushell hook is weaker. It expects `godmode handoff --json`
to exit nonzero for running tasks. The current Rust command handler returns
`Ok(())` after printing the handoff output, so that path does not enforce the
running-task rule. Its separate blocked-task query still runs.

An enforcement mechanism is only real on paths that invoke it and propagate its
failure.

Exact excerpt from
`/Users/joe/dev/godmode/crates/godmode-cli/src/commands/handoff.rs`.

```rust
pub fn handle(command: Cmd, root: &Path, json: bool, _sarif: bool) -> Result<()> {
    match command {
        Cmd::Handoff => {
            let out = integrations::handoff(root)?;
            if json {
                println!("{}", serde_json::to_string_pretty(&out)?);
            } else {
                print!("{}", out.human);
            }
            Ok(())
        }
        _ => unreachable!("dispatcher sent command to the wrong handler"),
    }
}
```

## The graph should stay small

Tone, architecture notes, and coding preferences still belong in prose. Durable
state is for facts whose loss could make the next action wrong.

The graph also has to stay honest. Marking a task done stores a transition and
an optional SHA. It does not inspect that commit or prove the acceptance
criteria.

Shortened excerpt from
`/Users/joe/dev/godmode/crates/godmode-core/src/graph.rs`.

```rust
pub fn complete(
    graph: &mut TaskGraph,
    id: &str,
    commit: Option<&str>,
    notes: Option<&str>,
) -> Result<()> {
    let task = graph.tasks.iter_mut().find(|task| task.id == id)?;

    if task.status != Status::Running {
        bail!("only running tasks can be completed");
    }

    task.status = Status::Done;
    task.completed_at = Some(Utc::now());
    task.commit = commit.map(str::to_owned);
    task.notes = notes.unwrap_or_default().to_owned();
    Ok(())
}
```

Prompts remain the right place to explain how work should happen. The graph
keeps the few facts that must survive after the explanation is gone. It does
not replace judgment. It replaces guessing about declared state.

Exact excerpt from
`/Users/joe/dev/godmode/crates/godmode-core/src/graph.rs`.

```rust
#[test]
fn start_fails_on_unmet_deps() {
    let mut graph = graph_with_chain();
    let error = start(&mut graph, "t2").unwrap_err();
    assert!(error.to_string().contains("unmet dependencies"));
}
```

## Sources

- [Godmode task model](https://github.com/89jobrien/godmode/blob/ce4128718f96fb668fe23025d48c4fa72ef88fe4/crates/godmode-core/src/model.rs)
- [Godmode graph persistence and readiness](https://github.com/89jobrien/godmode/blob/ce4128718f96fb668fe23025d48c4fa72ef88fe4/crates/godmode-core/src/graph.rs)
- [Godmode session transitions](https://github.com/89jobrien/godmode/blob/ce4128718f96fb668fe23025d48c4fa72ef88fe4/crates/godmode-core/src/session.rs)
- [Godmode handoff command](https://github.com/89jobrien/godmode/blob/ce4128718f96fb668fe23025d48c4fa72ef88fe4/crates/godmode-cli/src/commands/handoff.rs)
- [Installed pre-commit hook](https://github.com/89jobrien/godmode/blob/ce4128718f96fb668fe23025d48c4fa72ef88fe4/hooks/pre-commit.nu)
- Local Rust pre-commit audit: `/Users/joe/dev/godmode/crates/godmode-core/src/hooks/pre_commit.rs` at `c7f001f8685c12937865271278353565664cfeb1`
