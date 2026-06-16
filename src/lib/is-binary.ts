/**
 * Decide whether a file is binary and should be skipped by the indexer.
 *
 * Why two checks: extension matching is fast and handles the obvious cases
 * (images, archives, fonts) without any I/O. For ambiguous files we fall
 * back to a null-byte sniff on the first 8 KB — the canonical Git heuristic
 * for "binary." It's not perfect, but it's good enough for our purposes
 * and orders of magnitude cheaper than language-aware detection.
 */

const BINARY_EXTENSIONS = new Set([
  // Images
  "png", "jpg", "jpeg", "gif", "bmp", "ico", "webp", "tif", "tiff", "avif",
  "svg", // intentionally — we don't want to index XML-y SVG bytes
  // Video / audio
  "mp4", "mov", "mkv", "webm", "avi", "wmv",
  "mp3", "wav", "ogg", "flac", "m4a",
  // Archives
  "zip", "tar", "gz", "tgz", "bz2", "7z", "rar", "xz",
  // Documents
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  // Fonts
  "ttf", "otf", "woff", "woff2", "eot",
  // Binaries / artifacts
  "exe", "dll", "so", "dylib", "a", "o", "obj", "class", "jar", "war",
  "wasm", "pyc", "pyo", "bin",
  // ML model files — often huge, never source
  "onnx", "pt", "ckpt", "safetensors", "h5", "pb",
  // Lockfile-ish binary blobs we don't want
  "pack", "idx",
]);

/** Number of bytes to inspect when sniffing for null bytes. */
const SNIFF_LIMIT = 8 * 1024;

export function hasBinaryExtension(path: string): boolean {
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const basename = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
  const dotIdx = basename.lastIndexOf(".");
  if (dotIdx <= 0) return false;
  const ext = basename.slice(dotIdx + 1).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Returns true if the first `SNIFF_LIMIT` bytes contain a NUL byte (0x00).
 * Git uses the same check; it has zero false negatives for real binaries
 * and basically no false positives for source code.
 */
export function looksBinary(bytes: Buffer): boolean {
  const end = Math.min(bytes.length, SNIFF_LIMIT);
  for (let i = 0; i < end; i++) {
    if (bytes[i] === 0) return true;
  }
  return false;
}
