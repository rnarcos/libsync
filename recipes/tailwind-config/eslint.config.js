/** @type {import('eslint').Linter.Config[]} */
export default [
  // Global ignores
  {
    ignores: [
      // Build outputs
      '*.cjs',
      'cjs/**',
      'esm/**',
      'dist/**',
      // Cache directories
      '.cache/**',
      '.turbo/**',
      'node_modules/**',
    ],
  },
  // Base configuration for JavaScript files
  {
    files: ['src/**/*.{js,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // General JavaScript rules
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];
