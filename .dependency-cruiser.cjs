// Architectural boundaries (spec §2.1). Paths are matched with a leading `(^|/)` so the same
// rules apply to the negative-test fixtures under tooling/fixtures/boundaries.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'core-is-self-contained',
      comment: 'The rules library may not depend on any other workspace package.',
      severity: 'error',
      from: { path: '(^|/)packages/core/src/' },
      to: { path: '(^|/)(apps/|packages/(?!core/))' },
    },
    {
      name: 'core-no-node-builtins',
      comment: 'Core must run unchanged in browsers: no Node built-in modules.',
      severity: 'error',
      from: { path: '(^|/)packages/core/src/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'renderers-not-into-apps',
      severity: 'error',
      from: { path: '(^|/)packages/' },
      to: { path: '(^|/)apps/' },
    },
    {
      name: 'web-uses-core-entry-only',
      comment: 'The app imports @mulligan/core through its public entry point only.',
      severity: 'error',
      from: { path: '(^|/)apps/web/src/' },
      to: { path: '(^|/)packages/core/src/(?!index\\.ts$)' },
    },
    {
      name: 'web-core-runtime-via-bridge',
      comment:
        'Runtime imports of @mulligan/core live in core-bridge/ (and the render worker); elsewhere only types.',
      severity: 'error',
      from: { path: '(^|/)apps/web/src/', pathNot: '(^|/)apps/web/src/(core-bridge|render)/' },
      to: { path: '(^|/)packages/core/src/', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(node_modules|dist|coverage)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'default'],
      extensions: ['.ts', '.tsx', '.js', '.json'],
    },
    preserveSymlinks: false,
  },
};
