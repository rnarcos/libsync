/** @type {import('eslint').Linter.Config[]} */
export default [
  // Global ignores
  {
    ignores: [
      // Build outputs
      'cjs/**',
      'esm/**',
      'dist/**',
      // Storybook
      'storybook-static/**',
      '.storybook/public/**',
      // Cache directories
      '.cache/**',
      '.turbo/**',
      'node_modules/**',
      // Generated files
      'tailwind.css',
      '.storybook/global.css',
    ],
  },
  // JavaScript files
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
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
  // TypeScript files
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: (await import('@typescript-eslint/parser')).default,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      // General rules
      'no-console': 'warn',
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      // TypeScript handles these
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
  // Storybook specific configuration
  {
    files: ['**/*.stories.{ts,tsx,js,jsx}', '.storybook/**/*.{ts,tsx,js,jsx}'],
    rules: {
      // Storybook stories can have more relaxed rules
      'no-console': 'off',
    },
  },
];
