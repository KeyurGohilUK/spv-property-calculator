# AI Agent Instructions

This file defines the mandatory working rules for any AI agent making changes to the SPV Property Calculator repository. Read it before analysing, editing, committing, or opening a pull request.

## Product purpose

SPV Property Calculator is a mobile-first Progressive Web App (PWA) for estimating the cash required to buy residential investment property through a UK Limited Company/SPV. It also supports property tracking, expenses, forecasts, shared workspace data, viewing reminders, and administrative user management.

Preserve the app's core behaviour:

- Offline-first operation with immediate local persistence.
- Optional authenticated cloud sharing through Supabase.
- Reliable installation and updating as a PWA.
- Clean GitHub Pages routes that work on a custom domain and from a repository subdirectory.
- Clear UK property terminology and transparent calculations.
- A safe anonymous landing experience that exposes only login and public/legal information, not authenticated features.

The calculator is a planning tool, not tax, legal, mortgage, or investment advice. Do not weaken or remove applicable disclaimers.

## Technology stack

This is intentionally a lightweight, framework-free web application.

| Area | Technology |
| --- | --- |
| UI | Semantic HTML5, modern CSS, vanilla JavaScript |
| JavaScript | Native ES modules; project package type is `module` |
| App model | Multi-page PWA with shared app-shell modules and feature modules |
| Hosting | Static GitHub Pages |
| Offline support | Service worker, Cache API, web app manifest, localStorage |
| Cloud/auth | Supabase JavaScript client, email/password authentication, PostgreSQL/RLS-backed workspace data |
| Receipt storage | Cloudflare Worker and R2 integration |
| Notifications | Web Push using VAPID and Supabase delivery data |
| Unit/integration tests | Node.js 22 scripts using built-in assertions |
| Browser tests | Playwright on desktop Chromium and mobile WebKit/iPhone |
| Accessibility checks | HTML Validate and axe-core through Playwright |
| CI | GitHub Actions |

Do not introduce a framework, bundler, CSS library, state-management library, or runtime dependency without explicit approval and a documented reason.

## Repository architecture

Keep code in the existing responsibility-based structure:

- `index.html`, `expenses/index.html`, `forecast/index.html`, and `admin/users/index.html` are route entry points.
- `src/app/` contains application bootstrap, app shell, and primary navigation.
- `src/features/<feature>/` contains feature-specific behaviour.
- `src/components/` contains reusable UI components and rendering behaviour.
- `src/services/` contains auth, cloud, sync, access, and other external/service orchestration.
- `src/utils/` contains small stateless shared utilities.
- `src/config/` contains configuration modules such as tax configuration.
- `styles/tokens.css` owns design tokens. Other CSS files consume those tokens.
- `styles/features/` contains feature-level styles.
- `tests/test-*.mjs` contains unit, integration, architecture, accessibility, and regression tests.
- `tests/e2e/` contains user-facing Playwright journeys.
- `database/bootstrap/` represents a fresh database install; `database/migrations/` contains ordered changes for existing installations.
- `docs/setup/`, `docs/planning/`, and `docs/history/` contain current setup, active planning, and completed historical material.

Do not add duplicate root-level implementations or compatibility copies for retired URLs. Keep clean directory routes with trailing slashes and relative asset paths.

## Coding standards

### General

- Inspect the existing implementation and tests before changing code.
- Make the smallest cohesive change that fully solves the request.
- Preserve existing behaviour unless the change explicitly requires altering it.
- Do not perform unrelated refactors in the same pull request.
- Prefer clear, descriptive names over abbreviations.
- Remove dead code created by the change; do not leave commented-out implementations.
- Avoid duplicated logic. When behaviour is used in more than one place, move it to the appropriate shared component, service, utility, or feature module.
- Keep modules focused. UI rendering, domain calculations, persistence, and cloud orchestration must not be unnecessarily mixed.
- Do not add secrets, private keys, Supabase secret/service-role keys, access tokens, or credentials to client code, tests, documentation, commits, or logs.
- Treat all browser and cloud input as untrusted. Validate data and escape user-controlled content before rendering.
- Preserve proprietary notices, legal pages, privacy protections, access controls, and role restrictions.

