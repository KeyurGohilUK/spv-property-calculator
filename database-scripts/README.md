# Database scripts

These files are the reproducible source of truth for the app's Supabase/PostgreSQL structure.

## Fresh database or replacement Supabase project

Run **`00 - Bootstrap Complete Schema.sql` once** in the SQL editor. It creates the current base structure, indexes, Row Level Security policies and conflict-safe write functions.

After the bootstrap completes:

1. Create the first Auth user before running the script, so that account becomes the initial workspace administrator.
2. Review `public.workspace_members`.
3. Add approved users by their Auth user ID.
4. Configure the app's new Project URL and Publishable key in `supabase-config.js`.
5. Test sign-in, property sync and access restrictions before switching production.

## Existing database

Run only migrations newer than the last applied update, in number order:

- Update 8 — workspace access control
- Update 9 — property sync conflict protection
- Update 10 — expense tracker schema

All current scripts are designed to be safely rerunnable. Always take a database backup before applying changes to production.

## Portability boundary

The table and function definitions use PostgreSQL SQL. Authentication references `auth.users`, `auth.uid()` and Row Level Security conventions supplied by Supabase. Moving to another Supabase project requires no structural rewrite. Moving to a different PostgreSQL host requires replacing those authentication helpers while keeping the public tables, constraints and indexes.

Receipt binaries should live in object storage. The database stores only receipt metadata and an object path, which avoids coupling the core data model to one file-storage provider.

## Rules for future changes

- Never edit an already-deployed numbered migration.
- Add the next numbered, rerunnable migration.
- Also fold that change into `00 - Bootstrap Complete Schema.sql`.
- Keep destructive data changes separate and clearly labelled.
- Include verification queries at the end of each migration.
