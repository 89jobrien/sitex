import assert from "node:assert/strict";
import test from "node:test";

import { parseHTML } from "linkedom";

import {
  DEFAULT_EDGE_KINDS,
  NODE_KINDS,
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

function previewFixture() {
  const { document } = parseHTML(`
    <section data-content-graph data-graph-mode="preview" data-manifest-url="/sitex/data/content-graph.json">
      <div data-graph-canvas></div>
      <p data-graph-fallback><a href="/sitex/graph/">Open the content graph</a></p>
    </section>
  `);
  return { document, root: document.querySelector("[data-content-graph]") };
}

function manifestResponse(graph_) {
  return async () => ({ ok: true, json: async () => structuredClone(graph_) });
}

function viewportTransform(root) {
  const transform = root
    .querySelector(".graph-nodes")
    .parentNode.getAttribute("transform");
  const match = /translate\((-?[\d.]+) (-?[\d.]+)\) scale\(([\d.]+)\)/.exec(
    transform,
  );
  return {
    offsetX: Number(match[1]),
    offsetY: Number(match[2]),
    scale: Number(match[3]),
  };
}

function scatteredGraph(count) {
  return {
    schemaVersion: 1,
    nodes: Array.from({ length: count }, (_, index) => ({
      id: `project:node-${index}`,
      kind: "project",
      title: `Node ${index}`,
      description: "Unconnected node",
      date: "2026-09-12",
      route: `/projects/node-${index}/`,
      tags: [],
      related: [],
      backlinks: [],
    })),
    edges: [],
  };
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
  await initializeContentGraph(root, { fetchImpl: manifestResponse(graph) });
  const canvas = root.querySelector("[data-graph-canvas]");
  const initialSvg = canvas.querySelector("svg");
  assert.ok(initialSvg.__zoom, "explorer installs zoom behavior");

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
    fetchImpl: manifestResponse(graph),
    matchMediaImpl: () => ({ matches: true }),
  });

  for (const node of root.querySelectorAll("[data-graph-node]")) {
    assert.match(node.getAttribute("cx"), /^-?\d+(?:\.\d+)?$/);
    assert.match(node.getAttribute("cy"), /^-?\d+(?:\.\d+)?$/);
  }
});

test("reads every node in preview mode without filter controls", () => {
  const { root } = previewFixture();

  assert.deepEqual(readFilterState(root), {
    query: "",
    kinds: new Set(NODE_KINDS),
    tags: new Set(),
    edgeKinds: new Set(DEFAULT_EDGE_KINDS),
  });
});

test("renders a read-only preview that navigates instead of trapping wheel input", async () => {
  const { document, root } = previewFixture();
  const navigated = [];

  const initialized = await initializeContentGraph(root, {
    fetchImpl: manifestResponse(graph),
    navigateImpl: (url) => navigated.push(url),
    matchMediaImpl: () => ({ matches: true }),
  });

  assert.equal(initialized, true);
  assert.equal(root.querySelectorAll("[data-graph-node]").length, 3);
  assert.equal(root.querySelectorAll(".graph-edge").length, 2);
  assert.equal(
    root.querySelector("[data-graph-node]").getAttribute("role"),
    "link",
  );
  assert.equal(
    root.querySelector("[data-graph-node]").getAttribute("aria-label"),
    "Open Alpha Runner, project",
  );
  assert.equal(root.querySelector("svg").__zoom, undefined);

  const alpha = root.querySelector('[data-graph-node="project:alpha"]');
  alpha.dispatchEvent(
    Object.assign(new document.defaultView.Event("keydown"), {
      key: "Enter",
    }),
  );
  assert.deepEqual(navigated, ["/sitex/projects/alpha/"]);

  const space = new document.defaultView.Event("keydown");
  Object.defineProperty(space, "key", { value: " " });
  alpha.dispatchEvent(space);
  assert.deepEqual(navigated, ["/sitex/projects/alpha/"]);

  alpha.dispatchEvent(
    new document.defaultView.Event("click", { bubbles: true }),
  );
  assert.deepEqual(navigated, [
    "/sitex/projects/alpha/",
    "/sitex/projects/alpha/",
  ]);
});

