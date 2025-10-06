# @libsync/eslint-config

ESLint configuration for libsync projects.

## Installation

```bash
npm install --save-dev @libsync/eslint-config eslint
```

## Usage

### Base Configuration

For general JavaScript/Node.js projects:

```js
// .eslintrc.cjs
module.exports = {
  extends: ['@libsync/eslint-config/base'],
};
```

### Node.js Configuration

For Node.js applications and CLI tools:

```js
// .eslintrc.cjs
module.exports = {
  extends: ['@libsync/eslint-config/node'],
};
```

### TypeScript Configuration

For TypeScript projects:

```js
// .eslintrc.cjs
module.exports = {
  extends: ['@libsync/eslint-config/typescript'],
  parserOptions: {
    project: './tsconfig.json',
  },
};
```

### React Configuration

For React projects:

```js
// .eslintrc.cjs
module.exports = {
  extends: ['@libsync/eslint-config/react'],
};
```

For TypeScript + React:

```js
// .eslintrc.cjs
module.exports = {
  extends: ['@libsync/eslint-config/typescript', '@libsync/eslint-config/react'],
  parserOptions: {
    project: './tsconfig.json',
  },
};
```

## Configurations

- **base**: General JavaScript rules with import ordering
- **node**: Node.js specific rules (allows console, process.exit, etc.)
- **typescript**: TypeScript-specific rules and type checking
- **react**: React and JSX rules with accessibility checks

## Peer Dependencies

Make sure to install the required peer dependencies for your use case:

- `eslint` (required)
- `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` (for TypeScript)
- `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y` (for React)

## License

MIT
