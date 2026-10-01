import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from "d3-force";
import { select } from "d3-selection";
import { zoom, zoomIdentity } from "d3-zoom";

export const DEFAULT_EDGE_KINDS = Object.freeze(["explicit", "link"]);
export const NODE_KINDS = Object.freeze(["project", "post"]);
const NODE_LABELS = Object.freeze({ project: "Project", post: "Essay" });
const PREVIEW_MODE = "preview";
const TOOLTIP_TAGS = 4;
const TOOLTIP_GAP = 10;
const TOOLTIP_INSET = 8;
const MAX_MANIFEST_BYTES = 2_000_000;
const MAX_NODES = 1_000;
const MAX_EDGES = 10_000;
const NODE_ID = /^(project|post):([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TAG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function invalidManifest() {
  throw new TypeError("invalid content graph manifest");
}

function isBoundedString(value, maxLength) {
  return typeof value === "string" && value.length <= maxLength;
}

function hasValidEvidence(evidence, nodeIds) {
  return (
    Array.isArray(evidence) &&
    evidence.length <= 5 &&
    evidence.every(
      (item) =>
        item &&
        ["explicit", "link", "tag"].includes(item.kind) &&
        (item.declaredBy === undefined || nodeIds.has(item.declaredBy)) &&
        (item.sharedTags === undefined ||
          (Array.isArray(item.sharedTags) &&
            item.sharedTags.length <= 64 &&
            item.sharedTags.every(
              (tag) => isBoundedString(tag, 64) && TAG.test(tag),
            ))),
    )
  );
}

export function validateContentGraphManifest(graph) {
  if (
    !graph ||
    graph.schemaVersion !== 1 ||
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.edges) ||
    graph.nodes.length > MAX_NODES ||
    graph.edges.length > MAX_EDGES
  ) {
    invalidManifest();
  }

  const nodeIds = new Set();
  for (const node of graph.nodes) {
    const match = isBoundedString(node?.id, 128) && NODE_ID.exec(node.id);
    if (
      !match ||
      node.kind !== match[1] ||
      nodeIds.has(node.id) ||
      !isBoundedString(node.title, 200) ||
      !isBoundedString(node.description, 2_000) ||
      !isBoundedString(node.date, 10) ||
      !ISO_DATE.test(node.date) ||
      !Array.isArray(node.tags) ||
      node.tags.length > 64 ||
      node.tags.some((tag) => !isBoundedString(tag, 64) || !TAG.test(tag)) ||
      new Set(node.tags).size !== node.tags.length ||
      !Array.isArray(node.related) ||
      node.related.length > 4 ||
      !Array.isArray(node.backlinks) ||
      node.backlinks.length > MAX_NODES ||
      Object.hasOwn(node, "sourcePath") ||
      node.route !==
        `/${node.kind === "project" ? "projects" : "blog"}/${match[2]}/`
    ) {
      invalidManifest();
    }
    nodeIds.add(node.id);
  }

  for (const node of graph.nodes) {
    if (
      node.related.some(
        (related) =>
          !related ||
          !nodeIds.has(related.id) ||
          related.id === node.id ||
          !hasValidEvidence(related.reasons, nodeIds),
      ) ||
      node.backlinks.some(
        (backlink) =>
          !backlink || !nodeIds.has(backlink.id) || backlink.id === node.id,
      )
    ) {
      invalidManifest();
    }
  }

  for (const edge of graph.edges) {
    if (
      !edge ||
      !nodeIds.has(edge.source) ||
      !nodeIds.has(edge.target) ||
      edge.source === edge.target ||
      typeof edge.directed !== "boolean" ||
      !hasValidEvidence(edge.evidence, nodeIds) ||
      !Number.isFinite(edge.tagSimilarity) ||
      edge.tagSimilarity < 0 ||
      edge.tagSimilarity > 1
    ) {
      invalidManifest();
    }
  }

  return graph;
}

async function readManifest(response) {
  const contentLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_MANIFEST_BYTES) {
    invalidManifest();
  }

  if (typeof response.text === "function") {
    const text = await response.text();
    if (text.length > MAX_MANIFEST_BYTES) invalidManifest();
    return validateContentGraphManifest(JSON.parse(text));
  }

  const graph = await response.json();
  if (JSON.stringify(graph).length > MAX_MANIFEST_BYTES) invalidManifest();
  return validateContentGraphManifest(graph);
}

