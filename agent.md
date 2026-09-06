# AI Agent Instructions

This file defines the mandatory working rules for any AI agent making changes to the SPV Property Calculator repository. Read it in full before analysing, editing, committing, or opening a pull request.

## Product purpose

SPV Property Calculator is a mobile-first Progressive Web App (PWA) for UK limited company / SPV property investors. It covers:

- **Property calculator** — estimate cash required to buy through a UK SPV (SDLT, deposit, stamp duty, refurbishment, etc.).
- **Expenses tracker** — log and categorise SPV costs; attach receipt photos uploaded to Cloudflare R2.
- **Property forecast** — project rent, cash flow, mortgage balance, equity, and scenarios over 5–25 years.
- **BRRR calculator** — pre-purchase offer analysis using the Buy / Refurbish / Rent / Refinance method; works backwards from GDV comparables to find the maximum offer price that fully recycles capital.
- **Task manager** — workspace task tracking with statuses, due dates, assignees, status history, templates, cloud sync, push reminders, and role-based permissions.
- **Admin / user management** — approve workspace accounts and assign roles.
- **Push notifications** — note-save reminders, viewing-date reminders, and daily task-due reminders delivered through Supabase Edge Functions.
- **Shared workspace** — authenticated users share data through Supabase cloud sync with offline-first localStorage as the source of truth.

The calculator is a planning tool, not tax, legal, mortgage, or investment advice. Do not weaken or remove applicable disclaimers.

Preserve the app's core behaviour:

- Offline-first operation with immediate local persistence.
- Optional authenticated cloud sharing through Supabase.
- Reliable installation and updating as a PWA.
- Clean GitHub Pages routes that work on a custom domain and from a repository subdirectory.
- Clear UK property terminology and transparent calculations.
- A safe anonymous landing experience that exposes only login and public/legal information, not authenticated features.

This app is designed to be used as planning tool, not tax, legal, mortgage, or investment advice. Do not weaken or remove applicable disclaimers.

## Technology stack

This is intentionally a lightweight, framework-free web application.

| Area | Technology |
| --- | --- |
| UI | Semantic HTML5, modern CSS, vanilla JavaScript |
| JavaScript | Native ES modules; project package type is `module` |
| App model | Multi-page PWA with shared app-shell modules and feature modules |
| Hosting | Static GitHub Pages |
| Offline support | Service worker, Cache API, web app manifest, localStorage |
| Cloud / auth | Supabase JavaScript client, email/password auth, PostgreSQL/RLS-backed workspace data |
| Edge functions | Deno / Supabase Edge Functions (`supabase/functions/`) |
| Receipt storage | Cloudflare Worker and R2 integration (`workers/receipt/`) |
| Push notifications | Web Push API, VAPID keys, Supabase delivery tables |
| Unit / integration tests | Node.js 22 scripts using built-in `node:assert` |
| Browser tests | Playwright on desktop Chromium and mobile WebKit/iPhone |
| Accessibility checks | HTML Validate and axe-core via Playwright |
| CI | GitHub Actions |

Do not introduce a framework, bundler, CSS library, state-management library, or runtime dependency without explicit approval and a documented reason.

## Route entry points

Each page is a standalone HTML file using `<base href="../">` so all asset paths resolve from the repository root regardless of nesting depth.

| Route | File | Purpose |
| --- | --- | --- |
| `/` | `index.html` | Property calculator (home) |
| `/expenses/` | `expenses/index.html` | Expense tracker |
| `/forecast/` | `forecast/index.html` | Long-term property forecast |
| `/brrr/` | `brrr/index.html` | BRRR scenario calculator (pre-purchase) |
| `/tasks/` | `tasks/index.html` | Task manager |
| `/admin/users/` | `admin/users/index.html` | User and role management |

`brrr/` uses `data-active-page="forecast"` so the Forecast nav item stays highlighted — BRRR is part of the forecast feature set.

## Repository architecture

Keep code in the existing responsibility-based structure:

