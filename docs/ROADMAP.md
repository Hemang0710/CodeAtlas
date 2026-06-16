# CodeAtlas — Build Roadmap

How to use this file: work through the phases in order. Each phase has a goal,
a build list, a "definition of done," and a **kickoff prompt** you can paste
straight into Claude Code (or claude.ai) to start that phase. Do not start a
phase until the previous one's definition of done is fully met.

Current phase: **Phase 0**

---

## Phase 0 — Scaffold & plumbing

**Goal:** an empty but correctly wired project: app runs, database connects,
worker connects to Redis, CI-style checks pass.

**Build:**
- Next.js app (App Router, TypeScript strict, Tailwind, pnpm) + shadcn/ui init
- Drizzle set up against Supabase; first migration enables the `vector` extension
- `docker-compose.yml` with Redis; BullMQ queue + a no-op worker that logs jobs
- `.env.example`, ESLint, `typecheck` script, Vitest with one passing dummy test
- Folder skeleton exactly as in CLAUDE.md

**Definition of done:**
- `pnpm dev` shows a placeholder homepage
- `pnpm db:migrate` runs against Supabase without errors
- `pnpm worker` starts and processes a test job
- `pnpm lint && pnpm typecheck && pnpm test` all pass

**Kickoff prompt:**
> Read CLAUDE.md and docs/ROADMAP.md. We are starting Phase 0. Plan the scaffold
> first (list files and commands), confirm with me, then implement it. Check the
> latest Next.js, Drizzle, and BullMQ docs before picking versions or APIs.

---

## Phase 1 — Repo ingestion pipeline

**Goal:** paste a GitHub URL → repo is cloned and its file inventory lands in
the database, with live job status in the UI.

**Build:**
- POST `/api/repos` (Zod-validated) creates a `repos` row + enqueues an index job
- Worker: clone with simple-git into a temp dir → walk files (respect
  .gitignore via the `ignore` package; skip binaries, node_modules, lockfiles,
  secret files per CLAUDE.md) → insert `files` rows with language + content hash
- Job status updates (`cloning` → `parsing` → `done`/`failed`) + cleanup of temp dir
- UI: form to submit a repo, list of repos, polling status badge with progress

**Definition of done:**
- Indexing a small public repo (e.g. a starter template) produces correct
  `files` rows and ends in `done`
- A bad URL fails gracefully with the error visible in the UI
- Repo size cap enforced; temp dirs cleaned up

**Kickoff prompt:**
> Read CLAUDE.md and docs/ROADMAP.md. Phase 0 is done. We are starting Phase 1.
> Plan the ingestion pipeline end to end before coding, including the DB schema
> changes and how job progress reaches the UI.

---

## Phase 2 — AST parsing & semantic chunking

**Goal:** every indexed file is split into meaningful code units (functions,
classes, methods) instead of raw text.

**Build:**
- web-tree-sitter setup with WASM grammars for TypeScript/JavaScript and Python
  first (add more languages later)
- `parse.ts` + `chunk.ts`: traverse the AST, extract function/class/method
  nodes with symbol name, type, start/end lines; merge tiny siblings, split
  oversized nodes at child boundaries (target roughly 100–1500 tokens per chunk)
- Fallback: non-supported text files get simple paragraph/line chunking
- Store chunks; extract import statements per file into `file_edges`

**Definition of done:**
- Indexing a TS repo yields chunks whose `symbol_name`/line ranges match the
  real code (spot-check 10 chunks by hand)
- Unit tests cover: a normal function, a class with methods, a huge function,
  an empty file

**Kickoff prompt:**
> Read CLAUDE.md and docs/ROADMAP.md. We are starting Phase 2. Check the latest
> web-tree-sitter docs and grammar loading approach first, then plan the
> chunking algorithm and tests before implementing.

---

## Phase 3 — Embeddings + semantic search

**Goal:** "Where is the payment logic?" returns the right functions, ranked.

**Build:**
- `embed.ts`: batch chunks (≤128/request) to Voyage `voyage-code-3` at 1024
  dims, with retry + backoff; write to `chunks.embedding`
- Migration: HNSW index on the embedding column (cosine)
- POST `/api/repos/[id]/search`: embed the query (input_type "query") → top-k
  by cosine similarity
