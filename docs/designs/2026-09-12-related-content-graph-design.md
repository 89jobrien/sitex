# Design: Related Content Graph

## Goal

Add one shared relationship model that powers related-content cards, incoming backlinks, tag browsing, and an interactive graph across project and blog pages.

## Approved Approach

Use a pinned JavaScript build step, with Bun as the package manager and task runner, to generate one deterministic, committed graph manifest from hybrid Markdown relationships: curated frontmatter, internal content links, and shared tags.

## Context Map

### Files to Modify

| File or path                            | Purpose                            | Changes needed                                                                                             |
| --------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `.mise.toml`                            | Project toolchain contract         | Pin Node `22.22.1`, Bun `1.3.10`, and Zola `0.23.3` for local and CI parity.                               |
| `package.json`                          | JavaScript tooling contract        | Pin graph generation, parsing, bundling, formatting, linting, and test commands run through Bun.           |
| `bun.lock`                              | Reproducible dependency resolution | Lock every JavaScript dependency installed with Bun locally and in CI.                                     |
| `scripts/content-graph/core.mjs`        | Pure graph domain                  | Normalize documents, derive edges and backlinks, rank related nodes, and validate graph invariants.        |
| `scripts/content-graph/generate.mjs`    | Filesystem and parser adapter      | Read Markdown, parse YAML and links, invoke the domain, and write or check generated artifacts.            |
| `scripts/content-graph/ui.mjs`          | Browser adapter                    | Progressively enhance the server-rendered graph list with the interactive SVG graph.                       |
| `scripts/content-graph/core.test.mjs`   | Domain tests                       | Cover normalization, edge semantics, ranking, determinism, and validation failures.                        |
| `scripts/content-graph/fixtures/`       | Integration fixtures               | Represent projects, posts, links, tags, drafts, and invalid relationship targets.                          |
| `static/data/content-graph.json`        | Shared generated manifest          | Supply display-ready graph data to Tera and browser JavaScript.                                            |
| `static/js/content-graph.js`            | Generated browser bundle           | Render graph search, filters, selection, zoom, and relationship details without a CDN.                     |
| `config.toml`                           | Zola site configuration            | Register the `tags` taxonomy.                                                                              |
| `.zk/templates/project.md`              | Project authoring contract         | Add empty tags and curated relationship fields to new notes.                                               |
| `.zk/templates/post.md`                 | Post authoring contract            | Add empty tags and curated relationship fields to new notes.                                               |
| `content/projects/*.md`                 | Project metadata                   | Add normalized tags and selected curated relationships.                                                    |
| `content/blog/*.md`                     | Post metadata                      | Add normalized tags and selected curated relationships.                                                    |
| `content/graph.md`                      | Graph route                        | Create the `/graph/` page using the graph template.                                                        |
| `templates/partials/relationships.html` | Shared server rendering            | Render tags, related cards, and incoming backlinks from precomputed node views.                            |
| `templates/project.html`                | Project detail integration         | Include the relationships partial after project content.                                                   |
| `templates/post.html`                   | Blog detail integration            | Include the relationships partial after post content.                                                      |
| `templates/graph.html`                  | Graph experience                   | Render the accessible list fallback and progressive-enhancement hooks.                                     |
| `templates/taxonomy_list.html`          | Taxonomy index                     | List available tags.                                                                                       |
| `templates/taxonomy_single.html`        | Taxonomy detail                    | List projects and posts for one tag.                                                                       |
| `templates/base.html`                   | Site navigation                    | Add graph and tag discovery links and load graph JavaScript only on the graph page.                        |
| `sass/style.scss`                       | Presentation                       | Style cards, backlinks, tags, graph controls, SVG states, and mobile fallback.                             |
| `Cruxfile`                              | Local quality orchestration        | Run graph tests and freshness checks before Zola checks and builds.                                        |
| `scripts/lint.crux`                     | Content lint pipeline              | Include graph validation in the existing lint target.                                                      |
| `.github/workflows/deploy.yml`          | Deployment gate                    | Use Zola `0.23.3`, install pinned dependencies with Bun, and verify generated artifacts before deployment. |
| `.github/workflows/ci.yml`              | Pull-request gate                  | Run graph tests, freshness checks, `zola check`, and `zola build`.                                         |

