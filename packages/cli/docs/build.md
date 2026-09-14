# Build Command

Build library packages using tsdown with intelligent configuration and package.json management.

## Usage

```bash
libsync build [options]
```

## Options

- `-p, --path <path>` - Package path to build (default: current directory)
- `--skip-validation` - Skip project structure validation
- `--verbose` - Enable verbose logging

## Description

The build command compiles your library using tsdown, automatically managing package.json fields and generating proper exports for both development and production environments.

## Environment Variables

### `LIBSYNC_FREEZE_PACKAGE_JSON`

When set to a truthy value (`1` or `true`, case-insensitive), the build command compiles and emits your `esm`/`cjs` artifacts as usual but **leaves the root `package.json` untouched** — the production swap in the final step is skipped, and so is the revert-to-development step on failure.

```bash
LIBSYNC_FREEZE_PACKAGE_JSON=1 libsync build
```

**Why:** In monorepos using Turbo remote caching, `package.json` is part of the hashed task inputs. Mutating it on every build (development → production paths) busts the cache even when the published package contents are unchanged. Freezing `package.json` keeps the cache warm during development and CI build runs.

**Scope:** Only the root `package.json` is frozen. Compiled artifacts, proxy folders, and `.gitignore` are still generated normally.

**Publishing:** To publish, run the build **without** this variable set — the production swap then happens as usual, updating `package.json` and the published artifacts. The explicit [`package-json`](./package-json.md) command is exempt from this flag and always writes.

## What It Does

### 1. Project Validation

- Validates package.json structure and required fields
- Checks TypeScript configuration (tsconfig.json, tsconfig.build.json)
- Verifies source directory structure
- Provides helpful warnings and suggestions for common issues

### 2. Build Artifact Cleanup

- Removes existing build directories (cjs/, esm/, dist/)
- Cleans generated proxy packages
- Updates .gitignore with build directories

### 3. TypeScript Compilation

- Runs TypeScript compiler for type declaration generation
- Uses tsconfig.build.json if available, falls back to tsconfig.json
- Generates .d.ts files for both CJS and ESM builds

### 4. Tsup Bundling

- Builds CommonJS format (.cjs files) in `cjs/` directory
- Builds ES Module format (.js files) in `esm/` directory
- Generates source maps and handles code splitting
- Creates optimized chunks for better loading performance

### 5. Package.json Management

The build process intelligently updates your package.json:

#### Main/Module/Types Fields

```json
{
  "main": "cjs/index.cjs",
  "module": "esm/index.js",
  "types": "esm/index.d.ts"
}
```

#### Conditional Exports

Generates comprehensive exports with proper conditions:

```json
{
  "exports": {
    ".": {
      "types": "./esm/index.d.ts",
      "import": "./esm/index.js",
      "require": "./cjs/index.cjs"
    },
    "./utils": {
      "types": "./esm/utils/index.d.ts",
      "import": "./esm/utils/index.js",
      "require": "./cjs/utils/index.cjs"
    }
  }
}
```

#### Binary Updates

Updates bin fields to point to built files:

```json
{
  "bin": {
    "my-cli": "./cjs/cli.cjs"
  }
}
```

### 6. Proxy Package Generation

Creates proxy packages for subpath exports, enabling clean imports:

```javascript
// Instead of: import { utils } from 'my-lib/esm/utils'
// You can use: import { utils } from 'my-lib/utils'
```

## Export Field Behavior

### Types Field Inclusion

The `types` field in conditional exports is only included if your package.json originally contains a root-level `types` field:

```json
// If your package.json has "types": "...", exports will include types
{
  "exports": {
    ".": {
      "types": "./esm/index.d.ts",  // ✅ Included
      "import": "./esm/index.js",
      "require": "./cjs/index.cjs"
    }
  }
}

// If no root "types" field, exports won't include types
{
  "exports": {
    ".": {
      "import": "./esm/index.js",   // ✅ Types omitted
      "require": "./cjs/index.cjs"
    }
  }
}
```

### Import/Require Conditions

- `import` condition is included if `module` field exists in package.json
- `require` condition is included if `main` field exists in package.json
- This allows for CJS-only, ESM-only, or dual-format packages

### Binary Filtering

Files specified in the `bin` field are automatically excluded from exports:

```json
{
  "bin": {
    "my-cli": "./src/cli.js"
  },
  "exports": {
    // cli.js is NOT included in exports
    ".": { ... },
    "./utils": { ... }
  }
}
```

## Build Configuration

### Default Tsdown Configuration

For each format (cjs, esm) libsync runs tsdown with:

```javascript
{
  entry: {...},                // All source files (JSON sources are copied as-is instead)
  format: 'cjs' | 'esm',       // One build per format
  outDir: 'cjs' | 'esm',       // Per-format output directory
  clean: false,                // Handled by the CLI
  dts: false,                  // Declarations come from the tsc step
  config: false,               // No tsdown config auto-discovery
  outExtensions: ...,          // .cjs for cjs, .js for esm
  outputOptions: { chunkFileNames: '__chunks/[hash].cjs' | '__chunks/[hash].js' },
}
```

`entry`, `format`, `outDir`, `watch`, `clean`, `dts`, and `config` are always controlled by libsync and cannot be overridden.

### Custom Configuration

You can pass extra tsdown options via `commands.build.bundler` in `libsync.config.mjs` (standalone `tsdown.config.*` / `tsup.config.*` files are ignored):

```javascript
export default {
  commands: {
    build: {
      bundler: {
        external: ['react'], // External dependencies
        outputOptions: {
          banner: '"use client";', // React Server Components
        },
      },
    },
  },
};
```

## Examples

### Basic Library Build

```bash
# Build current directory
libsync build

# Build specific package
libsync build --path ./packages/my-lib

# Build with verbose output
libsync build --verbose
```

### Monorepo Build

```bash
# Build all packages (run from root)
pnpm run build  # Uses turbo to build all packages

# Build single package
cd packages/my-lib && libsync build
```

### CI/CD Integration

```bash
# Skip validation in CI (faster builds)
libsync build --skip-validation

# Build with full logging for debugging
libsync build --verbose
```

## Troubleshooting

### Common Issues

**Missing tsconfig.build.json**

```
⚠️ tsconfig.build.json not found - build process may not work properly
💡 Consider creating tsconfig.build.json that extends tsconfig.json
```

**Invalid package.json**

```
❌ Package.json validation failed:
   main: Expected string, received undefined
💡 Add "main" field pointing to your entry file
```

**Build Failures**

- Ensure all dependencies are installed
- Check TypeScript configuration is valid
- Verify source files exist and are accessible
- Use `--verbose` flag for detailed error information

### Performance Tips

- Use `--skip-validation` in CI environments
- Ensure tsconfig.build.json excludes test files
- Consider using `external` in `commands.build.bundler` for large dependencies
