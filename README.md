<p align="center">
  <img src="public/dms.png" alt="Triflare logo" width="100">
</p>

# Intro to OriginChats

> A fast, offline-capable Preact-based real-time chat client for the Rotur / OriginChats network.

## Key points

- Preact + TypeScript + Vite
- Progressive Web App (service worker via vite-plugin-pwa)
- WebSocket-based real-time messaging and OriginFS integration

## Quick start

1. Install Node 18 or later
2. `npm install`
3. run `npm run dev`

## Common scripts

- `npm run dev` &mdash; start dev server
- `npm run dev-local` &mdash; host dev server on network
- `npm run build` &mdash; typecheck and build
- `npm run preview` &mdash; preview the production build
- `npm run lint` &mdash; ESLint (auto-fix)
- `npm run typecheck` &mdash; tsc --noEmit
- `npm run deploy` &mdash; build and publish to gh-pages (if desired)

## Development notes

- Source: src/
- Uses CSS modules and typed-css-modules for typings
- Vite aliases: @ -> /src
- PWA: custom service worker in src/sw.ts (injectManifest)
- Auth: token is read from URL or IndexedDB; the app validates token with Rotur API

## Contributing

Please read CONTRIBUTING.md and CODE_OF_CONDUCT.md for guidelines on filing issues and pull requests. Use the provided issue and PR templates under `.github/ISSUE_TEMPLATE` and `.github/PULL_REQUEST_TEMPLATE`.
