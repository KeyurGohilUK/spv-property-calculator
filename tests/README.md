# Tests

The automated checks are kept outside the deployable application files.

## Node regression checks

Files named `test-*.mjs` cover calculations, storage, synchronisation, HTML structure, release policy and other focused regressions. Run the complete ordered suite from the repository root:

```bash
npm test
```

`test-style-source.mjs` is a shared helper and is not executed directly by the package script.

## Browser journeys

The `e2e/` directory contains Playwright journeys. Shared mocks and browser helpers belong in `e2e/support/`.

```bash
npm run test:e2e
```

Keep production modules outside this directory. Tests should resolve application files relative to the repository root and must not require application source to be copied into the test tree.
