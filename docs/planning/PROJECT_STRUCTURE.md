# Project structure

Runtime implementations live under `src/`, feature styles under `styles/features/`, and deployable Worker code under `workers/`.

The small JavaScript and stylesheet files retained at the repository root are compatibility entry points, not duplicate implementations. Older installed PWA releases have cached asset manifests that still request those exact URLs. Removing a compatibility entry would make their all-or-nothing update download fail with “Could not download updates.”

Compatibility files should therefore contain only an `export`, `import`, or CSS `@import` that forwards to the canonical file. New production imports and page references must always use the canonical folder path.

The main files intentionally retained at the root are the static site entry documents and deployment metadata, including `index.html`, `styles.css`, `service-worker.js`, `manifest.json`, `release.json`, and `package.json`. The ordered classic boot scripts `cloud.js` and `supabase-config.js` remain root-level until they can be converted without introducing an authentication startup race for older installed pages.
