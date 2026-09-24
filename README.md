# Etna

_Exploded views, erupting parts._

Browse a dealer parts-catalog dump in the browser: vehicles, catalogs,
illustrations with hotspots, part details, graphic navigation, vehicle data, equipment retrofits,
paint and trim, search by part number, text, engine code or VIN.

The build is one self-contained HTML file (`dist/index.html`). Open it, choose the dump folder, and
everything is read locally in the browser tab; nothing is uploaded.

Hosted at **https://complex256.github.io/etna/**, published from `main` by
`.github/workflows/pages.yml`. You can also download the page and open it from disk.

## Setup

The toolchain is [Vite+](https://viteplus.dev) (`vp`): it manages the Node version (`.node-version`)
and pnpm, and runs the dev server, build, tests, lint (Oxlint) and format (Oxfmt).

```sh
curl -fsSL https://vite.plus | bash     # once; then open a new shell
make install
```

## Everyday use

| Command      | What it does                                                                 |
| ------------ | ---------------------------------------------------------------------------- |
| `make dev`   | Dev server with hot reload that opens `DUMP` directly                        |
| `make build` | Type-check and build `dist/index.html`                                       |
| `make serve` | Build and serve it on localhost (the folder picker needs localhost or HTTPS) |
| `make test`  | Format, lint and type checks, then unit tests (the dump tests use `DUMP`)    |
| `make e2e`   | Browser tests (Playwright) against `DUMP`                                    |

`DUMP` is a brand folder, the one containing `Data1`/`Data2`, `Bilder` and `minis`:
`make dev DUMP=/path/to/dump/<brand>` (or export `DUMP` once in your shell).

## Layout

- `src/lib/` — the data layer, no UI: table and record decoding (`format/`), the dump model,
  lookups, the vehicle-data rules, VIN decoding, illustrations.
- `src/urlState.ts`, `src/router.ts`, `src/routes.ts` — the app state and its URLs
  (`#/USA/catalog/849/plate/85771?model=…`).
- `src/stores/` — Pinia stores: the open dump, vehicle data, the parts list.
- `src/views/` — one component per page; `src/components/` — shared parts (illustration stage,
  thumbnails and hover preview, part drawer, vehicle-data dialog, …).
- `plugins/dump-server.ts` — dev only: serves `DUMP` at `/__dump/` with HTTP range support.
- `tests/unit/` (Vitest via `vp test`) and `tests/e2e/` (Playwright).