- `src/app/` — application bootstrap (`app.js`), app shell (`app-shell.js`), and primary navigation (`primary-navigation.js`).
- `src/features/<feature>/` — feature-specific behaviour. Current features: `properties`, `expenses`, `forecast`, `tasks`, `users`.
- `src/components/` — reusable UI components: `admin-menu.js`, `dialog-helper.js`, `help-guide.js`, `install-component.js`, `notification-settings.js`, `secondary-page-header.js`, `sync-status.js`, `theme.js`, `update-notifier.js`.
- `src/services/` — auth, cloud, sync, access, receipts: `access-gate.js`, `account-controller.js`, `policy-acceptance.js`, `push-subscription.js`, `receipt-cloud.js`, `workspace-sync.js`.
- `src/utils/` — small stateless utilities: `format-utils.js`, `scope-filter.js`, `validation.js`.
- `src/config/` — configuration modules: `tax-config.js`.
- `styles/tokens.css` — all design tokens. Feature files consume tokens; they never define raw colour values.
- `styles/features/` — feature-level CSS files that are individually linked from each page that needs them.
- `tests/test-*.mjs` — Node regression, architecture, and integration tests. Run with `npm test`.
- `tests/e2e/` — Playwright end-to-end journeys.
- `database/bootstrap/00 - Bootstrap Complete Schema.sql` — complete schema for a fresh Supabase installation.
- `database/migrations/` — ordered migration files for existing installations (currently through Update 20).
- `supabase/functions/` — Deno edge functions: `note-push`, `viewing-reminders`, `task-reminders`.
- `docs/setup/`, `docs/planning/`, `docs/history/` — current setup docs, active planning, and completed historical material.
- `app-assets.json` — cache manifest for the service worker. Every new page, script, or stylesheet must be registered here.

Do not add duplicate root-level implementations or compatibility copies for retired URLs. Keep clean directory routes with trailing slashes and relative asset paths.

## Feature inventory

### Properties (home page)

Core calculator. Saves property objects to `localStorage` with `_cloudDirty` / `_cloudRevision` for optimistic-lock cloud sync. Supports archiving, restoration, permanent deletion (admin only), and property notes. Each property can trigger a viewing-reminder push notification.

### Expenses

Log SPV costs with amount, date, category, property association, and receipt attachment. Receipts are compressed client-side and uploaded to Cloudflare R2 via a signed worker endpoint. Expense records sync via `upsert_expense_if_current` RPC.

### Forecast

Long-term projection tied to a saved property. Reads purchase numbers from `getPurchaseNumbers(property)` and projects value, rent, mortgage balance, cash flow, equity, and cumulative return. Includes:

- **Scenario grid** — conservative / expected / optimistic variants.
- **Stress test** — cash flow at 7 mortgage-rate points (3–9 %).
- **Refinance / exit split card** — potential cash release and net sale proceeds.
- **Advanced metrics** — injected by `forecast-advanced.js`: return breakdown, rent stress grid, refurbishment analysis.
- **BRRR companion card** — visible link to `brrr/` so users can run pre-purchase analysis.

### BRRR calculator

Standalone pre-purchase tool (`brrr/index.html` + `src/features/forecast/forecast-brrr.js`). No cloud dependency — all calculations run locally. Key logic:

- `calcBrrr(offerPrice, inputs)` — pure function returning the full waterfall: deposit, purchase costs, refurbishment budget, carrying cost during void, ICR stress-test cap, LTV cap, effective refinance, cash released, capital left in deal, ongoing monthly cash flow, gross yield.
- `calcBreakeven(inputs)` — analytical closed-form solution: `P = (R − refurb) / (K + L)` where `R = min(GDV × refinanceLtv, ICR limit)`.
- Sensitivity table — up to 30 offer price rows; click a row to see the full waterfall. Rows where `capitalLeft ≤ 0` are marked ✓ (fully recycled).
- ICR advisory — when ICR is the binding constraint (not LTV), a note explains the lever to pull.
- Assumptions persist to `localStorage` under key `spv-property-calculator.brrr.v1`.

### Task manager