### Dependencies

| File or path                 | Relationship                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `content/projects/_index.md` | Declares the existing related-content requirement and owns project-page routing.        |
| `templates/projects.html`    | Declares relationship navigation as a missing project-catalog capability.               |
| `templates/index.html`       | Uses project slugs for featured-project lookups; graph IDs must not alter those routes. |
| `.zk/config.toml`            | Requires YAML frontmatter that both zk and Zola can read.                               |
| `scripts/format.crux`        | Existing Node-based formatting command moves under the pinned package contract.         |
| `README.md`                  | Documents direct `zola serve`; committed artifacts must preserve that workflow.         |

### Existing Test Coverage

There is no automated graph, template, or browser test suite. The current checks are Markdown linting, `zola check`, and `zola build`. This feature adds focused Node tests and keeps Zola as the final integration gate.

### Reference Patterns

| File                       | Pattern to follow                                                     |
| -------------------------- | --------------------------------------------------------------------- |
| `templates/index.html`     | Resolve project pages by stable slug and render reusable cards.       |
| `templates/base.html`      | Generate deployment-prefix-safe URLs with `get_url`.                  |
| `Cruxfile`                 | Compose format, lint, check, and build as explicit dependent targets. |
| `scripts/lint.crux`        | Fail the pipeline when a required quality command exits non-zero.     |
| `.zk/templates/project.md` | Keep custom Zola data under YAML `extra` while preserving zk parsing. |

## Ownership And Boundaries

This repository has no Rust crate or `Cargo.toml`. The feature is owned by three JavaScript modules with distinct responsibilities:

- `core.mjs` is the pure domain and sole owner of relationship semantics, graph validation, backlink derivation, and related-card ranking.
- `generate.mjs` is the build adapter for filesystem access, YAML parsing, Markdown parsing, artifact writing, and freshness comparison.
- `ui.mjs` is the browser adapter. It renders the manifest but never infers, ranks, or mutates relationships.

Tera templates are presentation adapters. They consume precomputed node views and must not reimplement relationship rules.

Zola `0.23.3` rejects the macro declarations originally planned for relationship rendering.
The implementation therefore uses `{% include "partials/relationships.html" %}` from the
project and post templates. Zola's taxonomy template lookup also uses the root-level
`templates/taxonomy_list.html` and `templates/taxonomy_single.html` files rather than a
`templates/tags/` directory.

## Content Contract

Every graph participant keeps ordinary Zola YAML frontmatter. Tags use Zola's standard taxonomy field, while curated relationships remain custom metadata:

```yaml
taxonomies:
  tags:
    - agent-workflows
    - rust
extra:
  related:
    - project:minibox
    - post:policy-between-intent-and-effects
```

Rules:

- Node IDs are namespaced source identities: `project:<file-stem>` or `post:<file-stem>`.
- IDs never derive from titles and remain independent of deployment URLs.
- Tags are lowercase kebab-case slugs, unique and sorted within each page.
- `extra.related` is optional, directed editorial intent. It is displayed reciprocally as related content while retaining its declared direction as evidence.
- Draft pages and section indexes do not enter the graph.
- Custom Zola `slug` and `path` overrides are unsupported in this release and fail generation if found on graph participants.

## Manifest Schema

The committed `static/data/content-graph.json` has this conceptual public shape:

