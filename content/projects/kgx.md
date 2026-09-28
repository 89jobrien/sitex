---
title: "kgx"
date: 2026-08-18
description: "Three-layer knowledge graph toolkit in Rust with JSON-backed storage and no external database -- a GraphStore (BFS traversal, confidence filtering), DocumentStore (chunking with document-level source links), and WikiStore (markdown pages with wikilinks) behind a kgx library and kgx-cli binary."
taxonomies:
  tags: [cli, knowledge-systems, observability]
extra:
  repo: "https://github.com/89jobrien/kgx"
  related: [project:devobs]
---

Three-layer knowledge graph toolkit in Rust.

JSON-backed storage with no external database required -- entities,
relations, documents, and wiki pages all persist as plain files. See
[Known limitations](#known-limitations) before relying on the
provenance claims.

## Architecture

```text
                    +-----------------+
                    |    kgx-cli      |  CLI binary
                    +--------+--------+
                             |
          +------------------+------------------+
          |                  |                  |
  +-------+------+  +-------+-------+  +-------+------+
  | GraphStore   |  | DocumentStore |  | WikiStore    |
  | graph.json   |  | documents.json|  | wiki/        |
  +--------------+  +---------------+  +--------------+
   BFS traversal       Chunking &       Markdown pages
   Confidence filter    Doc-level       [[wikilinks]]
                       source links
```

| Layer         | Storage               | Purpose                                                                                                |
| ------------- | --------------------- | ------------------------------------------------------------------------------------------------------ |
| **Graph**     | `data/graph.json`     | Entity-relation graph, BFS traversal, confidence                                                       |
| **Documents** | `data/documents.json` | Chunked document store with document-level source links; re-ingesting a `doc_id` replaces the document |
| **Wiki**      | `wiki/`               | Markdown pages with `[[wikilinks]]`, search, lint                                                      |
| **Export**    | (output dir)          | JSON or Markdown export of the full context graph                                                      |

## Quick Start

### Initialize a workspace

```bash
kgx --root ./my-kb init
```

### Add entities and relations

```bash
kgx --root ./my-kb graph add-node "Rust" --type language
kgx --root ./my-kb graph add-node "Memory Safety" --type concept
kgx --root ./my-kb graph add-edge "Rust" "Memory Safety" \
    --type enables --confidence 0.95
```

### Ingest a document with entities and relations

```bash
kgx --root ./my-kb ingest --file notes.json
```

### Search the graph

```bash
kgx --root ./my-kb graph search "Rust"
```

### Write and search wiki pages

```text
kgx --root ./my-kb wiki write --category entity --title "Rust" \
    --summary "A systems language" < rust.md
kgx --root ./my-kb wiki search "memory"
```

### Lint for broken wikilinks

```bash
kgx --root ./my-kb wiki lint
```

### Export

```bash
kgx --root ./my-kb export --format json --output ./export

# Export as Obsidian-compatible markdown vault
kgx --root ./my-kb export --format markdown --output ./vault
```

### Workspace stats

```bash
kgx --root ./my-kb stats
```

## Library Usage

```rust
use kgx::{GraphStore, DocumentStore, WikiStore, WikiCategory};

let mut graph = GraphStore::open("data/graph.json")?;
let mut docs = DocumentStore::open("data/documents.json")?;
let wiki = WikiStore::open("wiki/")?;

// Build the graph
let leak = graph.add_node("memory leak", "issue",
    Some("causes crashes"), Some("doc_001"));
let crash = graph.add_node("system crash", "issue",
    Some("system crashes"), Some("doc_001"));
graph.add_edge(leak, crash, "causes", 1.0,
    Some("crashes due to memory leaks"), Some("doc_001"));

// BFS traversal
let (nodes, edges) = graph.bfs_subgraph(leak);

// Wiki with wikilinks and lint
wiki.write_page(WikiCategory::Summary, "Incident Report",
    "# Report\n\n[[memory-leak]] causes [[system-crash]].",
    "Summary of the incident.")?;
let report = wiki.lint()?;

graph.save()?;
docs.save()?;
```

## Export

`kgx export` serializes the full context graph (entities, relations,
documents, wiki pages) to a target directory.

| Format     | Output                                         |
| ---------- | ---------------------------------------------- |
| `json`     | Single `kgx-export.json` with all layers       |
| `markdown` | Obsidian-compatible vault with `[[wikilinks]]` |

The markdown export creates:

```text
output/
  entities/       # One .md per entity with frontmatter, relations, chunks
  documents/      # One .md per document with chunk boundaries
  wiki/           # Mirrors wiki category structure with backlinks
  index.md        # Stats and links to all pages
```

Entity files include YAML frontmatter, relation links, inlined source
chunks, and cross-references to wiki pages -- ready to open as an
Obsidian vault.

## Retrieval Constraints

| Constant          | Value | Purpose                       |
| ----------------- | ----- | ----------------------------- |
| `MAX_GRAPH_DEPTH` | 2     | BFS traversal limit           |
| `MIN_CONFIDENCE`  | 0.6   | Edges below this are rejected |
| `MAX_NODES`       | 50    | Max nodes returned per query  |

An edge that fails the confidence threshold is discarded at write time and
never recorded. Omitting `--confidence` defaults to `1.0`, the maximum, so
an unspecified score always passes the gate.

## Known limitations

Verified against `main` @ `0c08171`. These are behavioral facts, not plans.

- **Provenance is document-level, not span-level.** Nodes and edges carry a
  `source_doc` id; nothing references a specific chunk. `QueryResult.supporting_chunks`
  is a flat list of every chunk of every cited document, with no back-pointer
  to the node or edge it supposedly supports.
- **Re-ingestion orphans citations.** `DocumentStore::ingest` replaces the
  document, destroying the previous text and its chunk ids. Entities and
  relations derived from the old revision survive and keep citing the same
  `doc_id`, which now points at text that no longer contains the claim.
- **Edges do not deduplicate on ingest.** `add_node` merges by lowercased
  name; `add_edge` always appends. Re-ingesting a document duplicates every
  relation. `MergeOp` implements dedup but is unreachable from the CLI, and
  its key omits `source_doc`, so merging two documents that assert the same
  edge silently discards the second document's citation.
- **No timestamps, content hashes, line ranges, versioning, or decay.** Every
  record is last-write-wins.
- **Confidence is uncalibrated.** All 30 edges in the bundled dataset sit at
  exactly `1.0`.
- **GitLab, local-git, and two GitHub sources are placeholders.**
- **No indexing.** `bfs_subgraph` scans the full edge list per dequeued node
  and `save()` rewrites the whole file, so cost grows with `O(nodes x edges)`.

## Code Quality

Measured with `rustqual 1.2.0` on `main` @ `0c08171`:

| Dimension       | Result                                                    |
| --------------- | --------------------------------------------------------- |
| `iosp_score`    | 100%                                                      |
| `quality_score` | 84.2%                                                     |
| Test quality    | 0 untested warnings, 0 missing-assertion warnings         |
| Coupling        | 0 warnings, 0 cycles                                      |
| Dead code       | 0 warnings (per-crate; CLI-unreachable ops count as used) |

Open warnings: 3 complexity, 6 function-length, 8 magic-number,
13 boilerplate, 2 module-SRP, 1 parameter-SRP, 2 error-handling,
and 3 active suppressions.

## License

MIT OR Apache-2.0
