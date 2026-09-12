import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContentGraph,
  normalizeDocument,
  validateContentGraph,
} from "./core.mjs";

const projectInput = {
  sourcePath: "content/projects/minibox.md",
  frontmatter: {
    title: "Minibox",
    date: "2026-08-18",
    description: "A policy-gated container runtime.",
    taxonomies: {
      tags: ["systems-software", "containers", "security"],
    },
    extra: {
      related: ["post:agent-safe-container-runtime", "project:repro"],
    },
  },
  links: ["/blog/agent-safe-container-runtime/"],
};

test("normalizes content identity and metadata", () => {
  assert.deepEqual(normalizeDocument(projectInput), {
    id: "project:minibox",
    sourcePath: "content/projects/minibox.md",
    kind: "project",
    title: "Minibox",
    description: "A policy-gated container runtime.",
    date: "2026-08-18",
    route: "/projects/minibox/",
    tags: ["containers", "security", "systems-software"],
    relatedIds: ["post:agent-safe-container-runtime", "project:repro"],
    links: ["/blog/agent-safe-container-runtime/"],
  });

  assert.equal(
    normalizeDocument({
      ...projectInput,
      sourcePath: "content/blog/_index.md",
    }),
    null,
  );

  assert.equal(
    normalizeDocument({
      ...projectInput,
      sourcePath: "content/blog/draft.md",
      frontmatter: { ...projectInput.frontmatter, draft: true },
    }),
    null,
  );
});

test("rejects invalid graph metadata", () => {
  assert.throws(
    () =>
      normalizeDocument({
        ...projectInput,
        frontmatter: { ...projectInput.frontmatter, description: "" },
      }),
    /description must be a non-empty string/,
  );

  assert.throws(
    () =>
      normalizeDocument({
        ...projectInput,
        frontmatter: { ...projectInput.frontmatter, slug: "custom" },
      }),
    /custom slug or path overrides are unsupported/,
  );

  assert.throws(
    () =>
      normalizeDocument({
        ...projectInput,
        frontmatter: {
          ...projectInput.frontmatter,
          taxonomies: { tags: ["security", "security"] },
        },
      }),
    /tags must be unique/,
  );

  assert.throws(
    () =>
      normalizeDocument({
        ...projectInput,
        frontmatter: {
          ...projectInput.frontmatter,
          taxonomies: { tags: ["Not Valid"] },
        },
      }),
    /tags must use lowercase kebab-case/,
  );
});

function graphDocument({ id, kind = "project", relatedIds = [], links = [] }) {
  const stem = id.split(":")[1];
  const section = kind === "project" ? "projects" : "blog";
  return {
    id,
    sourcePath: `content/${section}/${stem}.md`,
    kind,
    title: stem,
    description: `${stem} description`,
    date: "2026-09-12",
    route: `/${section}/${stem}/`,
    tags: [],
    relatedIds,
    links,
  };
}

test("derives explicit and link relationships", () => {
  const graph = buildContentGraph([
    graphDocument({
      id: "project:alpha",
      relatedIds: ["post:bravo"],
      links: ["/blog/bravo/", "/blog/bravo/"],
    }),
    graphDocument({ id: "post:bravo", kind: "post" }),
    graphDocument({
      id: "project:charlie",
      links: ["/blog/bravo/"],
    }),
  ]);

  assert.deepEqual(graph.edges, [
    {
      source: "post:bravo",
      target: "project:alpha",
      directed: true,
      evidence: [
        { kind: "explicit", declaredBy: "project:alpha" },
        { kind: "link", declaredBy: "project:alpha" },
      ],
      tagSimilarity: 0,
    },
    {
      source: "post:bravo",
      target: "project:charlie",
      directed: true,
      evidence: [{ kind: "link", declaredBy: "project:charlie" }],
      tagSimilarity: 0,
    },
  ]);

  const alpha = graph.nodes.find((node) => node.id === "project:alpha");
  const bravo = graph.nodes.find((node) => node.id === "post:bravo");
  assert.deepEqual(alpha.related, [
    {
      id: "post:bravo",
      reasons: [
        { kind: "explicit", declaredBy: "project:alpha" },
        { kind: "link", declaredBy: "project:alpha" },
      ],
    },
  ]);
  assert.deepEqual(bravo.backlinks, [
    { id: "project:alpha" },
    { id: "project:charlie" },
  ]);
});

test("rejects invalid relationship targets", () => {
  assert.throws(
    () =>
      buildContentGraph([
        graphDocument({
          id: "project:alpha",
          relatedIds: ["post:missing"],
        }),
      ]),
    /unknown relationship target post:missing/,
  );

  assert.throws(
    () =>
      buildContentGraph([
        graphDocument({
          id: "project:alpha",
          relatedIds: ["project:alpha"],
        }),
      ]),
    /self relationship project:alpha/,
  );
});

test("validates graph structure", () => {
  assert.deepEqual(
    validateContentGraph({
      schemaVersion: 1,
      nodes: [{ id: "project:alpha" }],
      edges: [
        {
          source: "project:alpha",
          target: "project:missing",
          evidence: [],
        },
      ],
    }),
    [
      {
        code: "unknown-edge-target",
        message: "edge target project:missing does not exist",
      },
    ],
  );
});
