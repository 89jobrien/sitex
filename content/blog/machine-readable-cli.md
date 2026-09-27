---
title: Machine-Readable Output Changes Who a CLI Is For
date: 2026-09-11
description: "What Doob's JSON listing, batch command inputs, and exit behavior taught me about CLIs becoming APIs."
---

`--json` stops being a formatting option when another program parses it.

Doob is a terminal tool, but Godmode and agent workflows also query its todos.
Human output can optimize for scanning. Machine output needs a shape that
survives unattended use (`/Users/joe/dev/doob/crates/doob/src/output/json.rs`):

```rust
pub fn format_todos(todos: &[Todo]) -> String {
    let output = json!({
        "count": todos.len(),
        "todos": todos
    });
    serde_json::to_string_pretty(&output).unwrap()
}
```

## JSON creates consumers you cannot see

A person can tolerate a renamed heading or an extra warning. A parser can't.
Changing `todos` to `items`, printing diagnostics before the document, or
replacing a number with an object can break a caller while the terminal still
looks reasonable.

The payload also exposes IDs, timestamps, project context, dependencies, and
metadata. Doob does not currently document that full representation as a stable
public contract (`/Users/joe/dev/doob/crates/doob-core/src/models/todo.rs`, shortened):

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Todo {
    pub id: Option<String>,
    pub uuid: String,
    pub content: String,
    pub status: TodoStatus,
    pub priority: u8,
    pub project: Option<String>,
    pub file_path: Option<String>,
    pub blocks: Vec<String>,
    pub blocked_by: Vec<String>,
}
```

Machine mode should be a separate interface backed by the same domain result.
Doob's list command does this cleanly. The repository returns `Vec<Todo>`, then
the CLI chooses a formatter (`/Users/joe/dev/doob/crates/doob/src/main.rs`, shortened):

```rust
let todos = commands::list::execute(repo, status, project, limit).await?;

if cli.json {
    println!("{}", output::format_json(&todos));
} else {
    println!("{}", output::format_human(&todos));
}
```

That split is not consistent across the whole CLI. `--json` is global, but add,
complete, remove, undo, update, and several handoff mutations still print human
confirmation lines. Callers should not assume the flag makes every subcommand
structured (`/Users/joe/dev/doob/crates/doob/src/main.rs`, shortened):

```rust
let todos =
    commands::add::execute(repo, content, priority, project, file, tags).await?;

for todo in &todos {
    println!("✓ Created todo: {}", todo.content);
}
```

## Agents need operations, not terminal mimicry

Batch arguments are useful, but one invocation does not imply one transaction.
Complete, remove, and undo process IDs sequentially. An error can leave earlier
items changed and later items untouched.

That caveat belongs in the machine contract. Completion currently returns only
the count reached before success or the first error
(`/Users/joe/dev/doob/crates/doob/src/commands/complete.rs`):

```rust
pub async fn execute(repo: &dyn TodoRepository, ids: Vec<String>) -> Result<usize> {
    let mut completed_count = 0;

    for id in ids {
        repo.complete_todo(&id).await?;
        completed_count += 1;
    }

    Ok(completed_count)
}
```

Creation accepts several todo strings too. The SurrealDB adapter loops over
them and issues one create query at a time. A future structured batch result
would need to report each item rather than imply atomic persistence
(`/Users/joe/dev/doob/crates/doob-surrealdb/src/todo.rs`, shortened):

```rust
let mut created_todos = Vec::new();

for (uuid, content, priority, project, file_path, tags) in todos {
    let mut result = self.db.query(&query).await?;
    let created: Option<Todo> = result.take(0)?;

    if let Some(todo) = created {
        created_todos.push(todo);
    }
}
```

Implicit context must become visible too. Doob derives a project from the
`origin` remote when possible. It records a non-root working directory as a
relative file path and leaves it unset at the repository root
(`/Users/joe/dev/doob/crates/doob-core/src/context/git.rs`, shortened):

```rust
let cwd = env::current_dir().ok()?;
let repo = Repository::discover(&cwd).ok()?;
let workdir = repo.workdir()?;
let rel_path = cwd.strip_prefix(workdir).ok()?;

