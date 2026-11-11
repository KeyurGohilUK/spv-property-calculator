import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

// Start with the authentication/onboarding boundary; migrate other modules in focused PRs.
export default [
  {
    ignores: [
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      'vendor/**',
    ],
  },
  {
    files: [
      'src/services/access-gate.js',
      'src/services/account-controller.js',
      'src/services/policy-acceptance.js',
      'src/components/help-guide.js',
      'src/components/secondary-page-header.js',
      'tests/e2e/onboarding-login.spec.js',
      'tests/e2e/support/cloud-mock.js',
      'tests/test-onboarding-access.mjs',
      'eslint.config.js',
    ],
    ...js.configs.recommended,
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  prettier,
];
