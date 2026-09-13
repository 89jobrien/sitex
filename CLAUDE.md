# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

<what-this-is>
Personal site (project write-ups + blog) built with [Zola](https://www.getzola.org) from a
[zk](https://github.com/zk-org/zk) notebook. Content lives under `content/` as plain markdown
with YAML frontmatter — the same files are managed by zk as notes (search, tags, links) and
read directly by Zola as pages. There is no conversion step between the two.

This repo (`sitex`) is intentionally separate from `~/dev/89jobrien.github.io`, which is generated output
synced daily from the `bazaar` repo's generator (`bazaar-gen`). Do not merge or sync this repo
into that pipeline without an explicit decision to retire the bazaar sync — the two are not
currently connected.
</what-this-is>

## Commands

<commands>
```
zola serve                # local preview with live reload
zola serve --open         # same, opens it in the default browser
zola build                # build to public/ (gitignored)
bun run graph:data:write  # regenerate static/data/content-graph.json only
bun run graph:data:check  # check manifest freshness
bun run graph:write       # regenerate manifest and browser bundle
bun run graph:check       # check both committed graph artifacts
zk new-project --title "Some Project"   # creates content/projects/<slug>.md
zk new-post --title "Some Post"         # creates content/blog/<slug>.md
zk list-projects          # list notes in content/projects (excludes _index.md)
zk list-posts             # list notes in content/blog, sorted by date desc
zk new-idea --title "Some Idea"       # creates ideas/queue/some-idea.md
zk list-ideas                          # list active pitches with priority and status
```

`zk` aliases are defined in `.zk/config.toml` under `[alias]`.
</commands>

## Architecture

<architecture>
- **Frontmatter format is YAML (`---`), not TOML (`+++`)**, chosen deliberately: zk only parses
  YAML frontmatter, while Zola supports both. Using YAML lets one file serve both tools. Do not
  introduce TOML frontmatter into `content/` or `ideas/` — zk will fail to read metadata on
  those notes.
- `.zk/config.toml` defines three note groups, each with its own template:
  - `group.projects` → `content/projects`, template `.zk/templates/project.md` (adds an
    `extra.repo` field for linking to the project's GitHub repo)
  - `group.blog` → `content/blog`, template `.zk/templates/post.md`
  - `group.ideas` → `ideas/queue`, template `.zk/templates/idea.md`
  - `note.filename = "{{slug title}}"` — filenames are derived from the note title, not zk's
    default ID scheme.
- The private `ideas` zk group writes pitch cards to `ideas/queue/`, outside Zola's
  `content/` tree. Active notes use `seed`, `researching`, or `ready`; published pitch
  history moves to `ideas/published/` with `status: published`. Pitch metadata is `title`,
  `date`, `status`, `priority`, `theme`, and `effort`; each body contains Hook, Thesis, Reader
  Value, Evidence, Mini Outline, and Readiness sections. Never place unpublished pitch notes
  under `content/`.
- Zola side mirrors this with `content/projects/_index.md` and `content/blog/_index.md`, each
  setting `page_template` so section listing pages and individual pages render differently
  (`projects.html`/`project.html` vs `blog.html`/`post.html`).
- Project and post relationship metadata uses Zola taxonomies plus custom YAML metadata:
  ```yaml
  taxonomies:
    tags: [agent-workflows, rust]
  extra:
    related: [project:minibox, post:policy-between-intent-and-effects]
  ```
  Graph IDs are `project:<file-stem>` and `post:<file-stem>`. Tags must be unique lowercase
  kebab-case values; `extra.related` is optional and contains unique existing IDs other than
  the current page. Curated relationships render reciprocally, while **Referenced by** is
  derived only from incoming Markdown links. Shared tags qualify when pages share at least
  two tags or have tag similarity of at least `0.5`. Related cards are limited to four.
- Drafts and section indexes are excluded from the graph. The generator infers known
  `/projects/` and `/blog/` routes and relative Markdown links into those sections. Copied
  README-relative links such as `README.md`, `docs/...`, and assets are ignored, not rewritten.
  Custom Zola `slug` or `path` frontmatter is unsupported for graph participants and fails
  generation.
- `static/data/content-graph.json` and `static/js/content-graph.js` are committed generated
  artifacts. Run the `graph:data:*` commands for manifest-only work and `graph:write` or
  `graph:check` when validating both artifacts. Bun `1.3.10` is the package manager and task
  runner; Zola `0.23.3` builds the site. Versions are pinned in `.mise.toml`.
- `/tags/` provides taxonomy browsing. `/graph/` starts with a complete server-rendered content
  list and progressively adds filters and an SVG graph. If the manifest request or enhancement
  fails, the list remains available and the SVG is left empty.
- `templates/base.html` is the shared shell (nav, footer); all other templates `{% extends %}`
  it and override the `title`/`content` blocks.
- `config.toml` sets `base_url` to the GitHub Pages `/sitex` deployment URL; keep generated
  links prefix-safe with Zola's `get_url` helpers.
</architecture>

## Deployment

<deployment>
`.github/workflows/deploy.yml` builds with Zola and publishes to GitHub Pages via
`actions/deploy-pages` on push to `main`. Requires the repo's Pages source set to "GitHub
Actions" in GitHub settings.
</deployment>
