# CodeAtlas

> Ask any public GitHub repository a question. Get an AI-powered answer with cited code references.

CodeAtlas indexes a GitHub repo, maps every file and symbol into a vector database, then lets you ask natural-language questions about it. The AI runs a tool-calling loop — searching code, reading files, tracing import edges — and returns an answer with exact file:line citations. Mermaid architecture diagrams and auto-generated onboarding guides are built in.

**Stack:** Next.js 15 · Supabase + pgvector · Google Gemini 2.5 Flash · BullMQ · tree-sitter · Tailwind v4

**Cost:** $0 — one free Google AI Studio key powers everything (LLM + embeddings).

---

## Features

| | |
|---|---|
| **Natural language Q&A** | Ask in plain English; the AI searches, reads, and cites exact file:line references |
| **Hybrid retrieval** | Vector similarity + full-text search merged via Reciprocal Rank Fusion |
| **Import graph** | Traces dependency edges; ask what would break if you changed a file |
| **Architecture diagrams** | Auto-generated Mermaid graphs of file-level import relationships |
| **Onboarding guide** | AI-written plain-English summary of entry points, key abstractions, and how to run it |
| **PR review** | Paste a PR URL; the agent traces the blast radius of each changed file and writes a cited review |
| **Auto re-index** | A GitHub webhook re-indexes a repo on every push to its default branch (only changed files re-embed) |
| **MCP server** | Exposes all tools as an MCP server — query repos directly from Claude Desktop |
| **VS Code extension** | Ask the codebase from inside the editor; click `file:line` citations to jump to the code (`extension/`) |

---

## Quick start (local)

### Prerequisites

- Node.js 20+, pnpm 9+
- Docker (for Redis)
- A free [Google AI Studio](https://aistudio.google.com/apikey) API key
- A [Supabase](https://supabase.com) project with the connection string (free tier works)

### 1. Clone & install

```bash
git clone https://github.com/hemangpatel0710/codeatlas
cd codeatlas
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in:

```env
# Supabase Postgres — use the "pooled" connection string (port 6543)
DATABASE_URL=postgres://postgres.xxxx:password@aws-0-region.pooler.supabase.com:6543/postgres

# Local Redis (Docker). In production use your Railway / Upstash URL.
REDIS_URL=redis://localhost:6379

# Google AI Studio — free tier, no credit card required
# https://aistudio.google.com/apikey
GOOGLE_GENERATIVE_AI_API_KEY=AIza...

# Optional: higher GitHub clone rate limits
GITHUB_TOKEN=ghp_...
```

### 3. Apply database migrations

```bash
pnpm db:migrate
```

This enables `pgvector`, creates all tables, and builds the HNSW index on Supabase.

### 4. Start everything

Open **three** terminals:

```bash
# Terminal 1 — Redis
docker compose up -d

# Terminal 2 — Next.js dev server
pnpm dev

# Terminal 3 — background indexing worker
pnpm worker
```

Open [http://localhost:3000](http://localhost:3000), paste a GitHub URL, and hit **Index repo**.

---

## How indexing works

```
GitHub URL
  → pre-flight size check (GitHub API, reject > 100 MB)
  → git clone into a temp dir
  → walk files (skip binaries, node_modules, .git, lockfiles, secret files)
  → parse with web-tree-sitter (TypeScript / JavaScript / Python)
  → chunk by AST nodes — functions, classes, methods (never fixed-size splits)
  → extract import edges between files
  → embed chunks in batches via gemini-embedding-001 (1024-dim Matryoshka)
  → store chunks + vectors in Supabase pgvector
  → build tsvector full-text index (GIN)
  → clean up temp dir
```

Query pipeline:

```
question
  → hybrid search (pgvector cosine + websearch_to_tsquery, merged via RRF)
  → graph expansion (1-hop import neighbors of top results)
  → Gemini 2.5 Flash agent loop (up to 8 tool steps)
      tools: search_code · read_file · list_files · get_dependencies · get_impact
  → streamed answer with file:line citations
```

---

## Project structure

```
src/
  app/                     Next.js App Router pages + API routes
    api/repos/             REST endpoints (CRUD, job status, chat, search)
  components/              React components (shadcn/ui based)
  lib/                     Shared helpers (embeddings, mermaid, language detect)
  server/
    db/                    Drizzle schema + client
    indexer/               clone · walk · parse · chunk · embed · ingest
    retrieval/             vector · keyword · hybrid · expand · impact
    agent/                 tools · system-prompt · answer · guide
    queue/                 BullMQ queues + worker
  mcp/server.ts            MCP server (stdio transport)
drizzle/                   Generated SQL migrations
```

---

## Deploy

Three free-tier services, ~45 minutes total:

| Component | Service |
|---|---|
| Next.js app | Vercel |
| Postgres + pgvector | Supabase |
| Redis + worker | Railway |


---

## MCP server (Claude Desktop integration)

Once the app is running locally, add this to your Claude Desktop config
(`%APPDATA%\Claude\claude_desktop_config.json` on Windows, `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "codeatlas": {
      "command": "pnpm",
      "args": ["--silent", "-C", "D:/Project/codeatlas", "mcp"]
    }
  }
}
```

Restart Claude Desktop. You can now ask Claude:

- *"List my CodeAtlas repos."*
- *"Search the vercel/next.js repo for where routing is handled."*
- *"What imports auth/session.ts in the colinhacks/zod repo?"*

---

## VS Code extension

A thin client lives in [`extension/`](extension/README.md). It talks to the
`POST /api/repos/:id/ask` endpoint (a plain-text stream) so you can ask the
indexed codebase questions without leaving the editor — and click any
`file:line` citation to open that file at that line.

```bash
cd extension
npm install
npm run compile     # then press F5 in VS Code to launch the dev host
```

Set `codeatlas.serverUrl` (default `http://localhost:3000`), then run
**CodeAtlas: Select indexed repository** to choose which repo to query.

---

## Development

```bash
pnpm dev          # Next.js dev server (localhost:3000)
pnpm worker       # Indexing worker
pnpm test         # Vitest (84 tests)
pnpm typecheck    # tsc --noEmit
pnpm lint         # ESLint
pnpm db:studio    # Drizzle Studio — browse the DB visually
pnpm db:generate  # Generate a new migration from schema changes
pnpm db:migrate   # Apply pending migrations
```

All of `lint`, `typecheck`, `test`, and `build` must pass before any commit.

---

## Environment variables reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase pooled Postgres URL (port 6543) |
| `REDIS_URL` | Yes | Redis connection URL |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Yes | Google AI Studio key — powers LLM + embeddings |
| `GITHUB_TOKEN` | No | GitHub PAT — higher clone rate limits |

---

## License

MIT
