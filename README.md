# Transportation Map

A Figma plugin for creating and visualizing transit/transportation network maps. Build stations, lines, and connections directly inside Figma.

## Prerequisites

- [Node.js](https://nodejs.org/) (includes npm)
- Figma desktop app

## Setup

```sh
npm install
```

## Development

```sh
npm run watch
```

Webpack will rebuild automatically on file changes. Output goes to `dist/`.

To load the plugin in Figma:
1. Open Figma desktop
2. Go to **Plugins > Development > Import plugin from manifest...**
3. Select `manifest.json` from this directory

## Build

```sh
npm run build
```

Produces two bundles in `dist/`:
- `code.js` — plugin logic (runs in Figma document context)
- `ui.html` — plugin panel UI (React, inlined into a single HTML file)

## Lint

```sh
npm run lint        # check
npm run lint:fix    # auto-fix
```

## Project Structure

```
src/
├── common/       # Shared types and plugin↔UI message definitions
├── plugin/       # Plugin code (Figma API, MVC architecture)
│   ├── models/   # Data structures (stations, lines, roads)
│   ├── views/    # Figma node rendering
│   ├── controllers/  # Business logic
│   └── figmls/   # .figml templates for station visuals
└── ui/           # React UI (plugin panel)
```

Import boundaries are enforced by ESLint: `plugin/` and `ui/` code cannot import from each other; both may import from `common/`.

## Path Alias

`@/` resolves to `src/` in both TypeScript and Webpack.
