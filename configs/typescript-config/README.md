# @mtndev/typescript-config

TypeScript configuration presets for mtndev monorepo projects.

## Installation

```bash
pnpm add -D @mtndev/typescript-config
```

## Configurations

### `root.json`

Base configuration for the monorepo root. Includes all common TypeScript settings.

**Usage:**

```json
{
  "extends": "@mtndev/typescript-config/root.json"
}
```

**Settings:**

- Target: ES2022
- Module: Node16
- Strict type checking enabled
- Node.js types included

### `base.json`

Extends `root.json` with minimal overrides. Use for TypeScript-only packages.

**Usage:**

```json
{
  "extends": "@mtndev/typescript-config/base.json",
  "include": ["src"]
}
```

### `js.json`

Extends `root.json` with JavaScript support (`allowJs` and `checkJs` enabled). Use for packages that include JavaScript files.

**Usage:**

```json
{
  "extends": "@mtndev/typescript-config/js.json",
  "include": ["src"]
}
```

### `react.json`

Configuration for React and React Native projects using modern bundlers.

**Usage:**

```json
{
  "extends": "@mtndev/typescript-config/react.json",
  "include": ["src/**/*"]
}
```

**Settings:**

- Module: Preserve (for modern bundlers)
- Module Resolution: Bundler
- JSX: react-native
- Includes custom type extensions

### `internal-package.json`

For internal packages that need to emit TypeScript declaration files.

**Usage:**

```json
{
  "extends": "@mtndev/typescript-config/internal-package.json"
}
```

## Type Extensions

This package includes common type extensions for:

- Image files (`.png`, `.svg`, `.jpg`, `.jpeg`, `.webp`)
- Node.js environment variables

To use type extensions in React/React Native projects:

```json
{
  "extends": "@mtndev/typescript-config/react"
}
```

## When to Use Each Config

| Config                  | Use Case                                              |
| ----------------------- | ----------------------------------------------------- |
| `root.json`             | Monorepo root tsconfig                                |
| `base.json`             | TypeScript-only packages (config packages, utilities) |
| `js.json`               | Packages with JavaScript files                        |
| `react.json`            | React/React Native packages (apps, components)        |
| `internal-package.json` | Packages that emit .d.ts files                        |

## License

MIT
