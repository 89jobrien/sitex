import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContentGraph,
  normalizeDocument,
  rankRelated,
  serializeContentGraph,
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
        frontmatter: { ...projectInput.frontmatter, title: "" },
      }),
    /title must be a non-empty string/,
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

  assert.throws(
    () =>
      normalizeDocument({
        ...projectInput,
        frontmatter: {
          ...projectInput.frontmatter,
          extra: {
            ...projectInput.frontmatter.extra,
            repo: "http://example.com",
          },
        },
      }),
    /extra.repo must use an https:\/\/ URL/,
  );

  assert.throws(
    () =>
      normalizeDocument({
        ...projectInput,
        frontmatter: {
          ...projectInput.frontmatter,
          extra: {
            ...projectInput.frontmatter.extra,
            site: "not-a-url",
          },
        },
      }),
    /extra.site must use an https:\/\/ URL/,
  );
});

test("accepts a well-formed extra.site and tolerates its absence", () => {
  const withSite = normalizeDocument({
    ...projectInput,
    frontmatter: {
      ...projectInput.frontmatter,
      extra: {
        ...projectInput.frontmatter.extra,
        site: "https://89jobrien.github.io/crux/",
      },
    },
  });

  const withoutSite = normalizeDocument({
    ...projectInput,
    frontmatter: {
      ...projectInput.frontmatter,
      extra: { ...projectInput.frontmatter.extra, site: undefined },
    },
  });

  // extra.site is a display-only field: it must not reach the graph document.
  assert.deepEqual(withSite, withoutSite);
  assert.equal(withSite.id, "project:minibox");
});

test("normalizes a missing description to an empty string", () => {
  const { description: _description, ...frontmatter } =
    projectInput.frontmatter;
  assert.equal(
    normalizeDocument({ ...projectInput, frontmatter }).description,
    "",
  );
});

function graphDocument({
  id,
  kind = "project",
  tags = [],
  relatedIds = [],
  links = [],
}) {
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
    tags,
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
  assert.equal(
    Object.hasOwn(graph.nodes[0], "sourcePath"),
    false,
    "the public manifest must not expose repository source paths",
  );
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

test("ranks and serializes relationships", () => {
  const documents = [
    graphDocument({
      id: "project:alpha",
      tags: ["agent-runtime", "automation", "observability"],
      relatedIds: ["project:bravo"],
      links: ["/projects/charlie/"],
    }),
    graphDocument({ id: "project:bravo", tags: ["security"] }),
    graphDocument({ id: "project:charlie", tags: ["testing"] }),
    graphDocument({
      id: "project:delta",
      tags: ["automation", "observability"],
    }),
    graphDocument({
      id: "project:echo",
      tags: ["agent-runtime", "automation"],
    }),
  ];
  const graph = buildContentGraph(documents);

  assert.deepEqual(
    rankRelated("project:alpha", graph, 4).map(({ id }) => id),
    ["project:bravo", "project:charlie", "project:delta", "project:echo"],
  );

  const tagEdge = graph.edges.find(
    (edge) =>
      edge.source === "project:alpha" && edge.target === "project:delta",
  );
  assert.equal(tagEdge.directed, false);
  assert.equal(tagEdge.tagSimilarity, 2 / 3);
  assert.deepEqual(tagEdge.evidence, [
    {
      kind: "tag",
      sharedTags: ["automation", "observability"],
    },
  ]);

  assert.equal(
    serializeContentGraph(graph),
    serializeContentGraph(buildContentGraph(documents.toReversed())),
  );
  assert.match(serializeContentGraph(graph), /\n$/);
});

test("ranks combined explicit and link evidence above explicit evidence alone", () => {
  const graph = buildContentGraph([
    graphDocument({
      id: "project:alpha",
      relatedIds: ["project:bravo", "project:charlie"],
      links: ["/projects/charlie/"],
    }),
    graphDocument({ id: "project:bravo" }),
    graphDocument({ id: "project:charlie" }),
  ]);

  assert.deepEqual(
    rankRelated("project:alpha", graph, 2).map(({ id }) => id),
    ["project:charlie", "project:bravo"],
  );
});

test("limits display-ready related nodes to four", () => {
  const graph = buildContentGraph([
    graphDocument({
      id: "project:alpha",
      tags: ["automation"],
      relatedIds: [
        "project:bravo",
        "project:charlie",
        "project:delta",
        "project:echo",
        "project:foxtrot",
      ],
    }),
    ...["bravo", "charlie", "delta", "echo", "foxtrot"].map((stem) =>
      graphDocument({ id: `project:${stem}`, tags: ["automation"] }),
    ),
  ]);

  const alpha = graph.nodes.find((node) => node.id === "project:alpha");
  assert.equal(alpha.related.length, 4);
  assert.deepEqual(
    alpha.related.map(({ id }) => id),
    ["project:bravo", "project:charlie", "project:delta", "project:echo"],
  );
});
