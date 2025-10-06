# Build Command

Build library packages using tsup with intelligent configuration and package.json management.

## Usage

```bash
libsync build [options]
```

## Options

- `-p, --path <path>` - Package path to build (default: current directory)
- `--skip-validation` - Skip project structure validation
- `--verbose` - Enable verbose logging

## Description

The build command compiles your library using tsup, automatically managing package.json fields and generating proper exports for both development and production environments.

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

### Default Tsup Configuration

If no tsup.config.js is found, uses sensible defaults:

```javascript
{
  entry: ['src/**/*.{ts,js}'], // All source files
  format: ['cjs', 'esm'],      // Dual format
  dts: true,                   // Generate declarations
  splitting: true,             // Code splitting
  sourcemap: true,             // Source maps
  clean: false,                // Handled by CLI
  outDir: 'dist'              // Temporary, moved to cjs/esm
}
```

### Custom Configuration

You can override defaults with tsup.config.js:

```javascript
export default {
  entry: ['src/index.ts'],
  format: ['esm'], // ESM only
  dts: true,
  external: ['react'], // External dependencies
  esbuildOptions(options) {
    options.banner = {
      js: '"use client";', // React Server Components
    };
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
- Consider using `external` in tsup.config.js for large dependencies
