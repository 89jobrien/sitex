import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
} from "d3-force";
import { select } from "d3-selection";
import { zoom, zoomIdentity } from "d3-zoom";

export const DEFAULT_EDGE_KINDS = Object.freeze(["explicit", "link"]);

function checkedValues(root, name) {
  return new Set(
    [...root.querySelectorAll(`input[name="${name}"]:checked`)].map(
      ({ value }) => value,
    ),
  );
}

export function readFilterState(root) {
  return {
    query: root.querySelector('input[name="query"]')?.value.trim() ?? "",
    kinds: checkedValues(root, "kind"),
    tags: checkedValues(root, "tag"),
    edgeKinds: checkedValues(root, "edge"),
  };
}

function matchesNode(node, state) {
  if (!state.kinds.has(node.kind)) return false;
  if (state.tags.size > 0 && !node.tags.some((tag) => state.tags.has(tag))) {
    return false;
  }

  const query = state.query.toLocaleLowerCase();
  if (!query) return true;
  return [node.title, node.description, ...node.tags]
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
}

function edgeHasKind(edge, enabledKinds) {
  return edge.evidence.some(({ kind }) => enabledKinds.has(kind));
}

export function filterGraph(graph, state) {
  const nodes = graph.nodes.filter((node) => matchesNode(node, state));
  const visibleIds = new Set(nodes.map(({ id }) => id));
  const edges = graph.edges.filter(
    (edge) =>
      visibleIds.has(
        typeof edge.source === "string" ? edge.source : edge.source.id,
      ) &&
      visibleIds.has(
        typeof edge.target === "string" ? edge.target : edge.target.id,
      ) &&
      edgeHasKind(edge, state.edgeKinds),
  );
  return { nodes, edges };
}

function routeWithBase(route, manifestUrl) {
  const marker = "/data/content-graph.json";
  const path = new URL(manifestUrl, "https://example.invalid").pathname;
  const basePath = path.endsWith(marker) ? path.slice(0, -marker.length) : "";
  return `${basePath}${route}`.replace(/\/+/g, "/");
}

function addTagFilters(root, graph) {
  const container = root.querySelector("[data-tag-filters]");
  if (!container || container.childElementCount > 0) return;

  const document = root.ownerDocument;
  const tags = [
    ...new Set(graph.nodes.flatMap(({ tags: nodeTags }) => nodeTags)),
  ].sort();
  for (const tag of tags) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "tag";
    input.value = tag;
    label.append(input, ` ${tag}`);
    container.append(label);
  }
}

function renderDetails(root, node, manifestUrl) {
  const details = root.querySelector("[data-graph-details]");
  if (!details) return;

  const document = root.ownerDocument;
  const title = document.createElement("h2");
  title.textContent = node.title;
  const kind = document.createElement("p");
  kind.textContent = node.kind;
  const description = document.createElement("p");
  description.textContent = node.description;
  const link = document.createElement("a");
  link.href = routeWithBase(node.route, manifestUrl);
  link.textContent = `Open ${node.title}`;
  details.replaceChildren(title, kind, description, link);
  details.hidden = false;
}

function primaryEdgeKind(edge, enabledKinds) {
  return (
    edge.evidence.find(({ kind }) => enabledKinds.has(kind))?.kind ?? "tag"
  );
}

function installZoom(root, svg, viewport) {
  const zoomBehavior = zoom()
    .scaleExtent([0.35, 4])
    .on("zoom", ({ transform }) => viewport.attr("transform", transform));
  svg.call(zoomBehavior);

  for (const button of root.querySelectorAll("[data-graph-zoom]")) {
    button.onclick = () => {
      const action = button.dataset.graphZoom;
      if (action === "reset") {
        svg.call(zoomBehavior.transform, zoomIdentity);
      } else {
        svg.call(zoomBehavior.scaleBy, action === "in" ? 1.35 : 1 / 1.35);
      }
    };
  }
}

