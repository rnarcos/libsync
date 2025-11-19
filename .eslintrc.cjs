/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: ['@libsync/eslint-config/base'],
  ignorePatterns: [
    // Build outputs
    '**/cjs/**',
    '**/esm/**',
    '**/storybook-static/**',
    // Cache directories
    '**/.cache/**',
    '**/.turbo/**',
    '**/node_modules/**',
  ],
  plugins: ['turbo'],
  rules: {
    'turbo/no-undeclared-env-vars': 'warn',
  },
  overrides: [
    {
      // TypeScript files
      files: ['*.ts', '*.tsx', '*.mts', '*.cts'],
      extends: ['@libsync/eslint-config/typescript'],
      parserOptions: {
        rootDir: __dirname,
        project: true,
      },
    },
  ],
};
