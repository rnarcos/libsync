/* eslint-env commonjs, node */

/** @type {import('eslint').Linter.Config} */
export default {
  extends: ['./base.cjs'],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    // Node.js specific rules
    'no-console': 'off', // Console is expected in Node.js applications
    'global-require': 'off',
    'no-process-exit': 'error',
    'no-process-env': 'off',

    // Allow CommonJS in Node.js environments
    '@typescript-eslint/no-var-requires': 'off',

    // Import rules for Node.js
    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: [
          '**/*.test.{js,ts}',
          '**/*.spec.{js,ts}',
          '**/test/**/*',
          '**/tests/**/*',
          '**/__tests__/**/*',
          '**/scripts/**/*',
          '**/build/**/*',
          '**/*.config.*',
          '**/.*rc.*',
        ],
      },
    ],
  },
};