test("reads a hover tooltip for preview nodes and hides it on leave", async () => {
  const { document, root } = previewFixture();

  await initializeContentGraph(root, {
    fetchImpl: manifestResponse(graph),
    matchMediaImpl: () => ({ matches: true }),
  });

  const tooltip = root.querySelector("[data-graph-canvas] .graph-tooltip");
  assert.ok(tooltip, "preview renders a tooltip element");
  assert.equal(tooltip.hidden, true);
  assert.equal(tooltip.getAttribute("aria-hidden"), "true");

  const alpha = root.querySelector('[data-graph-node="project:alpha"]');
  alpha.dispatchEvent(new document.defaultView.Event("mouseenter"));

  assert.equal(tooltip.hidden, false);
  assert.equal(tooltip.className, "graph-tooltip graph-tooltip-project");
  assert.match(tooltip.textContent, /Alpha Runner/);
  assert.match(tooltip.textContent, /Project · 2026-09-12/);
  assert.match(tooltip.textContent, /Automates release checks/);
  assert.deepEqual(
    [...tooltip.querySelectorAll(".graph-tooltip-tags li")].map(
      (item) => item.textContent,
    ),
    ["automation", "testing"],
  );
  assert.match(tooltip.textContent, /Select to open this page/);

  alpha.dispatchEvent(new document.defaultView.Event("mouseleave"));
  assert.equal(tooltip.hidden, true);
});

test("reports connection counts in the explorer tooltip without the open hint", async () => {
  const { document, root } = fixture();
  const connected = structuredClone(graph);
  connected.nodes[0].related = [
    { id: "post:bravo", reasons: [{ kind: "link" }] },
  ];
  connected.nodes[0].backlinks = [{ id: "project:charlie" }];

  await initializeContentGraph(root, {
    fetchImpl: manifestResponse(connected),
    matchMediaImpl: () => ({ matches: true }),
  });

  const tooltip = root.querySelector("[data-graph-canvas] .graph-tooltip");
  const alpha = root.querySelector('[data-graph-node="project:alpha"]');

  alpha.dispatchEvent(new document.defaultView.Event("focus"));
  assert.equal(tooltip.hidden, false);
  assert.match(tooltip.textContent, /2 direct connections/);
  assert.doesNotMatch(tooltip.textContent, /Select to open/);

  alpha.dispatchEvent(new document.defaultView.Event("blur"));
  assert.equal(tooltip.hidden, true);
});

test("keeps one tooltip across explorer re-renders", async () => {
  const { document, root } = fixture();
  await initializeContentGraph(root, { fetchImpl: manifestResponse(graph) });

  root
    .querySelector('input[name="query"]')
    .dispatchEvent(new document.defaultView.Event("input", { bubbles: true }));

  assert.equal(root.querySelectorAll(".graph-tooltip").length, 1);
});

test("settles unconnected preview nodes inside the canvas at readable size", async () => {
  const { root } = previewFixture();

  await initializeContentGraph(root, {
    fetchImpl: manifestResponse(scatteredGraph(24)),
  });

  const { offsetX, offsetY, scale } = viewportTransform(root);
  // Without preview gravity the many-body charge drifts unconnected nodes
  // outward, which the fit then compensates by shrinking every node.
  assert.ok(
    scale >= 0.9 && scale <= 1,
    `fit scale ${scale} keeps nodes legible`,
  );

  for (const node of root.querySelectorAll("[data-graph-node]")) {
    const x = Number(node.getAttribute("cx")) * scale + offsetX;
    const y = Number(node.getAttribute("cy")) * scale + offsetY;
    assert.ok(x >= 0 && x <= 800, `node x ${x} stays inside the viewBox`);
    assert.ok(y >= 0 && y <= 560, `node y ${y} stays inside the viewBox`);
  }
});

test("fails open in preview mode when the manifest cannot be loaded", async () => {
  const { root } = previewFixture();
  const warnings = [];

  const initialized = await initializeContentGraph(root, {
    fetchImpl: async () => {
      throw new Error("offline");
    },
    warnImpl: (message) => warnings.push(message),
  });

  assert.equal(initialized, false);
  assert.equal(root.querySelector("svg"), null);
  assert.equal(root.querySelector("[data-graph-fallback]").hidden, false);
  assert.deepEqual(warnings, ["Content graph enhancement unavailable."]);
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
