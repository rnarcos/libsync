/* eslint-env commonjs, node */

/** @type {import('prettier').Config} */
export default {
  // Web-specific configuration (React, HTML, CSS)
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
  printWidth: 80,

  // JSX specific
  jsxSingleQuote: false,

  // HTML specific
  htmlWhitespaceSensitivity: 'css',

  // Language-specific overrides for web projects
  overrides: [
    {
      files: '*.{css,scss,less}',
      options: {
        singleQuote: false,
      },
    },
    {
      files: '*.html',
      options: {
        printWidth: 120,
      },
    },
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
  ],
};
