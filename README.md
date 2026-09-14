# sitex

Personal site: project write-ups + blog, built with [Zola](https://www.getzola.org)
from a [zk](https://github.com/zk-org/zk) notebook. Content lives under `content/`
as plain markdown with YAML frontmatter — zk manages it as notes (search, links,
tags), Zola builds it as pages. Kept intentionally separate from
`89jobrien.github.io`, which is generated output from the `bazaar` repo.

## Requirements

- Zola; GitHub Actions pins `0.19.2`, so local changes must remain compatible with that version.
- zk for note creation and listing.
- Crux for the repository workflow targets.
- Prettier and `markdownlint-cli2` for formatting and Markdown checks.

The repository does not pin local zk, Crux, Prettier, or markdownlint versions; it uses the
compatible executables available on `PATH`.

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

## Preview

```
zola serve          # http://127.0.0.1:1111
zola serve --open   # same, and opens it in your default browser
```

## Build

```text
zola build   # outputs to public/
```

## Quality Workflows

```text
crux run Cruxfile format   # rewrites content Markdown and Sass with Prettier
crux run Cruxfile lint     # checks content/**/*.md with markdownlint-cli2
crux run Cruxfile check    # runs zola check, including external links
crux run Cruxfile build    # check, format, lint, then zola build
crux run Cruxfile ci       # default aggregate target; also runs the mutating format step
```

`crux run Cruxfile serve` starts the long-running preview server and opens a browser. The
standalone pipeline design in `docs/designs/2026-09-11-crux-workflow-pipelines-design.md`
is planned work; only format and lint currently have dedicated files under `scripts/`.

Zola also generates an Atom feed at `atom.xml` under the configured base URL.

## Design Notes

- [Private editorial backlog](docs/designs/2026-09-09-blog-idea-backlog-design.md)
- [Standalone Crux workflow pipelines](docs/designs/2026-09-11-crux-workflow-pipelines-design.md)

## Deploy

`.github/workflows/deploy.yml` builds with Zola on pushes to `main`. It publishes to
GitHub Pages only when the repository variable `PAGES_ENABLED` is set to `true` and Pages
uses "GitHub Actions" as its source. The workflow also supports manual dispatch, with the
same deployment gate. CI installs Zola `0.19.2`; the deployed base URL is configured in
`config.toml`.
