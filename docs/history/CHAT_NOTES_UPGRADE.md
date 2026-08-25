# Chat-style Notes UI upgrade

This update changes only the Notes user interface. No Supabase schema migration is required if you already installed the `property_notes` table from v1.7.0.

## Changes

- Notes are displayed as a chat conversation.
- Your own messages are aligned to the right; other users are aligned to the left.
- Every message still shows the saved author display name and timestamp.
- Conversation order is oldest to newest and automatically scrolls to the latest message.
- The `Save Note` text button is replaced by a round paper-plane Send icon with tooltip/accessibility label.
- Refresh is also a compact icon.
- `Ctrl+Enter` / `Cmd+Enter` sends a note on desktop; Enter alone still creates a new line.
- Existing Supabase note data and RLS policies are unchanged.

## GitHub Pages update

Replace these files in your existing repository:

- `index.html`
- `app.js`
- `styles.css`
- `service-worker.js`

Keep your existing `supabase-config.js`.

The PWA cache version is `v1.7.1-chat-notes`.
