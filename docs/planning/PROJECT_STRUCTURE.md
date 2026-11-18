# Project structure

Runtime implementations live under `src/`, feature styles under `styles/features/`, Cloudflare Worker code under `workers/`, and Supabase Edge Functions under `supabase/functions/`.

Cross-page browser integrations are split between `src/services/` for platform/data behaviour and `src/components/` for shared controls. Database changes remain immutable numbered scripts under `database/migrations/`, with the same final schema folded into `database/bootstrap/`.

The small JavaScript and stylesheet files retained at the repository root are compatibility entry points, not duplicate implementations. Older installed PWA releases have cached asset manifests that still request those exact URLs. Removing a compatibility entry would make their all-or-nothing update download fail with “Could not download updates.”

Compatibility files should therefore contain only an `export`, `import`, or CSS `@import` that forwards to the canonical file. New production imports and page references must always use the canonical folder path.

The main files intentionally retained at the root are the static site entry documents and deployment metadata, including `index.html`, `styles.css`, `service-worker.js`, `manifest.json`, `release.json`, and `package.json`. The ordered classic boot scripts `cloud.js` and `supabase-config.js` remain root-level until they can be converted without introducing an authentication startup race for older installed pages.

Use `withBlockingLoader(message, operation)` from `src/components/blocking-loader.js` when users must wait for a finite async operation before continuing. It returns the operation result or propagates its error and keeps the overlay open while any blocking operation is pending. The home entry point uses it for startup, sign-in, workspace access and the initial workspace sync. Wrap policy lookups separately from the acknowledgement prompt so users can respond as soon as the lookup finishes.
