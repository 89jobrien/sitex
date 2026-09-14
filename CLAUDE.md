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
zk new-project --title "Some Project"   # creates content/projects/<slug>.md
zk new-post --title "Some Post"         # creates content/blog/<slug>.md
zk list-projects          # list notes in content/projects (excludes _index.md)
zk list-posts             # list notes in content/blog, sorted by zk creation time desc
zk new-idea --title "Some Idea"       # creates ideas/queue/some-idea.md
zk list-ideas                          # list active pitches with priority and status
crux run Cruxfile format  # rewrite content Markdown and Sass with Prettier
crux run Cruxfile lint    # lint content Markdown
crux run Cruxfile check   # run Zola checks, including external links
crux run Cruxfile build   # check, format, lint, then build
crux run Cruxfile ci      # default aggregate target; includes mutating format
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
  it and override blocks as needed.
- `Cruxfile` owns check, build, serve, and CI composition. `scripts/format.crux` and
  `scripts/lint.crux` are the only standalone pipelines currently implemented; the broader
  standalone-pipeline design remains planned.
- `config.toml` enables the Atom feed at `atom.xml`.
- `config.toml` sets the deployed base URL to `https://89jobrien.github.io/sitex`.
</architecture>

## Deployment

<deployment>
`.github/workflows/deploy.yml` builds with Zola on pushes to `main`. The deploy job runs via
`actions/deploy-pages` only when the repository variable `PAGES_ENABLED` is `true`; the repo's
Pages source must also be set to "GitHub Actions". Manual dispatch runs the same gated workflow.
The workflow pins Zola `0.19.2`; local changes must remain compatible with that version.
</deployment>
