/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  // Global ignores
  {
    ignores: [
      // Build outputs
      '**/cjs/**',
      '**/esm/**',
      '**/dist/**',
      // Cache directories
      '**/.cache/**',
      '**/.turbo/**',
      '**/node_modules/**',
      // Verdaccio storage
      '**/storage/**',
      // Config files
      '*.config.js',
      '*.config.cjs',
      '*.config.mjs',
      // Generated files
      '**/.verdaccio/**',
    ],
  },
  // Base configuration for all JavaScript files
  {
    files: ['**/*.{js,cjs,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    plugins: {
      turbo: require('eslint-plugin-turbo'),
    },
    rules: {
      'turbo/no-undeclared-env-vars': 'warn',
      // CLI-specific overrides
      'no-process-exit': 'off', // CLI tools need process.exit
      'no-unused-vars': 'warn', // Make unused vars warnings for CLI development
      'no-useless-catch': 'off', // Allow catch blocks for clarity in CLI tools
    },
  },
  // CLI-specific configuration
  {
    files: ['packages/cli/src/**/*.{js,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    plugins: {
      turbo: require('eslint-plugin-turbo'),
    },
    rules: {
      'no-console': 'off', // CLI tools need console output
      'no-process-exit': 'off', // CLI tools need process.exit
      'no-unused-vars': 'warn', // Make unused vars warnings
      'no-useless-catch': 'off', // Allow catch blocks for clarity in CLI tools
      'turbo/no-undeclared-env-vars': 'warn',
    },
  },
];
