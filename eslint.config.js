import js from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Input-channel and DOM-sink restrictions from spec §10.2 and §10.4. Mulligan accepts content
// only through user gestures and never sends data anywhere, so these APIs have no legitimate use
// in application code.
const bannedGlobals = [
  ['fetch', 'Mulligan makes no network requests (spec §10.2).'],
  ['XMLHttpRequest', 'Mulligan makes no network requests (spec §10.2).'],
  ['WebSocket', 'Mulligan makes no network requests (spec §10.2).'],
  ['EventSource', 'Mulligan makes no network requests (spec §10.2).'],
  ['URLSearchParams', 'Mulligan takes no input from the URL (spec §10.2).'],
].map(([name, message]) => ({ name, message }));

const bannedSyntax = [
  {
    selector: "MemberExpression[property.name=/^(search|hash)$/][object.name='location']",
    message: 'Mulligan takes no input from the URL (spec §10.2).',
  },
  {
    selector: "MemberExpression[property.name=/^(search|hash)$/][object.property.name='location']",
    message: 'Mulligan takes no input from the URL (spec §10.2).',
  },
  {
    selector:
      "CallExpression[callee.property.name='addEventListener'][arguments.0.value='message']",
    message: 'No cross-window messaging (spec §10.2).',
  },
  {
    selector: "AssignmentExpression[left.property.name='onmessage'][left.object.name='window']",
    message: 'No cross-window messaging (spec §10.2).',
  },
  {
    selector: "MemberExpression[object.name='navigator'][property.name='sendBeacon']",
    message: 'Mulligan makes no network requests (spec §10.2).',
  },
  {
    selector: "MemberExpression[object.name='window'][property.name=/^(open|opener)$/]",
    message: 'Mulligan never opens or reads other windows (spec §10.2).',
  },
  {
    selector: "MemberExpression[object.name='navigator'][property.name='serviceWorker']",
    message: 'Mulligan registers no service worker (spec §10.2).',
  },
  {
    selector: 'AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]',
    message: 'Render user content as text only (spec §10.4).',
  },
  {
    selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
    message: 'Render user content as text only (spec §10.4).',
  },
  {
    // document.write only: streaming parsers (htmlparser2's parser.write) are fine.
    selector:
      "CallExpression[callee.object.name='document'][callee.property.name=/^(write|writeln)$/]",
    message: 'Render user content as text only (spec §10.4).',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/',
      '**/dist/',
      'coverage/',
      'playwright-report/',
      'test-results/',
      'tooling/fixtures/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-globals': ['error', ...bannedGlobals],
      'no-restricted-syntax': ['error', ...bannedSyntax],
    },
  },
  {
    files: ['**/*.mjs', '**/*.config.{js,ts}', 'eslint.config.js', '.dependency-cruiser.cjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['.dependency-cruiser.cjs'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    ...react.configs.flat.recommended,
    ...react.configs.flat['jsx-runtime'],
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    languageOptions: { globals: globals.browser },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'react/no-danger': 'error',
      'react/prop-types': 'off',
    },
  },
  {
    files: ['**/test/**/*.{ts,tsx}', 'tooling/**/*.ts'],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/no-focused-tests': 'error',
      'vitest/no-disabled-tests': 'error',
      'vitest/expect-expect': 'off',
      // Vitest accepts a failure message as the second argument.
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
    },
  },
  prettier,
);
