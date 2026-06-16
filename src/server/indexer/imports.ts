import { parseSource, type SyntaxNode } from "./parser";

/**
 * Extract import specifiers from a parsed source file.
 *
 * We collect every dependency string we can see in import-like syntax —
 * both relative (`./foo`, `../bar`) and bare (`react`, `lodash`). The
 * resolver later decides which ones become file_edges; for now the rule
 * is "give me everything, downstream filters."
 */

export interface ImportRef {
  /** The literal specifier the source code wrote, unquoted. */
  specifier: string;
  /** 1-based line number where the import appears. Useful for citations. */
  line: number;
}

export async function extractImports(
  filePath: string,
  content: string,
): Promise<ImportRef[]> {
  const parsed = await parseSource(filePath, content);
  if (!parsed) return [];

  try {
    switch (parsed.grammar) {
      case "typescript":
      case "tsx":
      case "javascript":
        return walkJsLike(parsed.tree.rootNode);
      case "python":
        return walkPython(parsed.tree.rootNode);
    }
  } finally {
    (parsed.tree as unknown as { close: () => void }).close();
  }
}

/**
 * TS/TSX/JS share enough syntax that one walker covers all three:
 *   - `import_statement` whose source is a `string` literal
 *   - `export_statement` with a source (re-exports)
 *   - `call_expression` where the function is the `import` keyword (dynamic imports)
 */
function walkJsLike(root: SyntaxNode): ImportRef[] {
  const refs: ImportRef[] = [];
  const stack: SyntaxNode[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;

    if (node.type === "import_statement" || node.type === "export_statement") {
      const source = node.childForFieldName("source");
      if (source && source.type === "string") {
        const spec = stripQuotes(source.text);
        if (spec) refs.push({ specifier: spec, line: node.startPosition.row + 1 });
      }
    } else if (node.type === "call_expression") {
      const fn = node.childForFieldName("function");
      if (fn && fn.type === "import") {
        const args = node.childForFieldName("arguments");
        const firstArg = args?.namedChildren[0] ?? null;
        if (firstArg && firstArg.type === "string") {
          const spec = stripQuotes(firstArg.text);
          if (spec) refs.push({ specifier: spec, line: node.startPosition.row + 1 });
        }
      }
    }

    for (const child of node.namedChildren) {
      if (child) stack.push(child);
    }
  }

  return refs;
}

/**
 * Python imports:
 *   `import foo`           → specifier "foo"
 *   `import foo.bar`       → specifier "foo.bar"
 *   `from .x import y`     → specifier ".x"
 *   `from ..pkg import y`  → specifier "..pkg"
 *
 * We don't try to translate to file paths here — the resolver does.
 */
function walkPython(root: SyntaxNode): ImportRef[] {
  const refs: ImportRef[] = [];
  const stack: SyntaxNode[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;

    if (node.type === "import_statement") {
      // The grammar exposes one or more `dotted_name` children for the
      // modules being imported. We emit one ref per module.
      for (const child of node.namedChildren) {
        if (!child) continue;
        if (child.type === "dotted_name" || child.type === "aliased_import") {
          const name = nameOfPythonImport(child);
          if (name) refs.push({ specifier: name, line: node.startPosition.row + 1 });
        }
      }
    } else if (node.type === "import_from_statement") {
      // `module_name` is the "from X" piece; for `from . import y` it's
      // sometimes absent and we read the `relative_import` marker. We
      // avoid the variable name `module` because Next's lint blocks it
      // (it can collide with CJS' free `module` variable at runtime).
      const fromModule = node.childForFieldName("module_name");
      if (fromModule) {
        refs.push({ specifier: fromModule.text, line: node.startPosition.row + 1 });
      } else {
        // Pure relative: `from . import x` → specifier "."
        const rel = node.namedChildren.find(
          (c) => c?.type === "relative_import",
        );
        if (rel) {
          refs.push({ specifier: rel.text, line: node.startPosition.row + 1 });
        }
      }
    }

    for (const child of node.namedChildren) {
      if (child) stack.push(child);
    }
  }

  return refs;
}

function nameOfPythonImport(node: SyntaxNode): string | null {
  if (node.type === "dotted_name") return node.text;
  if (node.type === "aliased_import") {
    const inner = node.childForFieldName("name");
    return inner?.text ?? null;
  }
  return null;
}

function stripQuotes(text: string): string | null {
  // tree-sitter `string` node includes the quotes. Both forms appear:
  //   "foo"  'foo'  `foo`  (template strings used as import specifiers are rare
  //   but legal in some setups; we still handle them.)
  if (text.length < 2) return null;
  const first = text[0];
  const last = text[text.length - 1];
  if ((first === '"' || first === "'" || first === "`") && first === last) {
    return text.slice(1, -1);
  }
  // Fall through: not a simple string literal (template with substitutions etc.).
  return null;
}
