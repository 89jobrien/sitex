import assert from "node:assert/strict";
import test from "node:test";

import { parseHTML } from "linkedom";

import {
  DEFAULT_EDGE_KINDS,
  filterGraph,
  initializeContentGraph,
  readFilterState,
} from "./ui.mjs";

const graph = {
  schemaVersion: 1,
  nodes: [
    {
      id: "project:alpha",
      kind: "project",
      title: "Alpha Runner",
      description: "Automates release checks",
      route: "/projects/alpha/",
      tags: ["automation", "testing"],
    },
    {
      id: "post:bravo",
      kind: "post",
      title: "Bravo Notes",
      description: "A deployment field guide",
      route: "/blog/bravo/",
      tags: ["testing"],
    },
    {
      id: "project:charlie",
      kind: "project",
      title: "Charlie",
      description: "A shell utility",
      route: "/projects/charlie/",
      tags: ["shell-tooling"],
    },
  ],
  edges: [
    {
      source: "project:alpha",
      target: "post:bravo",
      evidence: [
        { kind: "explicit", declaredBy: "project:alpha" },
        { kind: "tag", sharedTags: ["testing"] },
      ],
    },
    {
      source: "post:bravo",
      target: "project:charlie",
      evidence: [{ kind: "link", declaredBy: "post:bravo" }],
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
      <div data-graph-fallback>Server-rendered list</div>
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

test("fails open when the manifest cannot be loaded", async () => {
  const { root } = fixture();

  const initialized = await initializeContentGraph(root, {
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });

  assert.equal(initialized, false);
  assert.equal(root.dataset.enhanced, undefined);
  assert.equal(root.querySelector("[data-graph-fallback]").hidden, false);
  assert.equal(root.querySelector("svg"), null);
});
