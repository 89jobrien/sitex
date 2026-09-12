---
title: Machine-Readable Output Changes Who a CLI Is For
date: 2026-09-11
description: "What Doob's JSON listing, batch command inputs, and exit behavior taught me about CLIs becoming APIs."
---

Adding `--json` to a CLI looks like a formatting option. The first time another
program parses that output, it becomes an API decision.

That is especially visible in Doob, my cross-project todo tool. I use it
directly in a terminal, but `godmode`, handoff tooling, and agent sessions also
need to list and update the same work. Pretty terminal output is useful to me.
Stable structure is useful to everything around me.

## JSON creates consumers you cannot see

A person can tolerate a renamed heading or an extra explanatory line. A
parser cannot. If Doob changes `priority` to `rank`, moves `todos` under a new
object, or prints a warning to stdout before the JSON document, a downstream
tool may stop working even though the command still looks fine in a terminal.

That means machine-readable output needs a deliberate shape. Doob's list path
writes JSON data to stdout and top-level errors to stderr. Several mutation
commands still emit human text even when `--json` is present, so the structured
contract does not yet cover the whole CLI.

Once those rules exist, `--json` is not a second coat of paint on the human
output. It is a separate interface backed by the same domain operation.

A useful response includes both the collection and enough context to interpret
it:

```json
{
  "count": 1,
  "todos": [
    {
      "content": "Verify release artifacts",
      "status": "pending",
      "priority": 1
    }
  ]
}
```

This abbreviated example omits fields from the full serialized todo. A caller
can select pending work without scraping columns or guessing whether color
codes are present. The record ID returned by `todo list --json` can be passed
to a later complete, undo, or remove operation, although Doob does not document
that representation as a stable public contract.

This also creates obligations. If priority later needs more structure, Doob
cannot casually replace the number with a nested object. It needs an additive
change, a version boundary, or a coordinated update to consumers.

## Agents need operations, not terminal mimicry

Doob accepts several todos or IDs in one add, complete, remove, or undo
command. The implementation processes them sequentially rather than
transactionally, so an error can leave earlier items changed and later items
untouched. One call is convenient, but it is not atomic.

Git-based context detection serves both audiences too. When available, Doob
derives the project from the `origin` remote and records a non-root working
directory relative to the repository root. At the repository root that path is
unset. The resolved context appears in the serialized todo rather than
remaining hidden state.

The design question becomes: what would a careful API client need to know?
That question improves the CLI even for people. Errors get clearer, operations
get better boundaries, and implicit context becomes visible.

At session start, `godmode handon` can display the next Doob todo for its
detected project. When work becomes active, `godmode task pull` explicitly
imports pending todos as independent tasks; dependencies have to be added
separately. The integration requests JSON rather than scraping Doob's terminal
table.

Batch input still exposes a gap in the current machine interface. One command
can accept several todos, but creation emits human lines and persistence is
sequential. A future structured batch result would need to represent partial
success rather than imply transactionality.

## Keep the human interface human

None of this means every command should print JSON by default. I still want
`doob todo list` to be quick to scan. A human-oriented view can use spacing,
labels, and color without promising that another program can parse it forever.

The important part is not to mix the contracts. Human output can evolve with
the experience. Machine output should evolve with compatibility in mind.

The moment a CLI gains a machine-readable mode, its audience changes. It is
still a command-line tool, but it is also a dependency. Treating it that way
early is much easier than discovering the contract after several other tools
already rely on it.

## Compatibility includes failure

Successful JSON gets most of the attention, but failure behavior is just as
important. A client needs to distinguish "the todo does not exist" from "the
database could not be opened." A person may understand both from a sentence;
automation needs a stable exit status and a diagnostic in the right stream.

This is where CLIs often become awkward APIs. Doob maps most top-level failures
to documented exit categories, but some classification is text-based and not
every subcommand follows the contract consistently. Callers should not yet
treat all of its failure behavior as a strict API.

Designing for that caller does not make the terminal experience colder. It
forces the domain operation to have a clear result before either formatter
touches it. The human view and the JSON view can then differ in presentation
without disagreeing about what happened.

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
