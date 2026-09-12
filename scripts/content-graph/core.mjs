/**
 * @typedef {"project" | "post"} ContentKind
 *
 * @typedef {object} ParsedDocument
 * @property {string} sourcePath
 * @property {Record<string, unknown>} frontmatter
 * @property {string[]} [links]
 *
 * @typedef {object} ContentDocument
 * @property {string} id
 * @property {string} sourcePath
 * @property {ContentKind} kind
 * @property {string} title
 * @property {string} description
 * @property {string} date
 * @property {string} route
 * @property {string[]} tags
 * @property {string[]} relatedIds
 * @property {string[]} links
 *
 * @typedef {object} EdgeEvidence
 * @property {"explicit" | "link" | "tag"} kind
 * @property {string} [declaredBy]
 * @property {string[]} [sharedTags]
 *
 * @typedef {object} ContentEdge
 * @property {string} source
 * @property {string} target
 * @property {boolean} directed
 * @property {EdgeEvidence[]} evidence
 * @property {number} tagSimilarity
 *
 * @typedef {object} ContentNode
 * @property {string} id
 * @property {string} sourcePath
 * @property {ContentKind} kind
 * @property {string} title
 * @property {string} description
 * @property {string} date
 * @property {string} route
 * @property {string[]} tags
 * @property {{id: string, reasons: EdgeEvidence[]}[]} related
 * @property {{id: string}[]} backlinks
 *
 * @typedef {object} ContentGraph
 * @property {1} schemaVersion
 * @property {ContentNode[]} nodes
 * @property {ContentEdge[]} edges
 *
 * @typedef {object} ValidationIssue
 * @property {string} code
 * @property {string} message
 */