Full workspace task system. Key properties per task: `id`, `title`, `description`, `status` (`todo` / `in-progress` / `done`), `scope` (`company` / `property`), `propertyId`, `dueDate`, `assignedTo` (uuid), `deletedAt`, `_cloudDirty`, `_cloudRevision`.

**Role-based permissions:**
- `viewer` — read-only; cannot create tasks or change status.
- `editor` — can create tasks and update status on tasks they created; cannot edit tasks created by others.
- `admin` — full edit access to all tasks.

**Status history** — every status change is appended to `task_events` (INSERT + SELECT only; no UPDATE/DELETE). Displayed in the task form as a timestamped history list.

**Templates** — predefined checklists in `task-templates.js`: UK Property Purchase, SPV Company Setup, Viewing Checklist, Remortgage Checklist, Property Management. Applied in bulk from the template picker dialog.

**Assignee picker** — populated from `list_active_members()` RPC. Assignee filter available in the filter panel.

**Viewing suggestion dialog** — when a task whose title matches `/\b(viewing|property[\s-]visit|site[\s-]visit|inspect)/i` is marked done, a suggestion dialog prompts the user to create a follow-up: "Make offer", "Arrange second viewing", or "Request lease pack".

**Filtering / grouping** — filter by property, status, due date (overdue / this week / upcoming / no date), and assignee; group by status.

**Push reminders** — `supabase/functions/task-reminders/` edge function runs daily at 08:00 (scheduled via Supabase dashboard, POST with `x-task-reminder-secret` header). Delivers to `assigned_to` user if set, otherwise all active members. Deduplication via `task_reminder_deliveries` table (`unique(task_id, user_id, sent_on)`). A pg_cron job purges records older than 30 days every Sunday.

### Admin / user management

Accessible only to admins. Lists workspace members, their roles, activity, and policy acceptance status. Allows role changes (`viewer` / `editor` / `admin`) and activation / deactivation.

## Data model and Supabase conventions

### Tables

| Table | Purpose |
| --- | --- |
| `workspace_members` | Role and active state per user |
| `push_subscriptions` | Web Push endpoint + key pairs per user |
| `policy_acceptances` | Per-user policy version acceptance |
| `properties` | Property records with JSONB data blob |
| `viewing_reminder_deliveries` | Dedup log for viewing-date push notifications |
| `property_notes` | Append-only notes per property |
| `property_deletions` | Permanent deletion log |
| `expenses` | Expense records |
| `tasks` | Task records with `assigned_to uuid` |
| `task_events` | Append-only status change history |
| `task_reminder_deliveries` | Dedup log for daily task due-date push notifications |

### Security model

All writes go through `SECURITY DEFINER` PL/pgSQL functions — they bypass RLS so the function body can enforce role logic, then return control to the caller. Direct client `INSERT` / `UPDATE` on most tables is blocked. Helper functions `public.is_workspace_editor()` and `public.is_workspace_admin()` gate role checks.

### Key RPCs

| Function | Purpose |
| --- | --- |
| `upsert_property_if_current` | Optimistic-lock property upsert |
| `upsert_expense_if_current` | Optimistic-lock expense upsert |
| `upsert_task_if_current` | 11-param optimistic-lock task upsert (includes `p_assigned_to`) |
| `insert_task_event` | Append-only status history insert |
| `list_active_members` | Returns id + display_name for active workspace members |
| `list_workspace_users` | Admin-only full member list |
| `set_workspace_user_access` | Admin-only role and active flag setter |

### Optimistic-lock conflict pattern

Every synced record carries `_cloudRevision` (integer). On upsert, the RPC checks that the current DB revision matches; if not, it returns a conflict signal (no error thrown). The client detects the mismatch and marks the local record as conflicted rather than silently overwriting. Do not bypass this pattern.

### Mandatory Supabase schema-change rule

Every change to the Supabase/database structure is incomplete unless the same pull request includes **both**:

1. A new, correctly ordered migration file in `database/migrations/` that safely upgrades every existing Supabase deployment.
2. The equivalent update to `database/bootstrap/00 - Bootstrap Complete Schema.sql` so a newly created project starts with the complete current structure.

