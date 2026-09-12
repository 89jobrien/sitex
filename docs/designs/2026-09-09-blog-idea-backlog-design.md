# Design: Private Blog Idea Backlog

## Goal

Create a private, searchable editorial queue of 12 strong blog pitches that turns project-specific experience and broader engineering judgment into publishable posts for a mixed technical and non-technical audience.

## Approved Approach

Use the approved **Curated Pitch Queue** approach: each idea is an independent zk note outside Zola's `content/` tree, with consistent metadata, editorial fields, and a manual lifecycle.

## Context Map

### Files to Modify

| File                    | Purpose                | Changes Needed                                                        |
| ----------------------- | ---------------------- | --------------------------------------------------------------------- |
| `.zk/config.toml`       | zk groups and aliases  | Add the `ideas` group plus `new-idea` and `list-ideas` aliases.       |
| `.zk/templates/idea.md` | Idea-note template     | Define the pitch-card metadata and required editorial sections.       |
| `ideas/queue/*.md`      | Active editorial queue | Add 12 complete pitch cards using the approved 6/4/2 mix.             |
| `README.md`             | User-facing workflow   | Document idea capture, review, and promotion commands.                |
| `CLAUDE.md`             | Repository guidance    | Document the private ideas group, lifecycle, and publishing boundary. |

### Dependencies

| File                     | Relationship                                                             |
| ------------------------ | ------------------------------------------------------------------------ |
| `.zk/templates/post.md`  | Existing template used when a ready idea becomes a published draft.      |
| `content/blog/_index.md` | Establishes that published posts live under `content/blog/`.             |
| `content/blog/*.md`      | Defines the existing post voice, structure, and overlap exclusions.      |
| `content/projects/*.md`  | Supplies firsthand project evidence for the initial queue.               |
| `config.toml`            | Confirms Zola builds site content rather than the private `ideas/` tree. |

### Test Coverage

| Check                                                                                  | Covers                                                        |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `zk new --group ideas ideas/queue --title "Design Smoke Test" --dry-run`               | Group routing and template rendering without creating a note. |
| `zk list ideas/queue --format '{{metadata.priority}} [{{metadata.status}}] {{title}}'` | Custom metadata parsing and queue discovery.                  |
| `zola build`                                                                           | Existing public site still builds successfully.               |
| Verify no `public/ideas/` output exists                                                | Private notes remain outside the published site.              |
| Count `ideas/queue/*.md`                                                               | Initial active queue contains exactly 12 notes.               |

There is no automated test suite in this repository. These command-level checks are the acceptance tests for the configuration and content change.

### Reference Patterns

| File                                         | Pattern to Follow                                                     |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `.zk/config.toml`                            | Existing `projects` and `blog` group declarations and aliases.        |
| `.zk/templates/post.md`                      | YAML frontmatter compatible with zk.                                  |
| `content/blog/25-projects-no-monorepo.md`    | Firsthand technical essay grounded in workspace practice.             |
| `content/blog/hooks-mid-rewrite.md`          | Evidence-led narrative built around a concrete failure and migration. |
| `content/blog/godmode-vs-agent-platforms.md` | Comparative explanation for readers outside one codebase.             |

### Risk

- [x] No Rust crate or `Cargo.toml` exists; ownership is repository configuration and content.
- [x] No public Rust API, serialization format, or crate dependency changes.
- [x] No circular dependency: zk indexes the notes, while Zola never reads them.
- [x] Custom frontmatter is available through zk's `metadata` object, matching the existing project-note pattern.
- [x] "Private" means excluded from publication, not secret or unversioned; idea notes remain committed to Git.

## Repository Ownership

- **Owner**: `.zk/config.toml` and `.zk/templates/idea.md` own the editorial workflow contract.
- **Content owner**: `ideas/queue/` owns active pitches; published articles continue to belong to `content/blog/`.
- **Affected runtime**: zk only. Zola templates, Sass, deployment, and generated site output remain unchanged.

No new crate, executable, service, or external dependency is required.

## User-Facing Contract

The design adds two zk aliases:

```text
zk new-idea --title "Working Title"
zk list-ideas
```

`new-idea` creates a note in `ideas/queue/` using the `ideas` group and `idea.md` template. `list-ideas` lists active notes with priority, status, and title; prioritization remains editorial judgment rather than a computed score.

## Pitch Card Schema

Every active note uses YAML frontmatter:

```yaml
---
title: "Working Title"
date: 2026-09-09
status: seed
priority: P3
theme: general
effort: medium
---
```

Field contracts:

| Field      | Allowed values                              | Meaning                                        |
| ---------- | ------------------------------------------- | ---------------------------------------------- |
| `title`    | Non-empty string                            | Working article title and zk note title.       |
| `date`     | `YYYY-MM-DD`                                | Date the idea entered the queue.               |
| `status`   | `seed`, `researching`, `ready`, `published` | Manual editorial lifecycle.                    |
| `priority` | `P1`, `P2`, `P3`                            | Relative editorial priority; P1 is highest.    |
| `theme`    | Short lowercase slug                        | Primary subject used for zk search and review. |
| `effort`   | `small`, `medium`, `large`                  | Expected research and drafting effort.         |

Every note body contains these sections in this order:

1. `## Hook` - the tension, surprise, or practical problem.
2. `## Thesis` - one defensible central claim.
3. `## Reader Value` - distinct value for engineers and decision-makers.
4. `## Evidence` - projects, commits, incidents, benchmarks, or diagrams needed.
5. `## Mini Outline` - three to five narrative beats.
6. `## Readiness` - known gaps and one concrete next research action.

## Queue Invariants

