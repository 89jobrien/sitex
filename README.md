# sitex

Personal site: project write-ups + blog, built with [Zola](https://www.getzola.org)
from a [zk](https://github.com/zk-org/zk) notebook. Content lives under `content/`
as plain markdown with YAML frontmatter — zk manages it as notes (search, links,
tags), Zola builds it as pages. Kept intentionally separate from
`89jobrien.github.io`, which is generated output from the `bazaar` repo.

## Writing

```
zk new-project --title "Some Project"   # content/projects/some-project.md
zk new-post --title "Some Post"         # content/blog/some-post.md
zk list-projects
zk list-posts
```

Fill in `extra.repo` in a project note to link to its GitHub repo.

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