const CONTENT_PATH =
  /^content\/(projects|blog)\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NODE_ID = /^(?:project|post):[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function requireNonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} must be a non-empty string`);
  }

  return value.trim();
}

function requireStringArray(value, field) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new TypeError(`${field} must be an array of strings`);
  }

  return [...value];
}

function normalizeDate(value) {
  const date = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  if (typeof date !== "string" || !ISO_DATE.test(date)) {
    throw new TypeError("date must use YYYY-MM-DD format");
  }

  return date;
}

function normalizeTags(value) {
  const tags = requireStringArray(value, "tags");
  if (new Set(tags).size !== tags.length) {
    throw new TypeError("tags must be unique");
  }
  if (tags.some((tag) => !KEBAB_CASE.test(tag))) {
    throw new TypeError("tags must use lowercase kebab-case");
  }

  return tags.toSorted();
}

function normalizeRelatedIds(value) {
  const relatedIds = requireStringArray(value, "extra.related");
  if (new Set(relatedIds).size !== relatedIds.length) {
    throw new TypeError("extra.related IDs must be unique");
  }
  if (relatedIds.some((id) => !NODE_ID.test(id))) {
    throw new TypeError("extra.related IDs must be namespaced node IDs");
  }

  return relatedIds.toSorted();
}

/**
 * @param {ParsedDocument} input
 * @returns {ContentDocument | null}
 */
export function normalizeDocument(input) {
  const { sourcePath, frontmatter, links = [] } = input;
  if (sourcePath.endsWith("/_index.md") || frontmatter.draft === true) {
    return null;
  }
  if (frontmatter.slug !== undefined || frontmatter.path !== undefined) {
    throw new TypeError("custom slug or path overrides are unsupported");
  }

  const match = CONTENT_PATH.exec(sourcePath);
  if (!match) {
    throw new TypeError(`unsupported content path: ${sourcePath}`);
  }

  const [, section, stem] = match;
  const kind = section === "projects" ? "project" : "post";
  const taxonomies = frontmatter.taxonomies ?? {};
  const extra = frontmatter.extra ?? {};

  return {
    id: `${kind}:${stem}`,
    sourcePath,
    kind,
    title: requireNonEmptyString(frontmatter.title, "title"),
    description: requireNonEmptyString(frontmatter.description, "description"),
    date: normalizeDate(frontmatter.date),
    route: `/${section}/${stem}/`,
    tags: normalizeTags(taxonomies.tags),
    relatedIds: normalizeRelatedIds(extra.related),
    links: requireStringArray(links, "links").toSorted(),
  };
}

function pairKey(left, right) {
  return [left, right].toSorted().join("\0");
}

function evidenceKey(evidence) {
  return [
    evidence.kind,
    evidence.declaredBy ?? "",
    ...(evidence.sharedTags ?? []),
  ].join("\0");
}

function compareEvidence(left, right) {
  const priority = { explicit: 0, link: 1, tag: 2 };
  return (
    priority[left.kind] - priority[right.kind] ||
    evidenceKey(left).localeCompare(evidenceKey(right))
  );
}

/**
 * @param {ContentDocument[]} documents
 * @returns {ContentGraph}
 */
export function buildContentGraph(documents) {
  const content = documents.filter((document) => document !== null);
  const documentsById = new Map();
  const idsByRoute = new Map();

  for (const document of content) {
    if (documentsById.has(document.id)) {
      throw new TypeError(`duplicate node ID ${document.id}`);
    }
    documentsById.set(document.id, document);
    idsByRoute.set(document.route, document.id);
  }

  const edgeMap = new Map();
  const backlinkMap = new Map(
    content.map((document) => [document.id, new Set()]),
  );

  const addEvidence = (sourceId, targetId, evidence, tagSimilarity = 0) => {
    if (sourceId === targetId) {
      throw new TypeError(`self relationship ${sourceId}`);
    }

    const [source, target] = [sourceId, targetId].toSorted();
    const key = pairKey(source, target);
    const edge = edgeMap.get(key) ?? {
      source,
      target,
      directed: false,
      evidence: [],
      tagSimilarity: 0,
    };
    if (
      !edge.evidence.some((item) => evidenceKey(item) === evidenceKey(evidence))
    ) {
      edge.evidence.push(evidence);
      edge.evidence.sort(compareEvidence);
    }
    edge.directed ||= evidence.kind !== "tag";
    edge.tagSimilarity = Math.max(edge.tagSimilarity, tagSimilarity);
    edgeMap.set(key, edge);
  };

  for (const document of content) {
    for (const targetId of document.relatedIds) {
      if (!documentsById.has(targetId)) {
        throw new TypeError(`unknown relationship target ${targetId}`);
      }
      addEvidence(document.id, targetId, {
        kind: "explicit",
        declaredBy: document.id,
      });
    }

    for (const route of document.links) {
      const targetId = idsByRoute.get(route);
      if (!targetId) {
        throw new TypeError(`unknown link target ${route}`);
      }
      addEvidence(document.id, targetId, {
        kind: "link",
        declaredBy: document.id,
      });
      backlinkMap.get(targetId).add(document.id);
    }
  }

  for (let leftIndex = 0; leftIndex < content.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < content.length;
      rightIndex += 1
    ) {
      const left = content[leftIndex];
      const right = content[rightIndex];
      const sharedTags = left.tags.filter((tag) => right.tags.includes(tag));
      const unionSize = new Set([...left.tags, ...right.tags]).size;
      const similarity = unionSize === 0 ? 0 : sharedTags.length / unionSize;
      if (sharedTags.length >= 2 || similarity >= 0.5) {
        addEvidence(left.id, right.id, { kind: "tag", sharedTags }, similarity);
      }
    }
  }

  const edges = [...edgeMap.values()].toSorted(
    (left, right) =>
      left.source.localeCompare(right.source) ||
      left.target.localeCompare(right.target),
  );
  const relatedMap = new Map(content.map((document) => [document.id, []]));
  for (const edge of edges) {
    relatedMap.get(edge.source).push({
      id: edge.target,
      reasons: edge.evidence.map((evidence) => ({ ...evidence })),
    });
    relatedMap.get(edge.target).push({
      id: edge.source,
      reasons: edge.evidence.map((evidence) => ({ ...evidence })),
    });
  }

  const nodes = content
    .map(({ relatedIds: _relatedIds, links: _links, ...document }) => ({
      ...document,
      related: relatedMap
        .get(document.id)
        .toSorted((left, right) => left.id.localeCompare(right.id)),
      backlinks: [...backlinkMap.get(document.id)]
        .toSorted()
        .map((id) => ({ id })),
    }))
    .toSorted((left, right) => left.id.localeCompare(right.id));

  const graph = { schemaVersion: 1, nodes, edges };
  for (const node of graph.nodes) {
    node.related = rankRelated(node.id, graph, 4);
  }

  return graph;
}

/**
 * @param {string} nodeId
 * @param {ContentGraph} graph
 * @param {number} limit
 * @returns {{id: string, reasons: EdgeEvidence[]}[]}
 */
export function rankRelated(nodeId, graph, limit) {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new TypeError(`unknown node ${nodeId}`);
  }
  if (!Number.isInteger(limit) || limit < 0) {
    throw new TypeError("related limit must be a non-negative integer");
  }

  const edgeMap = new Map(
    graph.edges.map((edge) => [pairKey(edge.source, edge.target), edge]),
  );
  const priority = (related) => {
    if (related.reasons.some(({ kind }) => kind === "explicit")) {
      return 0;
    }
    if (related.reasons.some(({ kind }) => kind === "link")) {
      return 1;
    }
    return 2;
  };

  return node.related
    .toSorted((left, right) => {
      const leftEdge = edgeMap.get(pairKey(nodeId, left.id));
      const rightEdge = edgeMap.get(pairKey(nodeId, right.id));
      return (
        priority(left) - priority(right) ||
        rightEdge.tagSimilarity - leftEdge.tagSimilarity ||
        left.id.localeCompare(right.id)
      );
    })
    .slice(0, limit);
}

/**
 * @param {ContentGraph} graph
 * @returns {string}
 */
export function serializeContentGraph(graph) {
  return `${JSON.stringify(graph, null, 2)}\n`;
}

/**
 * @param {ContentGraph} graph
 * @returns {ValidationIssue[]}
 */
export function validateContentGraph(graph) {
  const issues = [];
  const nodeIds = new Set();

  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      issues.push({
        code: "duplicate-node-id",
        message: `node ID ${node.id} is duplicated`,
      });
    }
    nodeIds.add(node.id);
  }

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source)) {
      issues.push({
        code: "unknown-edge-source",
        message: `edge source ${edge.source} does not exist`,
      });
    }
    if (!nodeIds.has(edge.target)) {
      issues.push({
        code: "unknown-edge-target",
        message: `edge target ${edge.target} does not exist`,
      });
    }
    if (edge.source === edge.target) {
      issues.push({
        code: "self-edge",
        message: `edge ${edge.source} references itself`,
      });
    }
  }

  return issues;
}
