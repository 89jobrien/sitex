---
name: sitex-page
description: Create and edit pages in sitex, the Zola + zk personal site at ~/dev/sitex. Use when adding or revising a project write-up (content/projects), a blog post (content/blog), a standalone page (content/*.md with template page.html), or an editorial pitch (ideas/queue); when frontmatter, tags, extra.repo, extra.site, or extra.related need attention; when cross-page links or the generated content-graph artifacts are involved; or when a page, post, note, or project write-up is requested. Triggers on "new project page", "write a post", "add a blog post", "sitex page", "zola page", "zk note", "content graph is stale", "sitex project note".
---

# Sitex page authoring

sitex is a Zola static site whose `content/` markdown doubles as a zk notebook. There is no
conversion step: one file is both a zk note and a Zola page. Every rule below is enforced by a
gate in `Cruxfile`, so "it looks right" is not the bar — the gates are.

Repo root is `~/dev/sitex`. All commands run from there.

## Pick the page type first

| You are writing                      | Location                     | Created by                     | Rendered by                                    | In content graph |
| ------------------------------------ | ---------------------------- | ------------------------------ | ---------------------------------------------- | ---------------- |
| Project write-up                     | `content/projects/<slug>.md` | `zk new-project --title "..."` | `templates/project.html` (via `page_template`) | Yes              |
| Blog post                            | `content/blog/<slug>.md`     | `zk new-post --title "..."`    | `templates/post.html` (via `page_template`)    | Yes              |
| Standalone page (About, and similar) | `content/<slug>.md`          | hand-written file              | must set `template:` (usually `page.html`)     | No               |
| Unpublished editorial pitch          | `ideas/queue/<slug>.md`      | `zk new-idea --title "..."`    | not built — outside `content/`                 | No               |

The graph only ever reads `content/projects/*.md` and `content/blog/*.md`
(`scripts/content-graph/generate.mjs`). Frontmatter on a standalone page is unvalidated, so
`page.html` renders only `title`, `description`, and content — no date, no relationships.

## Projects and blog posts

### 1. Scaffold with zk, not by hand

`note.filename = "{{slug title}}"`, so the filename comes from the title. Use zk so the correct
group template is applied and the slug rule is enforced for you — hand-writing the file skips
both.

```text
zk new-project --title "Doob" --extra 'description=Short lede,repo=https://github.com/89jobrien/doob'
zk new-post    --title "Some Argument"      # description/repo extras do not apply to posts
```

`--extra description=...` and `--extra repo=...` are optional. Without them the template emits
`description: ""`, and every card on `/projects/` renders an empty paragraph — the lede is not
optional in practice. Quote the value carefully; `scripts/test-zk-templates.nu` dry-runs a title
containing `"`, `&`, and `:` to prove the YAML round-trips.

### 2. Frontmatter contract

```yaml
---
title: "doob" # non-empty
date: 2026-08-18 # YYYY-MM-DD, unquoted
description: "One or two dense sentences ending in a period, stating what it is."
taxonomies:
  tags: [automation, cli, work-tracking] # unique, lowercase kebab-case
extra:
  repo: "https://github.com/89jobrien/doob" # https:// only
  site: "https://89jobrien.github.io/doob/" # optional; see below
  related: [project:minibox, post:policy-between-intent-and-effects] # optional
---
```

- Frontmatter delimiters are `---` (YAML). Never `+++` — zk parses YAML only and silently loses
  metadata on TOML frontmatter.
- `extra.related` IDs are `project:<file-stem>` or `post:<file-stem>`. They must be unique, must
  resolve to an existing page, and must not be the page itself. Any violation fails generation.
- `extra.site`, when present, must be **exactly** `https://89jobrien.github.io/<repo-name>/`
  where `<repo-name>` is the last path segment of `extra.repo`, and `extra.repo` must be present.
  Declaring `site` is what puts a project on `/sites/`. `scripts/editorial-check.nu` fails the
  build on drift.
- Never set `slug:` or `path:` on a page under `content/projects` or `content/blog`. Generation
  throws `custom slug or path overrides are unsupported`.
- `draft: true` is honored — it excludes the page from the graph but still builds it.
- Body prose uses `—` (em dash). Some older `description` values use `--`; there is no gate on
  this, so match the file you are editing rather than churning it.

### 3. Cross-page links

The house convention is a zk wiki link, which both tools understand:

```markdown
[grounding survives summarization](@/blog/grounding-survives-summarization.md)
```

Zola rewrites it to a prefix-safe absolute URL under the configured `base_url`. The graph
generator does **not** resolve it, so a wiki link produces no edge and no backlink. If you want a
Related card, add the target to `extra.related` as well.

Plain relative and route links _are_ resolved by the graph and _do_ create edges and backlinks:

```markdown
[y](../projects/minibox.md) # resolves to /projects/minibox/
[y](/blog/replayability-over-autonomy/) # normalized to the same route
```

**The trap:** a relative link whose target is a same-section kebab-case `.md` file is treated as
a reference to a real page. If that file does not exist, generation throws
`unknown link target /blog/<slug>/`. Copied README-relative links (`README.md`, `docs/...`,
`LICENSE`, asset paths) are ignored rather than rewritten, which is why they are safe. Use wiki
links for editorial cross-references and avoid same-directory relative `.md` links.

### 4. Tags

Reuse the existing vocabulary before inventing a tag — tag overlap is what creates related
content. Twenty-three tags are in use:

```text
agent-harness        agent-runtime       automation           ci-cd
cli                  containers          developer-experience integration
knowledge-systems    llm                 mcp                  observability
release-engineering  security            shell-tooling        software-architecture
systems-config        systems-software    technical-writing    terminal-ui
testing              web                 work-tracking
```

Two pages become related when they share **at least two tags** or have tag similarity
`shared / union >= 0.5`. Related cards are capped at four per page, so a new page with broad tags
can displace existing neighbours from their Related list. There is no gate on new tags; a typo
silently creates a one-page `/tags/` route.

### 5. Regenerate the committed graph artifacts

`static/data/content-graph.json` and `static/js/content-graph.js` are **committed generated
artifacts**. Any new or edited project or post makes them stale, and `graph:check` fails until
they are rewritten.

```text
bun run graph:data:write   # manifest only — enough when only metadata changed
bun run graph:write       # manifest + browser bundle — use whenever either may change
```

Never hand-edit either file.

## Standalone pages

Hand-write `content/<slug>.md` and set `template:` explicitly, otherwise Zola picks
`page.html` and may not match your intent:

```yaml
---
title: About
date: 2026-09-16
description: "Joseph O'Brien is an Agentic Systems Architect building reliable AI systems."
template: page.html
---
```

Available templates: `page.html` (plain), `index.html` (home), `graph.html`, `sites.html`.
`page.html` renders an `<h1>`, a `.lede` from `description`, and the content — no date, no
relationships. Cross-page links use the same `@/...` wiki form.

**Navigation is hardcoded** in `templates/base.html` (`About`, `Projects`, `Sites`, `Blog`,
`Tags`, `Graph`). A new top-level page is unreachable until you add a `<a>` there, and the smoke
check greps the homepage for prefixed links — add it with `get_url(path="/your-page/")`, never a
bare `/your-page/`, or `scripts/smoke-site.sh` fails the build.

## Editorial pitches (`ideas/queue/`)

Private and gitignored — `ideas/queue/*` and `ideas/published/*` are ignored except `.gitkeep` and
`ideas/published/published-slugs.yaml`. "Private" here means unpublished, not confidential: do not
keep the only copy of real research there. Never place an unpublished pitch under `content/`.

```text
zk new-idea --title "Some Idea"
```

Metadata: `title`, `date`, `status`, `priority`, `theme`, `effort`. Active `status` is one of
`seed`, `researching`, `ready`; a retained note may use `published` under `ideas/published/`.
`scripts/editorial-check.nu` requires all six fields plus these exact headings:

```text
## Hook          ## Thesis        ## Reader Value      ## Evidence
## Mini Outline  ## Readiness
  ### Engineers
  ### Decision-makers
```

Hard limit: **12 active notes** in `ideas/queue/`. Promoting a pitch to a post means deleting it
from the active queue, optionally retaining it under `ideas/published/` with
`status: published`, and adding its slug to `published_slugs` in
`ideas/published/published-slugs.yaml` — that ledger is tracked in git and every slug must have a
`content/blog/<slug>.md` counterpart.

## Verify before claiming done

Run the aggregate target. It is non-mutating and runs each gate exactly once:

```text
crux run Cruxfile ci        # format-check, lint, repository checks, isolated build + smoke tests
                             # the same chain as .github/workflows/validate.yml
```

Targeted gates while iterating:

```text
crux run Cruxfile format              # mutating: rewrites content Markdown via Prettier
crux run Cruxfile format-check        # non-mutating format check
bun run graph:write                   # after touching any project or post
bun run graph:check                   # confirms both committed artifacts are fresh
zola check --skip-external-links      # local content only, no network
crux run Cruxfile build               # isolated build + prefix-safe smoke checks
bun run verify                        # format, lint, tests, graph, zola check, zola build
```

`check` covers, in order: workflow contracts, graph tests, graph freshness, workflow plans, zk
template contracts and dry-run rendering, editorial contracts, fail-fast propagation, Zola
content, and external links. Never skip `graph:write` after adding a page — a stale
`content-graph.json` is the most common way this work lands broken.

Do not run mutating `format` in a tree another agent may be working in; prefer `format-check` and
commit only paths you authored.

## Gotchas

| Symptom                                                  | Cause                                                                                                                                                                                                       |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unknown link target /blog/<slug>/`                      | Relative link to a same-section kebab-case `.md` that does not exist. Use `@/blog/<slug>.md`.                                                                                                               |
| `custom slug or path overrides are unsupported`          | `slug:` or `path:` in a project or post frontmatter. Remove them.                                                                                                                                           |
| `extra.site must be https://89jobrien.github.io/<repo>/` | `extra.site` drifted from the URL implied by `extra.repo`, or `extra.repo` is missing.                                                                                                                      |
| `stale content graph manifest`                           | Committed `static/data/*` artifacts predate the content change. Run `bun run graph:write`.                                                                                                                  |
| `unknown relationship target`                            | `extra.related` on a project or post names a page that does not exist. Note it is checked only on pages under `content/projects` and `content/blog`; the same key on a standalone page is silently ignored. |
| Build emits an `ideas/` directory                        | An unpublished note was placed under `content/`. Move it to `ideas/queue/`.                                                                                                                                 |
| `ideas/queue contains more than 12 active notes`         | Promote or remove a pitch.                                                                                                                                                                                  |
| Empty description on a project card                      | Scaffolded without `--extra description=...`.                                                                                                                                                               |
| `homepage contains a link that drops the /sitex prefix`  | A hardcoded root-relative href. Use `get_url(path=...)` in templates.                                                                                                                                       |
| Related cards vanished from neighbouring pages           | New page shares 2+ tags with them; the four-card cap evicted them. Retune tags or `extra.related`.                                                                                                          |
