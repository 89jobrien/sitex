import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { parse as parseYaml } from "yaml";

import { buildContentGraph, normalizeDocument } from "./core.mjs";

const CONTENT_ROUTE = /^\/(projects|blog)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/;
const CONTENT_FILE =
  /^content\/(projects|blog)\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

function routeFromContentPath(contentPath) {
  const match = CONTENT_FILE.exec(contentPath);
  return match ? `/${match[1]}/${match[2]}/` : null;
}

function normalizeLinkTarget(url, sourcePath) {
  if (/^[a-z][a-z+.-]*:/i.test(url) || url.startsWith("#")) {
    return null;
  }

  const cleanUrl = url.split(/[?#]/, 1)[0];
  const routeMatch = CONTENT_ROUTE.exec(cleanUrl);
  if (routeMatch) {
    return `/${routeMatch[1]}/${routeMatch[2]}/`;
  }
  if (cleanUrl.startsWith("/")) {
    return null;
  }

  const resolved = path.posix
    .normalize(path.posix.join(path.posix.dirname(sourcePath), cleanUrl))
    .replace(/^\.\//, "");
  return routeFromContentPath(resolved);
}

/**
 * @param {string} body
 * @param {string} sourcePath
 * @returns {string[]}
 */
export function extractGraphLinks(body, sourcePath) {
  const tree = unified().use(remarkParse).parse(body);
  const links = [];
  visit(tree, "link", (node) => {
    const route = normalizeLinkTarget(node.url, sourcePath);
    if (route) {
      links.push(route);
    }
  });
  return links.toSorted();
}

function parseMarkdown(markdown, sourcePath) {
  if (!markdown.startsWith("---\n")) {
    throw new TypeError(`${sourcePath} must start with YAML frontmatter`);
  }
  const boundary = markdown.indexOf("\n---\n", 4);
  if (boundary === -1) {
    throw new TypeError(`${sourcePath} has unterminated YAML frontmatter`);
  }

  const frontmatter = parseYaml(markdown.slice(4, boundary));
  const body = markdown.slice(boundary + 5);
  return {
    sourcePath,
    frontmatter,
    links: extractGraphLinks(body, sourcePath),
  };
}

async function contentFiles(rootDir) {
  const files = [];
  for (const section of ["projects", "blog"]) {
    const directory = path.join(rootDir, "content", section);
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(`content/${section}/${entry.name}`);
      }
    }
  }
  return files.toSorted();
}

/**
 * @param {{rootDir?: string}} [options]
 * @returns {Promise<import("./core.mjs").ContentGraph>}
 */
export async function generateContentGraph({ rootDir = process.cwd() } = {}) {
  const documents = [];
  for (const sourcePath of await contentFiles(rootDir)) {
    const markdown = await readFile(path.join(rootDir, sourcePath), "utf8");
    const document = normalizeDocument(parseMarkdown(markdown, sourcePath));
    if (document) {
      documents.push(document);
    }
  }

  return buildContentGraph(documents);
}