```ts
interface ContentGraph {
  schemaVersion: 1;
  nodes: ContentNode[];
  edges: ContentEdge[];
}

interface ContentNode {
  id: string;
  kind: "project" | "post";
  title: string;
  description: string;
  route: string;
  date: string;
  tags: string[];
  related: RelatedNode[];
  backlinks: BacklinkNode[];
}

interface ContentEdge {
  source: string;
  target: string;
  directed: boolean;
  evidence: EdgeEvidence[];
  tagSimilarity: number;
}

interface EdgeEvidence {
  kind: "explicit" | "link" | "tag";
  declaredBy?: string;
  sharedTags?: string[];
}

interface RelatedNode {
  id: string;
  reasons: EdgeEvidence[];
}

interface BacklinkNode {
  id: string;
}
```

The manifest contains no generation timestamp or repository source paths. Source paths remain internal generation metadata. Nodes, edges, evidence, tags, related lists, and backlinks use canonical code-unit sorting so identical inputs produce byte-identical output across environments.

## Module API

The graph package exports only the functions needed by the CLI and tests:

```ts
function normalizeDocument(input: ParsedDocument): ContentDocument;
function buildContentGraph(documents: ContentDocument[]): ContentGraph;
function validateContentGraph(graph: ContentGraph): ValidationIssue[];
function rankRelated(
  nodeId: string,
  graph: ContentGraph,
  limit: number,
): RelatedNode[];
function serializeContentGraph(graph: ContentGraph): string;
async function generateContentGraph(
  options: GenerateOptions,
): Promise<ContentGraph>;
async function writeContentGraph(options: GenerateOptions): Promise<void>;
async function checkContentGraph(options: GenerateOptions): Promise<void>;
```

The CLI exposes data-only scripts during metadata work and composed top-level scripts once the browser bundle exists:

- `graph:data:write` regenerates only the manifest.
- `graph:data:check` compares only the canonical manifest.
- `graph:write` regenerates the manifest and browser bundle.
- `graph:check` regenerates in memory, compares canonical bytes, and fails when committed artifacts are stale.

## Relationship Semantics

Each pair of nodes has at most one normalized edge containing one or more evidence records:

1. `explicit` evidence comes from `extra.related` and has highest related-card priority.
2. `link` evidence comes from a Markdown link to a known project or post and has second priority. Link direction is preserved; incoming link edges form the “Referenced by” list.
3. `tag` evidence comes from shared taxonomy tags and has lowest priority. Tag affinity is eligible when pages share at least two tags or have Jaccard similarity of at least `0.5`.

Related-card ranking is lexicographic: explicit evidence, then link evidence, then descending tag similarity, then stable node ID. Each page displays at most four cards. Backlinks include incoming `link` evidence only, preventing curated relationships from being mislabeled as citations.

## Link Resolution

The generator recognizes only links that can intentionally address graph content:

- Absolute routes beginning with `/projects/` or `/blog/`.
- Relative Markdown paths that resolve inside `content/projects/` or `content/blog/`.

External URLs, fragments, assets, absolute machine paths, and copied repository-relative documentation links are ignored for graph inference. A content-shaped link that does not resolve to a graph node is a validation error.

## User Experience

### Detail Pages

Project and post footers render:

1. Linked tag chips.
2. Up to four ordered related-content cards.
3. A “Referenced by” list when incoming content links exist.

Sections with no entries are omitted.

### Tag Pages

Zola taxonomies create the tag routes, while taxonomy templates filter precomputed manifest nodes by the current term. The tags index lists all normalized tags, and each tag page lists matching projects and posts using the existing card language, providing a server-rendered discovery path independent of JavaScript.

### Graph Page

`/graph/` initially renders a complete searchable relationship list. JavaScript progressively enhances it into an SVG graph with:

- Text search.
- Project and post filters.
- Tag filters.
- Explicit, link, and tag edge toggles.
- Selected-node details and navigation.
- Keyboard-selectable nodes and visible focus states.
- Pan and zoom controls.

Explicit and link edges are enabled initially; tag edges are opt-in. On narrow viewports the list remains the primary view and the visualization is optional.

## Data Flow

