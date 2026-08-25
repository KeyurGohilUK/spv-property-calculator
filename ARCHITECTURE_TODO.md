# Architecture and standards TODO

This list records the August 2026 HTML5, accessibility and duplication audit. Work through the items in order and keep each refactor covered by regression tests.

## High priority

- [x] Consolidate account and workspace-sync behaviour.
  - [x] Extract one shared property-and-expense workspace sync engine.
  - [x] Replace the separate home and secondary-page account controllers with one shared account component.
- [x] Create one shared app shell for the header, connection state, account/install controls, primary navigation and App Menu.
  - [x] Render primary navigation from one shared component.
  - [x] Move header, account/install controls and App Menu into the shared shell.
- [x] Remove nested interactive controls from clickable property and expense cards.
- [x] Add a shared accessible-dialog helper for labels, close controls, backdrop clicks, initial focus and focus restoration.

## Maintainability

- [x] Share active and archived property-card rendering, including the cost breakdown.
- [x] Make Forecast use the shared property storage and calculation modules.
- [x] Extract common currency, date, percentage, numeric parsing and HTML-escaping utilities.
- [x] Split the global stylesheet into tokens, base, forms, dialogs, app-shell and feature styles without changing the visual design.

## HTML and accessibility quality

- [x] Give each page one clear `h1` while preserving the current visual hierarchy.
- [x] Remove ineffective ARIA attributes and redundant roles.
- [x] Apply `aria-invalid` and connected error descriptions consistently during custom validation.
- [ ] Add automated HTML validation and axe accessibility checks to CI.
