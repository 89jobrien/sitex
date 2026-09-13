import assert from "node:assert/strict";
import test from "node:test";

import { parseHTML } from "linkedom";

import {
  DEFAULT_EDGE_KINDS,
  filterGraph,
  initializeContentGraph,
  readFilterState,
  validateContentGraphManifest,
} from "./ui.mjs";

const graph = {
  schemaVersion: 1,
  nodes: [
    {
      id: "project:alpha",
      kind: "project",
      title: "Alpha Runner",
      description: "Automates release checks",
      date: "2026-09-12",
      route: "/projects/alpha/",
      tags: ["automation", "testing"],
      related: [],
      backlinks: [],
    },
    {
      id: "post:bravo",
      kind: "post",
      title: "Bravo Notes",
      description: "A deployment field guide",
      date: "2026-09-12",
      route: "/blog/bravo/",
      tags: ["testing"],
      related: [],
      backlinks: [],
    },
    {
      id: "project:charlie",
      kind: "project",
      title: "Charlie",
      description: "A shell utility",
      date: "2026-09-12",
      route: "/projects/charlie/",
      tags: ["shell-tooling"],
      related: [],
      backlinks: [],
    },
  ],
  edges: [
    {
      source: "project:alpha",
      target: "post:bravo",
      directed: true,
      evidence: [
        { kind: "explicit", declaredBy: "project:alpha" },
        { kind: "tag", sharedTags: ["testing"] },
      ],
      tagSimilarity: 0.5,
    },
    {
      source: "post:bravo",
      target: "project:charlie",
      directed: true,
      evidence: [{ kind: "link", declaredBy: "post:bravo" }],
      tagSimilarity: 0,
    },
  ],
};

function fixture() {
  const { document } = parseHTML(`
    <section data-content-graph data-manifest-url="/sitex/data/content-graph.json">
      <form data-graph-controls>
        <input name="query" type="search">
        <input name="kind" value="project" type="checkbox" checked>
        <input name="kind" value="post" type="checkbox" checked>
        <div data-tag-filters></div>
        <input name="edge" value="explicit" type="checkbox" checked>
        <input name="edge" value="link" type="checkbox" checked>
        <input name="edge" value="tag" type="checkbox">
      </form>
      <button type="button" data-graph-zoom="in">Zoom in</button>
      <button type="button" data-graph-zoom="out">Zoom out</button>
      <button type="button" data-graph-zoom="reset">Reset view</button>
      <div data-graph-canvas></div>
      <aside data-graph-details hidden></aside>
      <div data-graph-fallback><span data-node-kind="project" data-node-tags="automation">Alpha Runner</span></div>
    </section>
  `);
  return { document, root: document.querySelector("[data-content-graph]") };
}

test("reads filter state with explicit and link edges enabled initially", () => {
  const { root } = fixture();

  assert.deepEqual([...DEFAULT_EDGE_KINDS], ["explicit", "link"]);
  assert.deepEqual(readFilterState(root), {
    query: "",
    kinds: new Set(["project", "post"]),
    tags: new Set(),
    edgeKinds: new Set(["explicit", "link"]),
  });
});

test("filters nodes by text, kind, and tags while keeping tag edges opt-in", () => {
  const result = filterGraph(graph, {
    query: "release",
    kinds: new Set(["project"]),
    tags: new Set(["automation"]),
    edgeKinds: new Set(DEFAULT_EDGE_KINDS),
  });

  assert.deepEqual(
    result.nodes.map(({ id }) => id),
    ["project:alpha"],
  );
  assert.deepEqual(result.edges, []);

  const tagResult = filterGraph(graph, {
    query: "",
    kinds: new Set(["project", "post"]),
    tags: new Set(),
    edgeKinds: new Set(["tag"]),
  });
  assert.deepEqual(
    tagResult.edges.map(({ source, target }) => [source, target]),
    [["project:alpha", "post:bravo"]],
  );
});