1. Authors add tags, curated IDs, and ordinary links to YAML-frontmatter Markdown managed by zk.
2. `generate.mjs` parses the Markdown into normalized content documents.
3. `core.mjs` validates IDs, derives evidence, combines pairwise edges, computes backlinks, and ranks related nodes.
4. Canonical serialization writes one committed manifest; the browser source is bundled into one committed script.
5. Zola loads the manifest to render detail-page relationships, taxonomies, and the graph fallback.
6. The browser module loads the same manifest URL through a base-path-safe value rendered by Zola and enhances the graph page.
7. Crux and GitHub Actions regenerate in check mode before Zola validation, rejecting stale or invalid artifacts.

## Dependencies

Pinned JavaScript dependencies installed with Bun are `yaml`, `unified`, `remark-parse`, `unist-util-visit`, `d3-force`, `d3-selection`, `d3-zoom`, `linkedom`, `esbuild`, `prettier`, and `markdownlint-cli2`.

Project tooling uses Node `22.22.1`, Bun `1.3.10`, and Zola `0.23.3` from `.mise.toml`; Bun is the package manager and task runner, and the scripts use the pinned Node runtime. GitHub Actions installs the same versions explicitly. Runtime page loads use no CDN or third-party service. The dependencies cover:

- YAML frontmatter parsing.
- Markdown AST parsing and link traversal.
- SVG force layout, selection, and zoom behavior.
- Browser bundling.
- Existing Prettier and Markdownlint commands.

Tests use Node's built-in test runner. External parser and visualization libraries remain inside the build and browser adapters; the pure graph domain accepts normalized data.

## Validation And Tests

Generation fails for duplicate IDs, unknown curated targets, self-relations, malformed or duplicate tags, unsupported route overrides, ambiguous content links, and unresolved content-shaped links.

Tests cover:

- Project and post ID derivation.
- YAML metadata normalization.
- Explicit relationship reciprocity with preserved evidence direction.
- Directed links and incoming backlinks.
- Tag-affinity thresholds.
- Multi-evidence edge deduplication.
- Related-card ranking and four-card limit.
- Draft and section-index exclusion.
- Copied repository-relative link exclusion.
- Canonical ordering and byte-stable serialization.
- Write/check freshness behavior.
- Graph fallback survival when JavaScript does not initialize.
- `zola check` and `zola build` against Zola `0.23.3`.

## Rollout

The feature ships as one release, but implementation proceeds through one dependency chain:

1. Establish the package contract, pure domain, fixtures, and generator tests.
2. Add tags and curated relationships to existing projects and posts.
3. Generate and validate the first manifest.
4. Add server-rendered cards, backlinks, and tag pages.
5. Add the accessible graph fallback and browser enhancement.
6. Add Crux and GitHub Actions freshness gates.
7. Verify direct `zola serve`, no-JavaScript rendering, narrow layouts, and deployment under the `/sitex` base path.

## Out Of Scope

- LLM, embedding, or semantic-similarity relationship inference.
- External websites or source repositories as graph nodes.
- Rewriting copied README-relative links.
- Custom Zola slug or path overrides.
- In-browser graph editing or persisted node positions.
- Analytics-driven recommendations or popularity ranking.
- Synchronization with `bazaar` or `89jobrien.github.io`.
- A conversion step between zk notes and Zola page content.

## Risk

- [ ] Breaking public API changes: no; this repository exposes static pages rather than a library API.
- [x] New external dependencies: yes; pinned Markdown/YAML parsing, graph visualization, bundling, formatting, and lint packages.
- [ ] Feature flag required: no; JavaScript enhancement fails open to server-rendered content.
- [x] Large content migration: existing projects and posts need an editorial metadata pass before the graph is useful.
- [x] Generated-artifact drift: check mode and CI byte comparison prevent stale manifests and bundles from shipping.
- [x] Tera compatibility: a minimal manifest lookup fixture must pass with Zola `0.23.3` before broad template integration.
- [x] Graph density: tag thresholds, top-four cards, edge toggles, and list-first mobile rendering limit noise.
