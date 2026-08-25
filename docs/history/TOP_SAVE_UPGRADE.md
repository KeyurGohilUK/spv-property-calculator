# Top Save Icon UI Update

This update moves the Property Purchase Details save action into the editor toolbar.

## Changes
- Save Property is now a compact save icon in the top-right corner.
- The icon includes a tooltip/accessibility label: `Save property`.
- The previous full-width Save Property button at the bottom of the summary has been removed.
- Existing save validation, local storage, Supabase sync, notes, archive, and permanent-delete behavior is unchanged.
- On small iPhone screens the mode label is hidden to leave more room for Back and Save.

## Deploy
Replace these files in the existing GitHub Pages repository:
- `index.html`
- `styles.css`
- `service-worker.js`

No Supabase SQL or configuration changes are required.
