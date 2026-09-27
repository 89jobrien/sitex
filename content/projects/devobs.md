---
title: "devobs"
date: 2026-08-18
description: "Public Obsidian vault tracking open-source projects under 89jobrien, kept up to date by crux pipelines and populated with kgx knowledge graphs rather than edited by hand."
extra:
  repo: "https://github.com/89jobrien/devobs"
---

Public Obsidian vault for tracking open-source projects under [89jobrien](https://github.com/89jobrien). Automated with [crux](https://github.com/89jobrien/crux) pipelines and [kgx](https://github.com/89jobrien/kgx) knowledge graphs.

## Structure

Full project [[index]]

| Folder              | Purpose                                       |
| ------------------- | --------------------------------------------- |
| `00_Inbox`          | Unsorted captures                             |
| `01_Daily`          | Daily notes                                   |
| `02_Projects`       | One PROJECT note per public repo              |
| `03_Area-Systems`   | Ongoing systems context                       |
| `04_Research`       | Analysis and design docs                      |
| `05_Knowledge`      | Generated graphs, maps, reports               |
| `06_Experiments`    | Experiment logs                               |
| `07_Infrastructure` | Machine and toolchain docs                    |
| `08_Templates`      | Note templates                                |
| `09_Archive`        | Inactive content                              |
| `schemas`           | JSON schemas for frontmatter and kgx payloads |
| `pipelines`         | Crux pipeline definitions                     |

## Pipelines

```bash
# Ingest all PROJECT notes into the kgx knowledge graph
crux run pipelines/devobs_ingest.crux

# Run quality gates (obfsck, agentlint, schema validation)
crux run pipelines/devobs_lint.crux

# LLM-assisted relationship discovery
crux run pipelines/devobs_enrich.crux

# Full CI: lint + ingest
crux run Cruxfile
```

## Schemas

- `schemas/project.schema.json` — PROJECT note frontmatter contract
- `schemas/kgx-ingest.schema.json` — kgx ingest payload format

## Scope

Only public repos with local clones in `~/dev/` are tracked.
Private repos, employer projects, and repos without local clones
are excluded.

## License

MIT
