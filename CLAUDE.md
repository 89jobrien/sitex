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
zola serve --open # same, opens it in the default browser
zola build                # build to public/ (gitignored)
zk new-project --title "Some Project" # creates content/projects/<slug>.md
zk new-post --title "Some Post" # creates content/blog/<slug>.md
zk list-projects # list notes in content/projects (excludes _index.md)
zk list-posts # list notes in content/blog, sorted by zk creation time desc
zk new-idea --title "Some Idea" # creates ideas/queue/some-idea.md
zk list-ideas # list active pitches with priority and status
bun run graph:data:write # regenerate static/data/content-graph.json only
bun run graph:data:check # check manifest freshness
bun run graph:write # regenerate manifest and browser bundle
bun run graph:check # check both committed graph artifacts
bun run verify # format, lint, tests, graph freshness, Zola check/build
crux run Cruxfile graph # graph tests and generated-artifact freshness
crux run Cruxfile format # rewrite content Markdown and Sass with Prettier
crux run Cruxfile format-check # non-mutating Prettier check
crux run Cruxfile lint    # non-mutating repository Markdown lint
crux run Cruxfile check # graph, workflow, zk, fail-fast, Zola, and external-link checks
crux run Cruxfile build # check followed by isolated build and prefix-safe smoke checks
crux run Cruxfile ci # non-mutating aggregate; each quality gate runs once
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
  `content/` tree and ignored by Git. Active notes use `seed`, `researching`, or `ready`.
  Published pitches leave the active queue and may be retained under `ideas/published/` with
  `status: published`. Pitch metadata is `title`, `date`, `status`, `priority`, `theme`, and
  `effort`; each body contains Hook, Thesis, Reader Value, Evidence, Mini Outline, and
  Readiness sections. Never place unpublished pitch notes under `content/`.
- Zola side mirrors this with `content/projects/_index.md` and `content/blog/_index.md`, each
  setting `page_template` so section listing pages and individual pages render differently
  (`projects.html`/`project.html` vs `blog.html`/`post.html`).
- `templates/base.html` is the shared shell (nav, footer); all other templates `{% extends %}`
  it and override blocks as needed. `templates/partials/relationships.html` is included by
  detail templates.
- `scripts/*.crux` owns executable workflow behavior; `Cruxfile` is a thin dispatcher. CI
  composes format-check, lint, check, and isolated build once each. Mutating format remains an
  explicit local target outside CI. Repository Markdown scope includes the root docs,
  `content/**/*.md`, `docs/**/*.md`, and `ideas/**/*.md`; `.zk/templates/*.md` remains excluded
  from Prettier and is checked by `scripts/check-zk-templates.sh` instead. The same file lists
  appear in the `format`, `format:check`, and `lint:markdown` scripts in `package.json`; keep
  them aligned.
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
  `graph:check` when validating both artifacts.
- `/tags/` provides taxonomy browsing. `/graph/` starts with a complete server-rendered content
  list and progressively adds filters and an SVG graph. If the manifest request or enhancement
  fails, the list remains available and the SVG is left empty.
- The home page reuses that bundle in preview mode (`data-graph-mode="preview"` in
  `templates/index.html`): no filter controls, no zoom or wheel capture, one settled frame instead
  of an animation, nodes act as links into the target page, and a `<details>` info bubble explains
  the projection. Without JavaScript the section still offers the `/graph/` link. The section sits
  directly below the bio, ahead of featured projects and latest writing, so the graph leads the
  page. Preview branches live in `scripts/content-graph/ui.mjs` and require `bun run graph:bundle`
  so the committed bundle stays fresh.
- Both the home preview and `/graph/` share one hover and keyboard-focus tooltip, a single `.graph-tooltip`
  element appended to the canvas. It is `aria-hidden`, `pointer-events: none`, and positioned from live
  `getBoundingClientRect` geometry rather than simulation coordinates, so it stays correct through
  the settling simulation, zoom, and pan; `updatePositions` re-syncs it on every tick while visible.
  Node text reaches the tooltip only through `textContent`, never `innerHTML`.
- `/sites/` (`templates/sites.html`) is derived from project metadata rather than authored content:
  it lists every project declaring `extra.site`. Sites publish automatically to
  `https://89jobrien.github.io/<repo>/`, so `extra.site` must equal the URL derived from
  `extra.repo`; `scripts/editorial-check.nu` fails the build when it drifts.
- Tested workflow versions are Zola `0.23.3`, zk `0.15.6` or newer, Nushell `0.111.0`, Rust `1.89` or newer,
  `crux-agentic` `0.3.1` at revision `8d54a65`, lychee `0.24.2`, Node.js `22.22.1`, Bun `1.3.10`,
  Prettier `3.9.6`, and `markdownlint-cli2` `0.23.2`. Use `bun install --frozen-lockfile` for the exact
  top-level Node tools. Zola validates local content without network access; lychee owns bounded
  concurrent HTTP(S) checks and accepts timeouts plus HTTP 403 and 429 responses as network-policy
  and rate-limit exceptions while failing other confirmed HTTP errors. Zola, Node, and Bun versions
  are pinned in `.mise.toml` and must match `.github/workflows/validate.yml`.
- `config.toml` enables the Atom feed at `atom.xml`.
- `config.toml` sets the deployed base URL to `<https://89jobrien.github.io/sitex>`; keep generated
  links prefix-safe with Zola's `get_url` helpers.
</architecture>

## Deployment

<deployment>
`.github/workflows/validate.yml` is the non-mutating pull-request quality adapter. It installs
the tested toolchain and runs `crux run Cruxfile ci`, so the gates that run in CI are the same
ones that run locally. `.github/workflows/deploy.yml` is the separate production adapter and
builds with Zola on pushes to `main`. Its deploy job runs via `actions/deploy-pages` only when
the repository variable `PAGES_ENABLED` is `true`; the repo's Pages source must also be set to
"GitHub Actions". Manual dispatch uses the same deployment gate.
</deployment>
