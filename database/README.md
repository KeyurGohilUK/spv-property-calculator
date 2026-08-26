# Database

These files are the reproducible source of truth for the app's Supabase/PostgreSQL structure.

## Directory layout

- `bootstrap/` contains the complete schema for a new or replacement Supabase project.
- `migrations/` contains immutable, ordered changes for an existing database.

Keeping these workflows separate prevents a fresh-install bootstrap from being mistaken for an incremental production migration.

## Fresh database or replacement Supabase project

Run **`bootstrap/00 - Bootstrap Complete Schema.sql` once** in the SQL editor. It creates the current base structure, indexes, Row Level Security policies and conflict-safe write functions.

After the bootstrap completes:

1. Create the first Auth user before running the script, so that account becomes the initial workspace administrator.
2. Review `public.workspace_members`.
3. Sign in as the initial administrator and use **Manage Users** to approve accounts and assign roles.
4. Configure the app's new Project URL and Publishable key in `supabase-config.js`.
5. Test sign-in, property sync and access restrictions before switching production.

## Existing database

Run only migrations newer than the last applied update, in number order:

- Update 8 — workspace access control
- Update 9 — property sync conflict protection
- Update 10 — expense tracker schema
- Update 11 — private Cloudflare R2 receipt references and Worker access grants
- Update 12 — revision-column repair for conflict-safe property and expense sync
- Update 13 — administrator user approval and workspace role management
- Update 14 — per-device Web Push subscriptions for new property notes
- Update 15 — versioned Terms, Privacy Policy and Disclaimer acceptance

All current scripts are designed to be safely rerunnable. Always take a database backup before applying changes to production.

## Portability boundary

The table and function definitions use PostgreSQL SQL. Authentication references `auth.users`, `auth.uid()` and Row Level Security conventions supplied by Supabase. Moving to another Supabase project requires no structural rewrite. Moving to a different PostgreSQL host requires replacing those authentication helpers while keeping the public tables, constraints and indexes.

Receipt binaries live in a private Cloudflare R2 bucket. The database stores only receipt metadata and a private object key in `receipt_object_path`; never store public or expiring presigned URLs. The Worker validates Supabase users and workspace permissions before accessing R2.

## Rules for future changes

The current schema is complete through **Update 15 - Policy Acceptance**.

- Never edit an already-deployed numbered migration.
- Add the next numbered, rerunnable migration.
- Also fold that change into `bootstrap/00 - Bootstrap Complete Schema.sql`.
- Keep destructive data changes separate and clearly labelled.
- Include verification queries at the end of each migration.