test("initializes details, accessible nodes, keyboard activation, and navigation", async () => {
  const { document, root } = fixture();
  const requested = [];

  const initialized = await initializeContentGraph(root, {
    fetchImpl: async (url) => {
      requested.push(url);
      return { ok: true, json: async () => structuredClone(graph) };
    },
  });

  assert.equal(initialized, true);
  assert.deepEqual(requested, ["/sitex/data/content-graph.json"]);
  assert.equal(root.dataset.enhanced, "true");
  assert.equal(root.querySelectorAll("[data-graph-node]").length, 3);
  assert.equal(root.querySelector("svg").getAttribute("role"), "group");
  assert.equal(
    root.querySelector("[data-graph-node]").getAttribute("role"),
    "button",
  );
  assert.equal(
    root.querySelector("[data-graph-node]").getAttribute("aria-label"),
    "Alpha Runner, project",
  );

  const alpha = root.querySelector('[data-graph-node="project:alpha"]');
  const activation = new document.defaultView.Event("keydown");
  Object.defineProperty(activation, "key", { value: "Enter" });
  alpha.dispatchEvent(activation);

  const details = root.querySelector("[data-graph-details]");
  assert.equal(details.hidden, false);
  assert.match(details.textContent, /Alpha Runner/);
  assert.equal(
    details.querySelector("a").getAttribute("href"),
    "/sitex/projects/alpha/",
  );
});

test("rebuilds only for input events", async () => {
  const { document, root } = fixture();
  await initializeContentGraph(root, {
    fetchImpl: async () => ({
      ok: true,
      json: async () => structuredClone(graph),
    }),
  });
  const canvas = root.querySelector("[data-graph-canvas]");
  const initialSvg = canvas.querySelector("svg");

  root
    .querySelector('input[name="query"]')
    .dispatchEvent(new document.defaultView.Event("change", { bubbles: true }));
  assert.equal(canvas.querySelector("svg"), initialSvg);

  root
    .querySelector('input[name="query"]')
    .dispatchEvent(new document.defaultView.Event("input", { bubbles: true }));
  assert.notEqual(canvas.querySelector("svg"), initialSvg);
});

test("settles graph positions synchronously when reduced motion is preferred", async () => {
  const { root } = fixture();
  await initializeContentGraph(root, {
    fetchImpl: async () => ({
      ok: true,
      json: async () => structuredClone(graph),
    }),
    matchMediaImpl: () => ({ matches: true }),
  });

  for (const node of root.querySelectorAll("[data-graph-node]")) {
    assert.match(node.getAttribute("cx"), /^-?\d+(?:\.\d+)?$/);
    assert.match(node.getAttribute("cy"), /^-?\d+(?:\.\d+)?$/);
  }
});

test("validates manifest schema, bounds, routes, and edge endpoints", () => {
  assert.deepEqual(validateContentGraphManifest(structuredClone(graph)), graph);
  assert.throws(
    () =>
      validateContentGraphManifest({
        ...structuredClone(graph),
        nodes: [{ ...graph.nodes[0], route: "/blog/alpha/" }],
        edges: [],
      }),
    /invalid content graph manifest/,
  );
  assert.throws(
    () =>
      validateContentGraphManifest({
        ...structuredClone(graph),
        nodes: [
          { ...graph.nodes[0], sourcePath: "content/projects/alpha.md" },
          ...graph.nodes.slice(1),
        ],
      }),
    /invalid content graph manifest/,
  );
  assert.throws(
    () =>
      validateContentGraphManifest({
        ...structuredClone(graph),
        nodes: [
          { ...graph.nodes[0], backlinks: [{ id: "post:missing" }] },
          ...graph.nodes.slice(1),
        ],
      }),
    /invalid content graph manifest/,
  );
  assert.throws(
    () =>
      validateContentGraphManifest({
        ...structuredClone(graph),
        edges: [
          {
            source: "project:alpha",
            target: "post:missing",
            evidence: [{ kind: "link" }],
          },
        ],
      }),
    /invalid content graph manifest/,
  );
  assert.throws(
    () =>
      validateContentGraphManifest({
        schemaVersion: 1,
        nodes: Array.from({ length: 1001 }, () => graph.nodes[0]),
        edges: [],
      }),
    /invalid content graph manifest/,
  );
});

test("fails open when the manifest cannot be loaded", async () => {
  const { root } = fixture();
  const warnings = [];

  const initialized = await initializeContentGraph(root, {
    fetchImpl: async () => {
      throw new Error("offline");
    },
    warnImpl: (message) => warnings.push(message),
  });

  assert.equal(initialized, false);
  assert.equal(root.dataset.enhanced, undefined);
  assert.equal(root.querySelector("[data-graph-fallback]").hidden, false);
  assert.equal(root.querySelector("svg"), null);
  assert.deepEqual(warnings, ["Content graph enhancement unavailable."]);
});