This is mandatory for tables, columns, constraints, indexes, functions, triggers, policies, RLS, grants, storage configuration, and any other database object. Never update only the migration or only the bootstrap. Never defer either half to a later pull request.

## Edge functions

All three edge functions live in `supabase/functions/` and are configured in `supabase/config.toml` with `verify_jwt = false` (they use their own secrets instead).

| Function | Trigger | Purpose |
| --- | --- | --- |
| `note-push` | Property save event from client | Push notification when a colleague saves a property note |
| `viewing-reminders` | pg_cron daily | Notify assigned/all-members about upcoming property viewings |
| `task-reminders` | Supabase dashboard cron daily 08:00 | Notify about tasks due today or overdue within 7 days |

`viewing-reminders` and `task-reminders` each have a companion `schedule.js` file with pure helper functions (`todayInLondon`, `addDays`, `findDueTasks`/`findViewingTasks`) that are unit-tested in `tests/test-tasks.mjs` / `tests/test-navigation.mjs`.

Push deduplication follows the same pattern in both reminder functions: INSERT a claim row with a unique constraint on `(task_id, user_id, sent_on)`, catch error code `23505` (duplicate = already sent today), update to `delivered` on success, delete the claim row on failure so tomorrow can retry.

## Shared utilities and patterns

### `src/utils/scope-filter.js`

`populateScopeFilterOptions(formSelect, filterSelect, properties, staticFilterCount)` — synchronises a task/expense form's property `<select>` and its filter `<select>` from the live properties list. Always call this when the property list changes.

### `src/components/sync-status.js`

`renderSyncStatus(element, state)` — updates a `<span role="status">` with the current cloud sync state. Tasks, expenses, and properties each have their own sync status element.

### `src/components/dialog-helper.js`

`setupDialog(dialogElement, options)` — standardised keyboard, backdrop, and focus management for `<dialog>` elements. Always use this for new dialogs rather than writing bespoke open/close logic.

### `src/services/access-gate.js`

`getWorkspaceAccess()` / `renderAccessState(user)` — check and render the user's role. Gate all writes behind `canEdit` (editor or admin). Gate admin actions behind `canAdmin`.

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
- Dialogs must have an accessible title, keyboard operation, focus management, backdrop/escape handling, and a reachable close action. Use `dialog-helper.js`.
- Dynamic status messages must remain understandable to assistive technology.
- Do not convey meaning using colour alone.
- Preserve visible keyboard focus and logical tab order.
- Touch targets must be comfortable on mobile and must not overlap.
- Run HTML validation and relevant axe/Playwright coverage for UI changes.

### JavaScript

- Use native ES modules and explicit imports/exports.
- Keep calculation and transformation logic pure wherever practical so production code and Node tests exercise the same implementation.
- Use `const` by default and `let` only when reassignment is necessary.
- Avoid new global variables. Existing global integration points (`window.SPVCloud`, `window.SPVTheme`, `window.SPVHelpGuide`) should be extended only when the architecture requires it.
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
- When a page needs new feature-level styles, create a separate `styles/features/<name>.css` file and link it only from that page's HTML. Do not add page-specific rules to `styles.css`.
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
- Add every new page HTML file, feature script, and stylesheet to `app-assets.json` so the service worker caches it.
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

Also run the most focused relevant test(s) while developing:

- **Logic, persistence, sync, structure** → `tests/test-*.mjs` (Node).
- **UI regression, routing, accessibility** → relevant Playwright spec in `tests/e2e/`.
- **New HTML** → `npm run test:html` (HTML Validate + axe).

Current Node test files:

| File | Coverage |
| --- | --- |
| `tests/test-tasks.mjs` | Task storage, cloud sync, event history, reminder schedule helpers, assignedTo, suggestion dialog |
| `tests/test-navigation.mjs` | Primary navigation rendering and active-page marking |
| `tests/test-project-structure.mjs` | Required directories and organised module files |
| `tests/test-style-architecture.mjs` | CSS token usage and import conventions |

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
- [ ] Every Supabase structure change includes both an ordered migration for existing deployments and the equivalent bootstrap update for new deployments; documentation and tests are updated too.
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
