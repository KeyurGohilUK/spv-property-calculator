# Task Management Feature

## Overview

A shared task list for SPV workspace members. Users can create tasks, optionally link them to a property, assign them to workspace members, set due dates, and update status. All tasks sync through the existing cloud workspace and respect the three-role access model.

---

## Data model

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Same generation pattern as expenses and properties |
| `title` | string | Required |
| `description` | string | Optional, freeform |
| `status` | `todo` \| `in-progress` \| `done` | |
| `createdBy` | user ID | Set at creation, never changed |
| `assignedTo` | user ID | Optional — any active workspace member |
| `dueDate` | ISO date string | Optional |
| `scope` | `company` \| `property` | Mirrors the expense scope pattern |
| `propertyId` | string | Required when scope is `property` |
| `createdAt` | ISO timestamp | |
| `updatedAt` | ISO timestamp | Updated on every change |
| `deletedAt` | ISO timestamp | Soft delete, consistent with all other record types |
| `_cloudDirty` | boolean | Standard offline sync marker |
| `_cloudRevision` | number | Standard conflict-protection marker |

---

## Role permissions

| Action | Viewer | Editor | Admin |
|---|---|---|---|
| Read all tasks | yes | yes | yes |
| Create a task | no | yes | yes |
| Update own task | no | yes | yes |
| Update any task | no | no | yes |
| Delete any task | no | no | yes |

RLS uses the existing `is_workspace_member()`, `is_workspace_editor()`, and `is_workspace_admin()` functions — no new database roles required.

---

## Value-adding extensions

### 1. Property-linked tasks (highest value)
Attach tasks to a specific property so users managing multiple deals can see "all open tasks for 14 Acacia Drive." Filtering by property is the single most useful addition for multi-property SPV management.

### 2. Checklist templates
Pre-built task lists applied in one tap, then customised:

- **UK property purchase** — offer accepted, solicitor instructed, searches ordered, survey arranged, mortgage offer received, exchange, completion
- **SPV company setup** — incorporate company, open business bank account, register with HMRC, appoint accountant
- **Annual compliance** — confirmation statement, annual accounts, corporation tax return, property income report
- **Pre-offer due diligence** — title check, flood/mining/planning searches, comparable sales review

Templates populate tasks rather than being locked sequences, so users can remove or reorder steps per deal.

### 3. Push notification reminders for due dates
The app already has VAPID push infrastructure and a Supabase Edge Function pattern (viewing reminders). A scheduled edge function can query tasks due soon and fire notifications — this is the second use of existing infrastructure with no new platform concepts.

### 4. Task discussion and status history
Each saved task includes a shared **Discussion** chat for workspace members, plus the separate status-history log. Discussion reuses the same shared chat component as Property Notes so message bubbles, composer behaviour, mobile sizing, author treatment, and accessibility stay consistent across the app. Task discussion persistence remains offline-first and continues to sync through the task-comment storage/service layer.

### 5. Expense prompt on task completion
When a task is marked done, offer a lightweight prompt: "Was there a cost? Log an expense." Bridges the task list and expense tracker at the natural moment — common for solicitor fees, survey costs, and filing fees.

### 6. Filtering and grouping
Essential once tasks span multiple properties and assignees:

- By property (or company-wide only)
- By status
- By assigned member
- By due date (overdue / due this week / upcoming)

### 7. Integration with viewing reminders
A completed viewing reminder could auto-suggest a follow-up task ("Make offer", "Arrange second viewing", "Request lease pack"), connecting two existing features without new infrastructure.

---

## Architecture

The feature follows the expense module pattern exactly.

### New source files
- `src/features/tasks/task-storage.js` — localStorage CRUD, soft delete, `_cloudDirty` flag
- `src/features/tasks/task-cloud-sync.js` — mirrors `expense-cloud-sync.js`
- `src/features/tasks/tasks.js` — page rendering and interaction
- `src/features/tasks/task-card.js` — shared card component
- `tasks/index.html` — route entry point

### Database
- New `tasks` table as **migration Update 17** plus equivalent update to `database/bootstrap/00 - Bootstrap Complete Schema.sql`
- RLS using existing helper functions

### Sync
- `workspace-sync.js` extended to include tasks alongside properties and expenses

### Push reminders (due dates extension only)
- New Supabase Edge Function under `supabase/functions/task-reminders/` if push reminders are added; no new platform services otherwise

---

## Suggested build order

| Phase | Scope | Outcome |
|---|---|---|
| 1 | Core tasks — CRUD, status, offline storage, cloud sync, role permissions | Feature is usable |
| 2 | Property linking and filtering | Useful for multi-property management |
| 3 | Task assignment to workspace members | Enables delegation |
| 4 | Due dates and push reminders | Reuses existing infra, high perceived value |
| 5 | Checklist templates | Reduces setup friction for new deals |
| 6 | Expense prompt on task completion | Connects the two ledgers |
| 7 | Status history log | Audit trail for shared workspaces |

Phases 1–3 form a coherent first pull request. Phases 4–7 are independent follow-ups that each stand alone.
