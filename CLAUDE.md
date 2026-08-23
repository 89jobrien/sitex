# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Personal site (project write-ups + blog) built with [Zola](https://www.getzola.org) from a
[zk](https://github.com/zk-org/zk) notebook. Content lives under `content/` as plain markdown
with YAML frontmatter — the same files are managed by zk as notes (search, tags, links) and
read directly by Zola as pages. There is no conversion step between the two.

This repo (`sitex`) is intentionally separate from `~/dev/89jobrien.github.io`, which is generated output
synced daily from the `bazaar` repo's generator (`bazaar-gen`). Do not merge or sync this repo
into that pipeline without an explicit decision to retire the bazaar sync — the two are not
currently connected.

## Commands

```
zola serve                # local preview with live reload
zola serve --open         # same, opens it in the default browser
zola build                # build to public/ (gitignored)
zk new-project --title "Some Project"   # creates content/projects/<slug>.md
zk new-post --title "Some Post"         # creates content/blog/<slug>.md
zk list-projects          # list notes in content/projects (excludes _index.md)
zk list-posts             # list notes in content/blog, sorted by date desc
```

`zk` aliases are defined in `.zk/config.toml` under `[alias]`.

## Architecture

- **Frontmatter format is YAML (`---`), not TOML (`+++`)**, chosen deliberately: zk only parses
  YAML frontmatter, while Zola supports both. Using YAML lets one file serve both tools. Do not
  introduce TOML frontmatter into `content/` — zk will fail to read title/date on those notes.
- `.zk/config.toml` defines two note groups, each with its own template:
  - `group.projects` → `content/projects`, template `.zk/templates/project.md` (adds an
    `extra.repo` field for linking to the project's GitHub repo)
  - `group.blog` → `content/blog`, template `.zk/templates/post.md`
  - `note.filename = "{{slug title}}"` — filenames are derived from the note title, not zk's
    default ID scheme.
- Zola side mirrors this with `content/projects/_index.md` and `content/blog/_index.md`, each
  setting `page_template` so section listing pages and individual pages render differently
  (`projects.html`/`project.html` vs `blog.html`/`post.html`).
- `templates/base.html` is the shared shell (nav, footer); all other templates `{% extends %}`
  it and override the `title`/`content` blocks.
- `config.toml`'s `base_url` is a placeholder (`https://example.com`) — update before deploying.

## Deployment

`.github/workflows/deploy.yml` builds with Zola and publishes to GitHub Pages via
`actions/deploy-pages` on push to `main`. Requires the repo's Pages source set to "GitHub
Actions" in GitHub settings.
