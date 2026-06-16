import path from "node:path";

/**
 * Turn raw import specifiers into edges between file IDs.
 *
 * The resolver handles three patterns:
 *
 *   1. Relative JS/TS — `./foo`, `../bar/baz`. We try the specifier as-is
 *      and with each of the common extensions, plus `<spec>/index.<ext>`.
 *
 *   2. Relative Python — `.x`, `..pkg`. Leading dots count up to the file's
 *      parent directory; then we try the rest as `<name>.py` or
 *      `<name>/__init__.py`.
 *
 *   3. Bare specifiers (`react`, `lodash`, `numpy`) — dropped. They point
 *      outside the repo so they can't become file_edges.
 *
 * Anything we can't resolve to a known file is silently dropped — that's
 * the right call for a portfolio project (better quiet than noisy with
 * false edges).
 */

export interface ImportRef {
  specifier: string;
  line: number;
}

export interface FileEdgeRef {
  sourceFilePath: string;
  targetFilePath: string;
}

const JS_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const PYTHON_EXTENSIONS = [".py", ".pyi"];

export function resolveEdges(args: {
  sourceFilePath: string;
  language: string | null;
  imports: ImportRef[];
  /** path → file_id (we only need paths to dedupe, ids come from caller). */
  knownPaths: Set<string>;
}): FileEdgeRef[] {
  const { sourceFilePath, language, imports, knownPaths } = args;
  const out: FileEdgeRef[] = [];
  const seen = new Set<string>();

  for (const ref of imports) {
    const target = resolveOne(sourceFilePath, language, ref.specifier, knownPaths);
    if (!target) continue;
    if (target === sourceFilePath) continue; // no self-edges
    if (seen.has(target)) continue;
    seen.add(target);
    out.push({ sourceFilePath, targetFilePath: target });
  }
  return out;
}

function resolveOne(
  sourceFilePath: string,
  language: string | null,
  specifier: string,
  knownPaths: Set<string>,
): string | null {
  if (specifier.startsWith(".")) {
    if (language === "python") {
      return resolvePythonRelative(sourceFilePath, specifier, knownPaths);
    }
    return resolveJsRelative(sourceFilePath, specifier, knownPaths);
  }
  // Bare specifier — outside the repo.
  return null;
}

function resolveJsRelative(
  sourceFilePath: string,
  specifier: string,
  knownPaths: Set<string>,
): string | null {
  const sourceDir = path.posix.dirname(sourceFilePath);
  const base = path.posix.normalize(`${sourceDir}/${specifier}`);
  // Strip a trailing slash so the "as-is" case works.
  const candidate = base.endsWith("/") ? base.slice(0, -1) : base;

  const tryPaths: string[] = [];
  // 1. Exact (the specifier already includes the extension).
  tryPaths.push(candidate);
  // 2. Add each JS-family extension.
  for (const ext of JS_EXTENSIONS) {
    tryPaths.push(candidate + ext);
  }
  // 3. Try as a directory with an index file.
  for (const ext of JS_EXTENSIONS) {
    tryPaths.push(`${candidate}/index${ext}`);
  }

  for (const p of tryPaths) {
    if (knownPaths.has(p)) return p;
  }
  return null;
}

/**
 * Python's `from .x import y` semantics:
 *   - one leading dot = current package (the file's parent dir)
 *   - two leading dots = grandparent, and so on
 *   - the remainder is a dotted name resolved as nested directories
 */
function resolvePythonRelative(
  sourceFilePath: string,
  specifier: string,
  knownPaths: Set<string>,
): string | null {
  let dots = 0;
  while (dots < specifier.length && specifier[dots] === ".") dots++;
  const remainder = specifier.slice(dots);

  // Walk up `dots - 1` directories from the source file's directory.
  // (Single dot = same package = the source's parent dir, no walking.)
  let dir = path.posix.dirname(sourceFilePath);
  for (let i = 1; i < dots; i++) {
    dir = path.posix.dirname(dir);
  }

  const subPath = remainder.replace(/\./g, "/");
  const candidate = subPath ? path.posix.join(dir, subPath) : dir;

  const tryPaths: string[] = [];
  for (const ext of PYTHON_EXTENSIONS) {
    tryPaths.push(candidate + ext);
  }
  for (const ext of PYTHON_EXTENSIONS) {
    tryPaths.push(`${candidate}/__init__${ext}`);
  }

  for (const p of tryPaths) {
    if (knownPaths.has(p)) return p;
  }
  return null;
}
