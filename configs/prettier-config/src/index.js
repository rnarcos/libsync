/* eslint-env commonjs, node */

/** @type {import('prettier').Config} */
export default {
  // Base formatting rules
  trailingComma: 'all',
  useTabs: false,
  tabWidth: 2,
  semi: true,
  singleQuote: true,
  quoteProps: 'as-needed',
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: 'always',
  endOfLine: 'lf',

  // Print width and wrapping
  printWidth: 80,
  proseWrap: 'preserve',

  // Language-specific overrides
  overrides: [
    {
      files: '*.md',
      options: {
        proseWrap: 'always',
        printWidth: 100,
      },
    },
    {
      files: '*.json',
      options: {
        printWidth: 120,
      },
    },
    {
      files: '*.{yml,yaml}',
      options: {
        singleQuote: false,
      },
    },
  ],
};