- Minimal search UI: query box → ranked results showing symbol, file path,
  line range, code snippet

**Definition of done:**
- On a real repo, 8 out of 10 hand-written "where is X" questions return the
  correct file in the top 5 results
- Re-indexing skips unchanged files via content hash (no wasted embedding spend)

**Kickoff prompt:**
> Read CLAUDE.md and docs/ROADMAP.md. We are starting Phase 3. Verify current
> Voyage AI embedding model names, dimensions, and rate limits in their docs,
> and pgvector HNSW syntax, before planning the implementation.

---

## Phase 4 — Hybrid retrieval + code graph

**Goal:** retrieval that survives exact identifiers AND vague natural language,
plus a queryable dependency graph.

**Build:**
- Keyword search: generated `tsvector` column + GIN index; `keyword.ts`
- `hybrid.ts`: run vector + keyword search in parallel, merge with Reciprocal
  Rank Fusion (RRF)
- `expand.ts`: for top hits, pull sibling chunks from the same file and chunks
  from files connected via `file_edges` (1 hop)
- `/api/repos/[id]/graph`: returns nodes + edges for the repo

**Definition of done:**
- Searching an exact function name (e.g. `createCheckoutSession`) ranks it #1
  even when vector search alone misses it
- Graph endpoint returns correct import edges for a known repo (spot-check)

**Kickoff prompt:**
> Read CLAUDE.md and docs/ROADMAP.md. We are starting Phase 4. Explain RRF to me
> in plain language in your plan, then implement hybrid retrieval and the graph
> endpoint.

---

## Phase 5 — Q&A agent with citations (the headline feature)

**Goal:** a streaming chat that answers repo questions, can take multiple
retrieval steps, and cites file:line for every claim.

**Build:**
- `agent/tools.ts`: Claude tools — `search_code(query)`, `read_file(path,
  startLine?, endLine?)`, `list_files(dir?)`, `get_dependencies(path)` — each
  Zod-validated, each capped in output size
- `agent/answer.ts`: Vercel AI SDK + Anthropic provider, tool loop (cap ~8
  steps), system prompt that requires citations like `src/payments/stripe.ts:42`
- Chat UI: streamed responses, citation chips that open a read-only file viewer
  scrolled to the cited lines
- Persist conversations per repo

**Definition of done:**
- "Explain the checkout flow" on a multi-service demo repo produces a correct,
  step-by-step answer citing at least 3 distinct files
- The agent visibly performs multiple tool calls for multi-hop questions
- Hallucination check: asking about a feature the repo doesn't have gets an
  honest "not found in this codebase"

**Kickoff prompt:**
> Read CLAUDE.md and docs/ROADMAP.md. We are starting Phase 5. Check the latest
> Vercel AI SDK docs for tool calling + streaming with the Anthropic provider,
> then plan the tool schemas and agent loop before coding.

---

## Phase 6 — Architecture view & flow explanations

**Goal:** visual understanding, not just text answers.

**Build:**
- Repo "Architecture" tab: dependency graph rendered with Mermaid (folder-level
  grouping) or react-force-graph for large repos
- "Explain this flow" mode: agent answers include a generated Mermaid sequence/
  flow diagram rendered inline
- Auto-generated "Onboarding guide" page per repo (entry points, key modules,
  how data flows), produced by the agent from the index

**Definition of done:**
- Diagram for a known repo matches its real structure
- Flow explanation for one end-to-end feature includes a correct diagram

---

## Phase 7 — Stretch goals (pick 1–2, then ship)

- **MCP server** exposing `search_code` / `get_dependencies`, so Cursor or
  Claude Code can query your index — strong differentiator, talk about it in
  interviews
- **Incremental re-indexing**: GitHub webhook on push → re-index only changed
  files (content-hash diff)
- **Impact analysis**: "what depends on this file?" using reverse graph traversal
- **Deploy**: Vercel (app) + Supabase (DB) + Railway/Render (worker + Redis),
  with a public demo repo pre-indexed

**Definition of done (project):** deployed URL + README with architecture
diagram + 2–3 minute demo video + LinkedIn post.