function checkedValues(root, name) {
  return new Set(
    [...root.querySelectorAll(`input[name="${name}"]:checked`)].map(
      ({ value }) => value,
    ),
  );
}

function isPreview(root) {
  return root?.dataset?.graphMode === PREVIEW_MODE;
}

export function readFilterState(root) {
  if (isPreview(root)) {
    return {
      query: "",
      kinds: new Set(NODE_KINDS),
      tags: new Set(),
      edgeKinds: new Set(DEFAULT_EDGE_KINDS),
    };
  }

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

function tooltipLine(document, className, text) {
  const line = document.createElement("p");
  line.className = className;
  line.textContent = text;
  return line;
}

function renderTooltip(tooltip, node, { preview }) {
  const document = tooltip.ownerDocument;
  tooltip.className = `graph-tooltip graph-tooltip-${node.kind}`;
  const children = [
    tooltipLine(document, "graph-tooltip-title", node.title),
    tooltipLine(
      document,
      "graph-tooltip-meta",
      `${NODE_LABELS[node.kind] ?? node.kind} · ${node.date}`,
    ),
  ];

  if (node.description) {
    children.push(
      tooltipLine(document, "graph-tooltip-summary", node.description),
    );
  }

  if (node.tags.length > 0) {
    const tags = document.createElement("ul");
    tags.className = "graph-tooltip-tags";
    for (const tag of node.tags.slice(0, TOOLTIP_TAGS)) {
      const item = document.createElement("li");
      item.textContent = tag;
      tags.append(item);
    }
    children.push(tags);
  }

  const connections = node.related.length + node.backlinks.length;
  if (connections > 0) {
    children.push(
      tooltipLine(
        document,
        "graph-tooltip-meta",
        `${connections} direct connection${connections === 1 ? "" : "s"}`,
      ),
    );
  }

  if (preview) {
    children.push(
      tooltipLine(document, "graph-tooltip-hint", "Select to open this page"),
    );
  }

  tooltip.replaceChildren(...children);
  tooltip.hidden = false;
}

// Reads live geometry rather than simulation coordinates so the tooltip stays
// correct while nodes move and while the explorer is zoomed or panned.
function positionTooltip(tooltip, canvas, anchor) {
  const bounds = canvas.getBoundingClientRect?.();
  const box = anchor?.getBoundingClientRect?.();
  if (!bounds?.width || !bounds?.height) return;
  if (!box || (!box.width && !box.height)) return;

  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;
  const centerX = box.left - bounds.left + box.width / 2;
  const bottom = box.bottom - bounds.top;
  const inset = TOOLTIP_INSET;
  const room = Math.max(bounds.width - width - inset, inset);

  const left = Math.min(Math.max(centerX - width / 2, inset), room);
  let top = box.top - bounds.top - height - TOOLTIP_GAP;
  if (top < inset) top = bottom + TOOLTIP_GAP;
  top = Math.min(
    Math.max(top, inset),
    Math.max(bounds.height - height - inset, inset),
  );

  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
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

function fitViewport(viewport, nodes, width, height) {
  if (nodes.length === 0) return;

  const padding = 28;
  const xs = nodes.map(({ x }) => x);
  const ys = nodes.map(({ y }) => y);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
  const scale = Math.min(
    (width - padding * 2) / Math.max(maxX - minX, 1),
    (height - padding * 2) / Math.max(maxY - minY, 1),
    1,
  );
  const offsetX = width / 2 - ((minX + maxX) / 2) * scale;
  const offsetY = height / 2 - ((minY + maxY) / 2) * scale;
  viewport.attr(
    "transform",
    `translate(${offsetX.toFixed(2)} ${offsetY.toFixed(2)}) scale(${scale.toFixed(3)})`,
  );
}

function renderGraph(
  root,
  graph,
  state,
  { manifestUrl, reduceMotion, preview = false, navigate = () => {} },
) {
  const canvas = root.querySelector("[data-graph-canvas]");
  if (!canvas) return;

  const width = Math.max(canvas.clientWidth || 800, 320);
  const height = Math.max(canvas.clientHeight || 560, 320);
  const svg = select(canvas)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "group")
    .attr("aria-label", "Interactive content relationship graph");
  const viewport = svg.append("g");
  const tooltip = canvas.ownerDocument.createElement("div");
  tooltip.className = "graph-tooltip";
  tooltip.setAttribute("aria-hidden", "true");
  tooltip.hidden = true;
  canvas.append(tooltip);

  let tooltipAnchor = null;
  const syncTooltip = () => {
    if (tooltipAnchor) positionTooltip(tooltip, canvas, tooltipAnchor);
  };
  const hideTooltip = () => {
    tooltipAnchor = null;
    tooltip.hidden = true;
  };
  const showTooltip = function (_, node) {
    renderTooltip(tooltip, node, { preview });
    tooltipAnchor = this;
    syncTooltip();
  };

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
    .attr("role", preview ? "link" : "button")
    .attr("tabindex", 0)
    .attr("aria-label", (node) =>
      preview
        ? `Open ${node.title}, ${node.kind}`
        : `${node.title}, ${node.kind}`,
    )
    .on("click", (_, node) => activate(node))
    .on("mouseenter", showTooltip)
    .on("mouseleave", hideTooltip)
    .on("focus", showTooltip)
    .on("blur", hideTooltip)
    .on("keydown", (event, node) => {
      if (event.key === "Enter" || (!preview && event.key === " ")) {
        event.preventDefault();
        activate(node);
      }
    });

  function activate(node) {
    if (preview) {
      navigate(routeWithBase(node.route, manifestUrl));
      return;
    }
    circles.classed("is-selected", ({ id }) => id === node.id);
    renderDetails(root, node, manifestUrl);
  }

  const updatePositions = () => {
    lines
      .attr("x1", ({ source }) => source.x)
      .attr("y1", ({ source }) => source.y)
      .attr("x2", ({ target }) => target.x)
      .attr("y2", ({ target }) => target.y);
    circles.attr("cx", ({ x }) => x).attr("cy", ({ y }) => y);
    syncTooltip();
  };
  const simulation = forceSimulation(nodes)
    .force("charge", forceManyBody().strength(preview ? -55 : -90))
    .force("center", forceCenter(width / 2, height / 2))
    .force(
      "link",
      forceLink(edges)
        .id(({ id }) => id)
        .distance(preview ? 52 : 72),
    )
    .on("tick", updatePositions);

  if (preview) {
    // The preview settles on a single frame inside a short canvas. Gravity keeps
    // weakly connected nodes from drifting outward against the many-body charge,
    // and collision keeps the dots apart at preview density.
    simulation
      .force("x", forceX(width / 2).strength(0.05))
      .force("y", forceY(height / 2).strength(0.1))
      .force("collide", forceCollide(12));
  }

  if (reduceMotion || preview) {
    simulation.stop();
    simulation.tick(300);
    updatePositions();
  }

  if (preview) {
    fitViewport(viewport, nodes, width, height);
  } else {
    installZoom(root, svg, viewport);
  }
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

function defaultNavigate(url) {
  globalThis.location?.assign?.(url);
}

export async function initializeContentGraph(
  root,
  {
    fetchImpl = globalThis.fetch,
    matchMediaImpl = globalThis.matchMedia,
    warnImpl = console.warn,
    navigateImpl = defaultNavigate,
  } = {},
) {
  if (!root || typeof fetchImpl !== "function") return false;
  const manifestUrl = root.dataset.manifestUrl;
  const preview = isPreview(root);

  try {
    const response = await fetchImpl(manifestUrl);
    if (!response.ok)
      throw new Error(`manifest request failed: ${response.status}`);
    const graph = await readManifest(response);
    if (!preview) {
      addTagFilters(root, graph);
    }
    const reduceMotion =
      typeof matchMediaImpl === "function" &&
      matchMediaImpl("(prefers-reduced-motion: reduce)").matches;

    let simulation;
    const update = () => {
      const state = readFilterState(root);
      simulation?.stop();
      root.querySelector("[data-graph-canvas]")?.replaceChildren();
      const details = root.querySelector("[data-graph-details]");
      if (details) details.hidden = true;
      simulation = renderGraph(root, filterGraph(graph, state), state, {
        manifestUrl,
        reduceMotion,
        preview,
        navigate: navigateImpl,
      });
      updateFallback(root, state);
    };
    const controls = root.querySelector("[data-graph-controls]");
    controls?.addEventListener("input", update);
    controls?.addEventListener("submit", (event) => event.preventDefault());
    update();
    root.dataset.enhanced = "true";
    return true;
  } catch {
    root.querySelector("[data-graph-canvas]")?.replaceChildren();
    delete root.dataset.enhanced;
    warnImpl("Content graph enhancement unavailable.");
    return false;
  }
}

if (typeof document !== "undefined") {
  const root = document.querySelector("[data-content-graph]");
  if (root) void initializeContentGraph(root);
}