- `ideas/queue/` contains at most 12 unpublished notes.
- A new idea enters only after an active idea is published or removed from the queue.
- `seed` may advance to `researching`; `researching` may advance to `ready`; `ready` may advance to `published`.
- Publishing creates a normal post through `zk new-post`; it does not move or copy the pitch body automatically.
- A published pitch moves from `ideas/queue/` to `ideas/published/` and retains `status: published` as editorial history.
- Removing an abandoned pitch deletes it from the active tree; Git history remains the archive.
- Metadata changes and lifecycle transitions are manual. No command enforces capacity or state transitions.

## Initial Queue

The first queue contains six project case studies, four broader engineering essays, and two reflective pieces. Each implementation note will expand the row into the complete pitch-card schema.

| Priority | Category           | Working title                                             | Core evidence or argument                                                                                                 |
| -------- | ------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| P1       | Project case study | What a Task Graph Can Enforce That a Prompt Cannot        | Use godmode's persistent causal tasks and commit gates to show where prose instructions stop being reliable.              |
| P1       | Project case study | Designing a Container Runtime an Agent Can Safely Operate | Use minibox's policy-gated MCP surface, daemon boundary, and read-only defaults.                                          |
| P1       | Project case study | Redaction Is a System Boundary, Not a Cleanup Step        | Use obfsck's tiered redaction and pre-commit integration to argue for protection before data leaves a trust boundary.     |
| P1       | Broader essay      | Replayability Matters More Than Agent Autonomy            | Use crux's typed traces and replay model to shift the agent-runtime discussion from independence to recoverability.       |
| P2       | Project case study | One CLI Surface Across MCP, OpenAPI, GraphQL, and Shell   | Use mcpipe to examine the value and cost of normalizing unlike tool protocols.                                            |
| P2       | Project case study | Make Contract Drift Fail Before It Becomes Migration Work | Use taskit's tracked protocol surfaces to explain why contract changes need an explicit gate.                             |
| P2       | Project case study | Machine-Readable Output Changes Who a CLI Is For          | Use doob's JSON output, batch operations, and context detection to contrast human-first and agent-first interfaces.       |
| P2       | Broader essay      | Treat Agent Prompts Like Interfaces                       | Define prompts as versioned behavioral contracts that need examples, boundaries, and conformance checks.                  |
| P3       | Broader essay      | Policy Gates Belong Between Intent and Side Effects       | Generalize the shared pattern across minibox and development hooks without repeating the existing hook-migration article. |
| P3       | Broader essay      | Hexagonal Architecture Is a Change-Budget Tool            | Explain ports and adapters through the practical cost of replacing runtimes, providers, and storage backends.             |
| P3       | Reflective         | A Tool Starts Paying Rent When It Changes Your Behavior   | Distinguish interesting prototypes from tools that alter daily engineering decisions and habits.                          |
| P3       | Reflective         | Technical Depth Is Evidence, Not the Story                | Show how to translate systems detail into outcomes that clients, hiring managers, and technical peers can all evaluate.   |

## Data Flow

1. **Capture**: `zk new-idea` selects the ideas group and renders `.zk/templates/idea.md` into `ideas/queue/<slug>.md`.
2. **Develop**: the writer edits pitch sections and manually updates status, priority, theme, and effort as evidence improves.
3. **Review**: `zk list-ideas` discovers active notes and exposes their editorial metadata for queue review.
4. **Promote**: a ready pitch creates a separate post through the existing `zk new-post` flow under `content/blog/`.
5. **Retain**: the source pitch moves to `ideas/published/` with `status: published`.
6. **Publish**: Zola reads `content/blog/` and ignores `ideas/`, preserving the publication boundary.

## Hexagonal Boundaries

No application-level port or adapter is introduced because this is a declarative zk content workflow, not production code. zk is the editor/index adapter selected by repository configuration; Markdown files are the durable source of truth, and Zola remains an independent read-only consumer of `content/`.

## Integration Points

- `.zk/config.toml` registers `ideas/queue` as a third note group and exposes its aliases.
- `.zk/templates/idea.md` supplies the stable schema for future pitches.
- Existing blog creation remains unchanged and is invoked only after a pitch reaches `ready`.
- `README.md` documents the human workflow; `CLAUDE.md` prevents agents from placing private pitches under `content/`.
- The GitHub Pages workflow remains untouched because Zola's source boundary already excludes `ideas/`.

## Out of Scope

- A public ideas page or public roadmap.
- Automatic topic generation, scoring, ranking, or lifecycle enforcement.
- Publication scheduling, analytics, feeds for ideas, or calendar integration.
- Zola template, Sass, navigation, deployment, or GitHub Actions changes.
- Synchronization with bazaar or `89jobrien.github.io`.
- Retrofitting existing posts into pitch notes.
- Treating the committed queue as suitable for secrets or confidential client material.

## Acceptance Criteria

- The ideas group creates correctly structured YAML-frontmatter notes under `ideas/queue/`.
- The initial active queue contains exactly 12 complete pitch cards in the approved 6/4/2 mix.
- Every card includes all six required body sections and concrete evidence sources.
- `zk list-ideas` displays every active pitch with priority and status.
- A normal `zola build` succeeds and emits no route or file for `ideas/`.
- Existing blog content, templates, and deployment behavior remain unchanged.

## Risk Summary

- [ ] Breaking API changes: no.
- [ ] New external dependency: no.
- [ ] Feature flag required: no.
- [ ] Publication leak risk: low, controlled by keeping every pitch outside `content/` and verifying build output.
- [ ] Editorial drift risk: moderate, accepted because prioritization and lifecycle are intentionally manual.
