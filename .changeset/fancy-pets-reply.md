---
'libsync': major
---

## Major Changes

### Build Configuration Refactor

The build system now uses `libsync.config.mjs` as the source of truth for determining what formats to build, instead of inferring from `package.json` fields.

**Breaking Changes:**

- **New Configuration Schema**: Added `commands.build.formats` to `libsync.config.mjs`:
  ```js
  export default {
    commands: {
      build: {
        formats: {
          cjs: 'cjs',        // string path or false to disable
          esm: 'esm',        // string path or false to disable
          types: true        // boolean to enable/disable TypeScript types
        }
      }
    }
  }
  ```

- **Source of Truth Change**: Previously, the presence of `main` and `module` fields in `package.json` determined what to build. Now, the build configuration in `libsync.config.mjs` is the source of truth. The `main`/`module`/`types` fields are still maintained for package consumers but are no longer used to determine build behavior.

- **Types Generation**: Type generation is now controlled by `formats.types` and only generates if `tsconfig.build.json` exists. Previously controlled by the presence of `types` field in `package.json`.

**Migration Guide:**

If you were relying on `package.json` fields to control builds, add explicit configuration to `libsync.config.mjs`:

```js
// Before: Build behavior inferred from package.json
// After: Explicit configuration required
export default {
  commands: {
    build: {
      formats: {
        cjs: 'cjs',   // Enable CJS builds
        esm: 'esm',   // Enable ESM builds
        types: true   // Enable TypeScript definitions
      }
    }
  }
}
```

To disable a format:
```js
formats: {
  cjs: false,  // Disable CJS builds
  esm: 'esm',
  types: true
}
```

## Minor Changes

### Types-Only Build Mode

Added `--types-only` flag to the build command for generating only TypeScript type definitions without bundling.

```bash
libsync build --types-only
```

This creates a "production-types" mode where:
- Type definitions (`.d.ts`) are built to `esm/` or `cjs/` directories
- Main/module/exports point to source files in `src/`
- Perfect for TypeScript-only packages that don't need transpilation

**Use Cases:**
- Pure TypeScript packages that run directly from source
- Monorepo internal packages that share types
- Development-only packages that need type checking

### Node.js Compatibility

- **Minimum Node.js version**: Changed from `20.16.0` to `18.20.0`
- **minimatch**: Downgraded from `^10.1.1` to `^9.0.5` for Node 18 compatibility
- Updated `.nvmrc` to `18.20.0`

## Internal Changes

- Refactored `getPackageBuilds()` to read from config instead of `package.json`
- Added `shouldGenerateTypes()` function to replace `hasTypesField()`
- Updated validation logic to check config instead of package.json fields
- Enhanced proxy package.json generation to support production-types mode
- Fixed TypeScript compilation errors in validation and package utilities
