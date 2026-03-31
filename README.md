# OriginChats (originchats)

A fast, offline-capable Preact-based real-time chat client for the Rotur / OriginChats network.

Key points
- Preact + TypeScript + Vite
- Progressive Web App (service worker via vite-plugin-pwa)
- WebSocket-based real-time messaging and OriginFS integration

Quick start
1. Node 18+ installed
2. npm install
3. npm run dev

Common scripts
- npm run dev — start dev server
- npm run dev-local — host dev server on network
- npm run build — typecheck and build
- npm run preview — preview the production build
- npm run lint — ESLint (auto-fix)
- npm run typecheck — tsc --noEmit
- npm run deploy — build and publish to gh-pages (if desired)

Development notes
- Source: src/
- Uses CSS modules and typed-css-modules for typings
- Vite aliases: @ -> /src
- PWA: custom service worker in src/sw.ts (injectManifest)
- Auth: token is read from URL or IndexedDB; the app validates token with Rotur API

Contributing
Please read CONTRIBUTING.md and CODE_OF_CONDUCT.md for guidelines on filing issues and pull requests. Use the provided issue and PR templates under .github/ISSUE_TEMPLATE and .github/PULL_REQUEST_TEMPLATE.

Maintainers
- Mistium

License
No license file detected in the repository. Check project owner for licensing details.