### HTML and accessibility

- Use valid semantic HTML5 and the correct native element before adding ARIA.
- Maintain one clear page-level heading hierarchy.
- Every form control must have an associated label.
- Every icon-only interactive control must have an accessible name and tooltip/title where the current component convention requires it.
- Buttons perform actions; links navigate.
- Dialogs must have an accessible title, keyboard operation, focus management, backdrop/escape handling, and a reachable close action.
- Dynamic status messages must remain understandable to assistive technology.
- Do not convey meaning using colour alone.
- Preserve visible keyboard focus and logical tab order.
- Touch targets must be comfortable on mobile and must not overlap.
- Run HTML validation and relevant axe/Playwright coverage for UI changes.

### JavaScript

- Use native ES modules and explicit imports/exports.
- Keep calculation and transformation logic pure wherever practical so production code and Node tests exercise the same implementation.
- Use `const` by default and `let` only when reassignment is necessary.
- Avoid new global variables. Existing global integration points should be extended only when the architecture requires them.
- Handle malformed, missing, offline, stale, and unauthorised data safely.
- Do not silently discard local unsynced work.
- Preserve conflict-resolution, archive/restore, permissions, and offline sync semantics.
- Use safe URL parsing and allow only intended protocols.
- Never insert unescaped user content with `innerHTML`.
- Avoid timing-dependent tests and arbitrary sleeps; wait for observable UI or network state.
- Add tests for every bug fix and for meaningful new logic.

### CSS

- Use design tokens from `styles/tokens.css`; do not scatter hard-coded theme colours through feature files.
- Extend the existing CSS layers and import order in `styles.css`.
- Reuse shared components and patterns before creating feature-specific variants.
- Keep selectors scoped and maintainable; avoid `!important` unless an existing, documented cascade constraint makes it unavoidable.
- Prevent horizontal page overflow.
- Respect safe-area insets for installed iPhone PWAs, sticky headers, bottom navigation, dialogs, and fixed actions.
- Test long labels, large values, validation text, empty states, and narrow screens.
- Honour reduced-motion preferences for non-essential animation.

### Data, database, and security

- Local saves must remain immediate; cloud sync may follow when authenticated and online.
- Preserve Row Level Security and least-privilege workspace roles: viewer, editor, and administrator.
- Permanent deletion remains administrator-only and online-only unless explicitly redesigned.
- Schema changes require both the correct ordered migration and an updated bootstrap schema for new installations.
- Database changes must be idempotent where the established migration pattern requires it and must include verification guidance/tests.
- Never expose authenticated features or workspace data on the anonymous landing state.
- Do not assume network availability, notification permission, PWA installation, or cloud configuration.

## Supported UI and platforms

The UI is mobile-first but must remain fully usable at all supported sizes.

- Installed iPhone/iOS PWA in portrait orientation is a primary experience.
- Mobile Safari/WebKit is explicitly supported and covered by Playwright's iPhone project for journeys tagged `@mobile`.
- Desktop Chrome/Chromium is supported and covered by Playwright.
- Responsive browser use on phone, tablet, and desktop must remain functional.
- Standalone PWA and ordinary browser-tab modes must both work.
- Online and offline states must be clear and usable.
- Touch, mouse, and keyboard interaction must be supported where applicable.
- GitHub Pages repository-subdirectory hosting and clean trailing-slash routes must continue working.

Do not use hover as the only way to reveal information or operate a feature. Do not lock essential functionality to one screen size, installation state, input type, or network state.

## Visual language and themes

The established brand is warm cream/beige with brown/copper accents and a polished, calm property-product feel. Preserve this identity rather than introducing unrelated colour systems.

### Light theme

- Use warm cream/beige surfaces, warm neutrals, and the established brown/copper brand accent.
- Maintain strong text and control contrast.
- Prefer subtle depth, borders, and shadows; avoid stark black-and-white styling.
- Cards, dialogs, forms, navigation, empty states, and status components must look like one design system.

### Dark theme