function renderGraph(root, graph, state, manifestUrl) {
  const canvas = root.querySelector("[data-graph-canvas]");
  if (!canvas) return;

  const width = Math.max(canvas.clientWidth || 800, 320);
  const height = Math.max(canvas.clientHeight || 560, 320);
  const svg = select(canvas)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", "Interactive content relationship graph");
  const viewport = svg.append("g");
  const edges = graph.edges.map((edge) => ({ ...edge }));
  const nodes = graph.nodes.map((node) => ({ ...node }));

  const lines = viewport
    .append("g")
    .attr("class", "graph-edges")
    .selectAll("line")
    .data(edges)
    .join("line")
    .attr(
      "class",
      (edge) =>
        `graph-edge graph-edge-${primaryEdgeKind(edge, state.edgeKinds)}`,
    );

  const circles = viewport
    .append("g")
    .attr("class", "graph-nodes")
    .selectAll("circle")
    .data(nodes)
    .join("circle")
    .attr("r", 9)
    .attr("class", (node) => `graph-node graph-node-${node.kind}`)
    .attr("data-graph-node", ({ id }) => id)
    .attr("role", "link")
    .attr("tabindex", 0)
    .attr("aria-label", (node) => `${node.title}, ${node.kind}`)
    .on("click", (_, node) => selectNode(node))
    .on("keydown", (event, node) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectNode(node);
      }
    });

  function selectNode(node) {
    circles.classed("is-selected", ({ id }) => id === node.id);
    renderDetails(root, node, manifestUrl);
  }

  const simulation = forceSimulation(nodes)
    .force("charge", forceManyBody().strength(-90))
    .force("center", forceCenter(width / 2, height / 2))
    .force(
      "link",
      forceLink(edges)
        .id(({ id }) => id)
        .distance(72),
    )
    .on("tick", () => {
      lines
        .attr("x1", ({ source }) => source.x)
        .attr("y1", ({ source }) => source.y)
        .attr("x2", ({ target }) => target.x)
        .attr("y2", ({ target }) => target.y);
      circles.attr("cx", ({ x }) => x).attr("cy", ({ y }) => y);
    });

  installZoom(root, svg, viewport);
  return simulation;
}

function updateFallback(root, state) {
  const query = state.query.toLocaleLowerCase();
  for (const item of root.querySelectorAll("[data-node-kind]")) {
    const matchesKind = state.kinds.has(item.dataset.nodeKind);
    const tags = new Set(
      (item.dataset.nodeTags ?? "").split(" ").filter(Boolean),
    );
    const matchesTags =
      state.tags.size === 0 || [...state.tags].some((tag) => tags.has(tag));
    const matchesText =
      !query || item.textContent.toLocaleLowerCase().includes(query);
    item.hidden = !(matchesKind && matchesTags && matchesText);
  }
}

export async function initializeContentGraph(
  root,
  { fetchImpl = globalThis.fetch } = {},
) {
  if (!root || typeof fetchImpl !== "function") return false;
  const manifestUrl = root.dataset.manifestUrl;

  try {
    const response = await fetchImpl(manifestUrl);
    if (!response.ok)
      throw new Error(`manifest request failed: ${response.status}`);
    const graph = await response.json();
    addTagFilters(root, graph);

    let simulation;
    const update = () => {
      const state = readFilterState(root);
      simulation?.stop();
      root.querySelector("[data-graph-canvas]")?.replaceChildren();
      const details = root.querySelector("[data-graph-details]");
      if (details) details.hidden = true;
      simulation = renderGraph(
        root,
        filterGraph(graph, state),
        state,
        manifestUrl,
      );
      updateFallback(root, state);
    };
    const controls = root.querySelector("[data-graph-controls]");
    controls?.addEventListener("input", update);
    controls?.addEventListener("change", update);
    controls?.addEventListener("submit", (event) => event.preventDefault());
    update();
    root.dataset.enhanced = "true";
    return true;
  } catch {
    root.querySelector("[data-graph-canvas]")?.replaceChildren();
    delete root.dataset.enhanced;
    return false;
  }
}

if (typeof document !== "undefined") {
  const root = document.querySelector("[data-content-graph]");
  if (root) void initializeContentGraph(root);
}
