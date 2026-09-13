# sitex

Personal site: project write-ups + blog, built with [Zola](https://www.getzola.org)
from a [zk](https://github.com/zk-org/zk) notebook. Content lives under `content/`
as plain markdown with YAML frontmatter — zk manages it as notes (search, links,
tags), Zola builds it as pages. Kept intentionally separate from
`89jobrien.github.io`, which is generated output from the `bazaar` repo.

## Writing

```text
zk new-project --title "Some Project"   # content/projects/some-project.md
zk new-post --title "Some Post"         # content/blog/some-post.md
zk new-idea --title "Some Idea"         # ideas/queue/some-idea.md
zk list-projects
zk list-posts
zk list-ideas
```

The private editorial queue stores pitches that zk indexes, Git versions, and Zola does
not publish because they live outside `content/`. Each pitch has `title`, `date`, `status`,
`priority`, `theme`, and `effort` metadata plus Hook, Thesis, Reader Value, Evidence,
Mini Outline, and Readiness sections. Keep at most 12 active pitches in `ideas/queue/`.
When a pitch becomes a post, set its status to `published` and move it to
`ideas/published/`.

Fill in `extra.repo` in a project note to link to its GitHub repo.

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

The pinned tools are Bun `1.3.10` and Zola `0.23.3` (see `.mise.toml`). Install JavaScript
dependencies with `bun install --frozen-lockfile`.

## Preview

```
zola serve          # http://127.0.0.1:1111
zola serve --open   # same, and opens it in your default browser
```

## Build

```
zola build   # outputs to public/
```

## Deploy

`.github/workflows/deploy.yml` builds with Zola and publishes to GitHub Pages
on push to `main`. Requires GitHub Pages set to "GitHub Actions" as the source
in repo settings, and `base_url` in `config.toml` updated to the real domain.
