/**
 * Detect a programming language from a filename.
 *
 * This is intentionally a flat extension map rather than something fancier
 * like the GitHub linguist library — for indexing purposes "what kind of
 * code is this" is all we need, and `tree-sitter` (Phase 2) will refine
 * recognition for the languages we actually parse.
 *
 * The labels are lowercase, snake_case-free identifiers the rest of the
 * codebase can switch on (e.g. picking a tree-sitter grammar).
 */

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  // JS/TS
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  // Python
  py: "python",
  pyi: "python",
  // Go
  go: "go",
  // Rust
  rs: "rust",
  // Java/Kotlin/Scala
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  scala: "scala",
  // C-family
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hxx: "cpp",
  // .NET
  cs: "csharp",
  fs: "fsharp",
  // Ruby
  rb: "ruby",
  // PHP
  php: "php",
  // Swift
  swift: "swift",
  // Web
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  // Data/config
  json: "json",
  jsonc: "json",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  xml: "xml",
  // Shell
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  ps1: "powershell",
  // Docs
  md: "markdown",
  mdx: "markdown",
  rst: "restructuredtext",
  // SQL
  sql: "sql",
  // Misc useful ones
  proto: "protobuf",
  graphql: "graphql",
  gql: "graphql",
  vue: "vue",
  svelte: "svelte",
  dart: "dart",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  hs: "haskell",
  lua: "lua",
  r: "r",
  jl: "julia",
};

/**
 * Special filenames without extensions that we still want to label.
 * Lowercase for case-insensitive matching.
 */
const FILENAME_TO_LANGUAGE: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "make",
  rakefile: "ruby",
  gemfile: "ruby",
  procfile: "config",
  ".gitignore": "config",
  ".dockerignore": "config",
  ".prettierrc": "json",
  ".eslintrc": "json",
};

export function detectLanguage(path: string): string | null {
  // Strip directory part — we only care about the basename.
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const basename = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
  const lower = basename.toLowerCase();

  const byName = FILENAME_TO_LANGUAGE[lower];
  if (byName) return byName;

  const dotIdx = lower.lastIndexOf(".");
  if (dotIdx <= 0) return null; // no extension or dotfile (.foo)

  const ext = lower.slice(dotIdx + 1);
  return EXTENSION_TO_LANGUAGE[ext] ?? null;
}
