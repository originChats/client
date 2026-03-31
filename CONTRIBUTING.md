# Contributing to OriginChats

Thanks for your interest in contributing! This guide explains how to set up a development environment and the preferred workflow for contributions.

Getting set up
1. Fork the repository and create a feature branch from `main`.
2. Install dependencies: `npm install`.
3. Run the dev server: `npm run dev` or `npm run dev-local` to expose on the network.

Code style and checks
- TypeScript typings are enforced; run `npm run typecheck`.
- ESLint + Prettier are used. Run `npm run lint` and address any issues before opening a PR.
- For CSS module typings run `npm run css:types` if modifying styles.

Workflow
- Create a descriptive branch name: `feature/<short-description>` or `fix/<short-description>`.
- Keep commits small and focused. Use conventional commit messages where practical.
- Open a PR against `main`. Fill the PR template.
- Add tests or manual verification steps for behavioral changes.

Design & architecture notes
- UI is built with Preact + signals. Prefer signals for global state when appropriate.
- Component styling uses CSS modules located next to components.
- Reusable utilities live under `src/lib/`.

Testing your changes
- Manual testing is the primary workflow. Use `npm run build` and `npm run preview` to validate a production build locally.

Reporting issues
- Use the issue templates provided. Provide reproduction steps, browser, OS, and logs if available.

Thank you for contributing!