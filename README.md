# WhaleFlow

Live crypto on-chain flow intelligence.

## Repository Layout

- Frontend app is at repository root.
- There is no `backend/` directory.
- Main source code lives in `src/`.

## Local Development

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
```

Output is generated in `dist/`.

## Deployment

- GitHub Pages deploy is handled by `.github/workflows/deploy-pages.yml`.
- The workflow builds from repo root and uploads `dist/`.
