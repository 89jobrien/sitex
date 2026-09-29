# sitex

Personal site: project write-ups + blog, built with [Zola](https://www.getzola.org)
from a [zk](https://github.com/zk-org/zk) notebook. Content lives under `content/`
as plain markdown with YAML frontmatter — zk manages it as notes (search, links,
tags), Zola builds it as pages. Kept intentionally separate from
`89jobrien.github.io`, which is generated output from the `bazaar` repo.

## Requirements

- Zola `0.23.3`, matching validation and deployment.
- zk `0.15.6` or newer for note creation and listing.
- Rust `1.89` or newer and `crux-agentic` `0.3.1` for the `crux` workflow runner.
- Nushell `0.111.0` for zk rendering and editorial contract checks.
- lychee `0.24.2` for concurrent external-link validation.
- Node.js `22.22.1` and Bun `1.3.10`; `bun install --frozen-lockfile` installs the exact
  top-level tool versions from `package.json`.

Bootstrap the repository-owned tools with:

```text
cargo install --git https://github.com/89jobrien/crux.git --rev 8d54a65df7696ec01b1ef27a5c0972422020efc1 --package crux-agentic --locked
cargo install lychee --version 0.24.2 --locked
bun install --frozen-lockfile
```

Install Zola `0.23.3` from its release artifacts. GitHub Actions uses
`taiki-e/install-action` for the same version. zk is editorial tooling and is not needed to
build the site; CI checks its templates directly.

## Writing

```text
zk new-project --title "Some Project"   # content/projects/some-project.md
zk new-post --title "Some Post"         # content/blog/some-post.md
zk new-idea --title "Some Idea"         # ideas/queue/some-idea.md
zk list-projects
zk list-posts
zk list-ideas
```

The private editorial queue stores local pitches that zk indexes and Zola does not publish
because they live outside `content/`. Here, private means unpublished, not confidential. The
`ideas/` directory is gitignored; do not store the only copy of valuable research there. Each pitch has `title`, `date`, `status`,
`priority`, `theme`, and `effort` metadata plus Hook, Thesis, Reader Value, Evidence,
Mini Outline, and Readiness sections. Keep at most 12 active pitches in `ideas/queue/`.
When a pitch becomes a post, remove it from the active queue; optionally retain local history
with `status: published` under `ideas/published/`.

Fill in `extra.repo` in a project note to link to its GitHub repo.

## Reference sites

Project sites are published automatically to `https://89jobrien.github.io/<repo>/`. A project gets
a site by adding `extra.site` to its note, set to exactly that URL — the repository name is the
whole input:

```yaml
extra:
  repo: "https://github.com/89jobrien/doob"
  site: "https://89jobrien.github.io/doob/"
```

`/sites/` lists every project that declares `extra.site`, and the editorial check fails the build
when a declared site URL drifts from the URL implied by `extra.repo`. Notes without `extra.site`
never appear there, even though a repository exists.

## Relationships

Projects and posts participate in one generated relationship graph. Author tags with Zola's
taxonomy metadata and curated links with namespaced IDs:

```yaml
taxonomies:
  tags: [agent-workflows, rust]
extra:
  related: [project:minibox, post:policy-between-intent-and-effects]
```

Node IDs are `project:<file-stem>` or `post:<file-stem>`. Tags must be unique lowercase
kebab-case values. `extra.related` is optional, must contain unique valid node IDs, and must
not target the current page. Curated relationships appear on both pages; only incoming
Markdown links appear under **Referenced by**. Shared tags can also create related-content
edges when two pages share at least two tags or have tag similarity of at least 0.5.

Drafts and section indexes are excluded. Links to known `/projects/` and `/blog/` routes and
relative Markdown files under those content sections are inferred. Copied README-relative
links such as `README.md`, `docs/...`, and asset links are ignored rather than rewritten.
Custom Zola `slug` or `path` frontmatter is not supported for graph participants and causes
generation to fail.

The committed generated artifacts are `static/data/content-graph.json` and
`static/js/content-graph.js`. Use the data-only commands while editing metadata, or the
combined commands when either generated artifact may change:

```text
bun run graph:data:write  # regenerate the manifest only
bun run graph:data:check  # check manifest freshness
bun run graph:write       # regenerate the manifest and browser bundle
bun run graph:check       # check both committed artifacts
```

The site exposes tag pages under `/tags/` and the explorer at `/graph/`. The graph route is
server-rendered with a complete content list; JavaScript adds filtering and an SVG view. If
the manifest cannot load or enhancement fails, the list remains available and no SVG is
shown.

The home page renders the same data as a preview: the SVG only, without the search box, filters,
or zoom, with an info bubble explaining what the lines mean and a link to the full explorer.
Nodes open the page they represent.

The pinned tools are Node `22.22.1`, Bun `1.3.10`, and Zola `0.23.3`.

## Verification

```text
bun run verify              # format, lint, tests, graph freshness, and Zola gates
crux run Cruxfile graph     # graph tests and generated-artifact freshness
crux run Cruxfile check     # graph gates followed by zola check
crux run Cruxfile build     # check followed by zola build
crux run Cruxfile ci        # lint plus the complete build chain
```

## Preview

```text
zola serve          # http://127.0.0.1:1111
zola serve --open   # same, and opens it in your default browser
```

## Build

```text
zola build                       # persistent local output in public/
crux run Cruxfile build          # isolated disposable build plus smoke checks
```

## Quality Workflows

```text
crux run Cruxfile format        # explicitly rewrites repository Markdown and Sass
crux run Cruxfile format-check  # checks formatting without writing files
crux run Cruxfile lint          # checks repository Markdown without writing files
crux run Cruxfile check         # checks workflow, zk, fail-fast, Zola, and external links
crux run Cruxfile build         # isolated Zola build followed by site smoke checks
crux run Cruxfile ci            # non-mutating aggregate; runs each gate exactly once
```

Formatting and linting cover `README.md`, `CLAUDE.md`, `content/**/*.md`, `docs/**/*.md`, and
`ideas/**/*.md`; formatting also covers `sass/**/*.scss`. `.zk/templates/*.md` is deliberately
excluded from Prettier because rewriting its template expressions breaks zk. The check target
validates every `.crux` file and Cruxfile target plan, all four zk templates and their dry-run
rendering, the private editorial workflow, disposable
fail-fast propagation, Zola content, and external links. Zola checks site-local content without
network access; lychee checks HTTP(S) links concurrently with bounded timeouts. Timeouts plus
HTTP 403 and 429 responses are accepted as network-policy and rate-limit exceptions; other
confirmed HTTP errors fail the check.

`crux run Cruxfile build` writes to a temporary directory, verifies prefix-safe project, sites, and
blog links, the home-page graph preview, representative project and post pages, and `atom.xml`,
then removes the output.
`crux run Cruxfile serve` remains a long-running local-only target. Executable workflow
ownership lives in the standalone pipelines under `scripts/`; `Cruxfile` is only a dispatcher.

Zola also generates an Atom feed at `atom.xml` under the configured base URL.

## Design Notes

- [Private editorial backlog](docs/designs/2026-09-09-blog-idea-backlog-design.md)
- [Standalone Crux workflow pipelines](docs/designs/2026-09-11-crux-workflow-pipelines-design.md)

## Deploy

`.github/workflows/validate.yml` is the pull-request quality adapter and runs the non-mutating
`ci` target with pinned tools. `.github/workflows/deploy.yml` is a separate production adapter:
it builds on pushes to `main` or manual dispatch, but publishes to GitHub Pages only when the
repository variable `PAGES_ENABLED` is `true` and Pages uses "GitHub Actions" as its source.
Both workflows pin Zola `0.23.3`; the deployed base URL is configured in `config.toml`.