- Provide an intentionally designed warm dark equivalent; do not merely invert the light palette.
- Retain the brand accent while meeting contrast requirements.
- Check text, muted text, icons, fields, selected navigation, totals, status chips, dialogs, and overlays independently.
- Avoid pure black expanses and colours that become muddy or unreadable against dark surfaces.

### Both themes

- All new UI must support light and dark themes in the same pull request.
- Use semantic tokens for background, surface, text, muted text, border, accent, success, warning, and danger states.
- Do not use gold for update availability. Use an established theme colour and ensure it works in both themes.
- Use red only for destructive/danger actions and clear error states.
- Keep icons, border radii, spacing, typography, buttons, cards, forms, sticky actions, and dialogs consistent with existing components.
- Animation should be restrained and useful, with smooth state transitions that do not harm performance or accessibility.
- Verify selected, hover, focus, pressed, disabled, loading, empty, error, offline, synced, and update-available states.

## PWA, caching, routing, and releases

Changes to cached application files must be visible to already-installed PWAs.

- Keep `manifest.json`, `service-worker.js`, and `app-assets.json` consistent.
- Add new required offline assets to the cache manifest.
- Do not break the install flow, Download Updates flow, Check for Update state, or unsaved-change protection.
- Preserve relative URLs and trailing-slash application routes.
- If a cached app file changes, increase the semantic version in `release.json`.
- Use patch for a backwards-compatible fix or small enhancement, minor for a meaningful backwards-compatible feature, and major for an intentionally breaking or substantial product change.
- `release.json` notes must describe only the user-visible changes in that exact release.
- Documentation-only changes that do not alter cached application files do not require a release bump.
- Never edit release checks to bypass a missing version bump.

## Testing requirements

Install dependencies with:

```bash
npm ci
```

Before opening a pull request, run all required checks:

```bash
npm test
npm run test:html
npm run test:e2e
```

Also run the most focused relevant test(s) while developing. For a UI or browser regression, add or update Playwright coverage when stable browser behaviour is involved. For logic, persistence, sync, routing, structure, theme, or accessibility changes, add or update the matching Node regression test.

Do not hand over or open a ready-for-review PR with known failing checks. If a check cannot run locally, state exactly which check, why, and what evidence was used instead; do not claim it passed.

## Mandatory pre-PR checklist

Before opening a pull request, confirm all of the following:

- [ ] The change matches the request and contains no unrelated edits.
- [ ] Existing architecture was followed and duplicated logic/components were not introduced.
- [ ] HTML is semantic and accessibility behaviour was verified.
- [ ] Light and dark themes were both checked for every changed UI state.
- [ ] Mobile/iPhone PWA and desktop layouts were considered and relevant journeys tested.
- [ ] Online, offline, anonymous, authenticated, and role-restricted behaviour was considered where relevant.
- [ ] User input is validated and safely rendered.
- [ ] No secret, privileged key, personal data, or credential was added.
- [ ] Unit/regression tests were added or updated for changed logic and bug fixes.
- [ ] `npm test` passes.
- [ ] `npm run test:html` passes.
- [ ] `npm run test:e2e` passes.
- [ ] Cached assets, PWA update behaviour, and clean routes remain correct.
- [ ] `release.json` was bumped with accurate release-specific notes when cached app files changed.
- [ ] Database bootstrap, migration, documentation, and tests were updated when the schema changed.
- [ ] Documentation was updated when behaviour, setup, architecture, or operational steps changed.
- [ ] The final diff was reviewed for accidental files, debug output, and formatting issues.
- [ ] The PR description explains the problem, solution, test evidence, UI impact, release version (or why no bump is needed), and any deployment/database steps.

## Pull request rules

- Never commit directly to `main`; create a focused branch and open a pull request.
- Keep commits and PRs small, coherent, and clearly named.
- Do not merge while required checks are pending or failing.
- Include screenshots for visible UI changes when practical, covering both themes and relevant mobile/desktop layouts.
- Clearly call out migrations, environment changes, manual setup, security implications, and rollback considerations.
- Do not weaken tests, accessibility checks, release enforcement, branch protection, or security controls to make a PR pass.
- Treat a green CI result as necessary, not sufficient: review the actual diff and user flow before declaring the PR ready.
