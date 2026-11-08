# Shared icon architecture

App interface SVG icons live in `src/components/shared-icons.js`.

- Add or update a named path in the `ICONS` registry; do not copy SVG path data into pages or feature modules.
- Use `getIconSvg(name)` in JavaScript templates and render functions.
- Use an empty SVG with `data-shared-icon="name"` in static HTML. Call `hydrateSharedIcons` from the page shell/module after that markup exists.
- Keep sizing and color in the existing component CSS. The registry supplies the shared 24 by 24 view box, accessible decorative attributes, and consistent stroke defaults.
- Keep data visualizations (such as charts) in their feature modules; they are not reusable interface icons.

This keeps repeated icon geometry in one place while allowing each component to control its own layout and size.