if rel_path.as_os_str().is_empty() {
    None
} else {
    Some(rel_path.to_string_lossy().to_string())
}
```

Godmode is one of the consumers Doob's terminal user cannot see. It requests
JSON with a project filter, parses the document, and selects pending work. It
does not scrape columns or remove color codes
(`/Users/joe/dev/godmode/crates/godmode-core/src/integrations/doob.rs`):

```rust
pub fn todo_list(project: &str) -> Result<serde_json::Value> {
    let raw = subprocess::run(
        "doob",
        &["todo", "list", "-p", project, "--json"],
        "doob not found on PATH",
    )?;
    parse_todo_list(raw.as_bytes())
}
```

`godmode handon` can surface the next todo when integration is enabled.
`godmode task pull` imports pending todos as independent tasks, so dependency
edges still need separate handling. The imported task retains Doob provenance
(`/Users/joe/dev/godmode/crates/godmode-core/src/integrations/doob.rs`, shortened):

```rust
let id = t.get("id")?.as_str()?;
let title = t.get("content")?.as_str()?;
let mut task = Task::new(format!("doob-{}", &id[..8.min(id.len())]), title);
task.notes = format!("doob:{id}");
task.set_doob_id(id);
```

## Keep the human interface human

None of this requires JSON by default. `doob todo list` should remain fast to
scan. Human output can change spacing, labels, and color without asking every
parser for permission.

The important part is not mixing contracts. The command layer already returns
domain values without presentation, which gives both formatters the same source
of truth (`/Users/joe/dev/doob/crates/doob/src/commands/list.rs`):

```rust
pub async fn execute(
    repo: &dyn TodoRepository,
    status: Option<String>,
    project: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<Todo>> {
    repo.list_todos(status.as_deref(), project.as_deref(), limit).await
}
```

## Compatibility includes failure

Success is not the whole API. Doob maps top-level errors to exit categories and
writes diagnostics to stderr. The caveat is that classification currently
inspects error text, and unknown errors fall back to `DatabaseError`
(`/Users/joe/dev/doob/crates/doob-core/src/error.rs`, shortened):

```rust
if msg.contains("permission denied") || msg.contains("no such file") {
    ExitCode::IoError
} else if msg.contains("failed to parse") {
    ExitCode::ParseError
} else if msg.contains("not found") {
    ExitCode::TodoNotFound
} else {
    ExitCode::DatabaseError
}
```

A machine-readable mode changes the audience. The CLI becomes a dependency,
even if nobody publishes an SDK. Treating stdout shape, partial mutation,
context, and failure behavior as API decisions early is cheaper than discovering
the contract after several tools rely on it. Doob's entry point already keeps
top-level diagnostics off stdout (`/Users/joe/dev/doob/crates/doob/src/main.rs`, shortened):

```rust
Err(e) => {
    let code = ExitCode::from_error(&e);
    eprintln!("{:?}", Report::msg(format!("{e:#}")));
    process::exit(code as i32);
}
```

## Sources

- [Doob JSON envelope](https://github.com/89jobrien/doob/blob/main/crates/doob/src/output/json.rs)
- [Serialized todo model](https://github.com/89jobrien/doob/blob/main/crates/doob-core/src/models/todo.rs)
- [Human and JSON list paths](https://github.com/89jobrien/doob/blob/main/crates/doob/src/main.rs)
- [Git context detection](https://github.com/89jobrien/doob/blob/main/crates/doob-core/src/context/git.rs)
- [Sequential batch persistence](https://github.com/89jobrien/doob/blob/main/crates/doob-surrealdb/src/todo.rs)
- [Sequential completion](https://github.com/89jobrien/doob/blob/main/crates/doob/src/commands/complete.rs)
- [Sequential removal](https://github.com/89jobrien/doob/blob/main/crates/doob/src/commands/remove.rs)
- [Sequential undo](https://github.com/89jobrien/doob/blob/main/crates/doob/src/commands/undo.rs)
- [Exit-code classification](https://github.com/89jobrien/doob/blob/main/crates/doob-core/src/error.rs)
- [Godmode's Doob JSON integration](https://github.com/89jobrien/godmode/blob/main/crates/godmode-core/src/integrations/doob.rs)
- [Godmode session integration](https://github.com/89jobrien/godmode/blob/main/crates/godmode-core/src/integrations/mod.rs)
- [Godmode explicit task pulling](https://github.com/89jobrien/godmode/blob/main/crates/godmode-cli/src/commands/task.rs)
- [Godmode task dependency defaults](https://github.com/89jobrien/godmode/blob/main/crates/godmode-core/src/model.rs)
