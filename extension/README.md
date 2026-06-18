# CodeAtlas for VS Code

Ask your indexed GitHub repositories questions without leaving the editor. Answers stream in with `path:line` citations you can **click to jump straight to the code**.

This extension is a thin client over a running [CodeAtlas](../README.md) server — all the indexing, retrieval, and the AI agent live there. The extension just talks to its HTTP API.

## Requirements

- A running CodeAtlas server (`pnpm dev` in the repo root — defaults to `http://localhost:3000`).
- At least one repository indexed in that server.

## Setup

1. Install the extension (see *Development* below to run it from source).
2. Set the server URL if it isn't the default: **Settings → Extensions → CodeAtlas → Server Url**.
3. Run **CodeAtlas: Select indexed repository** from the Command Palette and pick the repo to query. If your workspace's git remote matches an indexed repo, it's pre-selected.

## Usage

| Command | What it does |
|---|---|
| **CodeAtlas: Ask the codebase** | Opens the chat panel. Ask anything; click any citation to open that file at that line. |
| **CodeAtlas: Ask about selection** | Right-click selected code → asks a question with that code as context. |
| **CodeAtlas: Select indexed repository** | Choose which indexed repo to query. |

## Settings

| Setting | Default | Description |
|---|---|---|
| `codeatlas.serverUrl` | `http://localhost:3000` | Base URL of your CodeAtlas server. |
| `codeatlas.repoId` | `""` | UUID of the repo to query. Set it via the *Select indexed repository* command. |

## Development

```bash
cd extension
npm install
npm run compile      # or: npm run watch
```

Then press **F5** in VS Code to launch an Extension Development Host with the extension loaded.

## How it works

```
VS Code panel ──HTTP──▶ POST /api/repos/:id/ask  (plain-text stream)
                         └─ reuses the same agent + tools as the web app
```

The `/ask` endpoint returns a raw text stream, so the extension consumes it with a plain `fetch` reader — no AI SDK needed on the client.

## License

MIT
