# Contributing to CodeAtlas

Thanks for your interest in contributing! This document covers how to get the project running locally and the conventions to follow when submitting changes.

---

## Getting started

1. Fork the repo and clone your fork
2. Follow the **Quick start** steps in [README.md](README.md) to get the app running locally
3. Create a feature branch: `git checkout -b feat/your-feature-name`

---

## Development workflow

```bash
pnpm dev          # start the Next.js dev server
pnpm worker       # start the background indexing worker (separate terminal)
pnpm test         # run all tests
pnpm lint         # ESLint
pnpm typecheck    # TypeScript strict check
```

All four must pass before opening a PR. The CI check will fail otherwise.

---

## Commit style

We use [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | When to use |
|--------|-------------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `chore:` | Tooling, deps, config |
| `docs:` | Documentation only |
| `test:` | Tests only |
| `refactor:` | Code change with no behaviour change |

Keep commits small and focused — one logical change per commit.

---

## Pull request checklist

- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] New behaviour has a test (or explain why one isn't needed)
- [ ] PR description explains *what* changed and *why*

---

## Project conventions

- **No `any`** — use `unknown` + type narrowing
- **No raw SQL in app code** — only inside `drizzle/` migration files
- **No fixed-size text chunking** — chunk by AST nodes only (`src/server/indexer/chunk.ts`)
- **No secrets in code** — all secrets go in `.env.local`, never committed
- Business logic lives in `src/server/**`, never in components or route handlers
- Validate everything at system boundaries with Zod

---

## Reporting bugs

Open an issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your Node.js version and OS

---

## Questions

Open a GitHub Discussion or reach out via the email in the README.
