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
