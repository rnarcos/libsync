# libsync

## 1.0.11

### Patch Changes

- [`1dc8c83`](https://github.com/rnarcos/libsync/commit/1dc8c83aa1ed34717b1ec9beb290b15fff588759) Thanks [@rnarcos](https://github.com/rnarcos)! - Add support for tsgo (TypeScript 7) as an alternative compiler:
  - **New configuration option**: Added `typescript.runner` field to `libsync.config.mjs` with options `'tsc'` (default) or `'tsgo'` (experimental)
  - **Backward compatible**: Default behavior remains unchanged, using the stable `tsc` compiler
  - **Enhanced error handling**: Clear error messages when `tsgo` is selected but not installed, with installation instructions
  - **Performance potential**: Users can opt-in to Microsoft's faster Go-based TypeScript compiler for declaration generation

  Example configuration:

  ```javascript
  export default {
    typescript: {
      runner: 'tsgo', // Use experimental tsgo instead of tsc
    },
  };
  ```

  Note: tsgo is experimental preview software. Install with `npm install -g @typescript/native-preview`. Some edge cases in declaration emit may not work yet.

## 1.0.10

### Patch Changes

- [`b4e7ca2`](https://github.com/rnarcos/libsync/commit/b4e7ca2b26e04047dc6717083cf87e7e670b15a3) Thanks [@rnarcos](https://github.com/rnarcos)! - Fix development mode coercion and production file validation

  ## What Changed
  - **Development mode coercion**: Fixed issue where switching from `production-types` mode to `development` mode didn't update package.json fields. The package now always coerces to the target mode regardless of current state.
  - **Production file validation**: When generating production package.json, the CLI now validates that production build files exist and throws clear errors instead of silently falling back to `.js` or `.cjs` extensions.
  - **Type property handling**: Added proper handling of the `type` property in package.json based on the target mode (development/production).

  ## Why This Change Was Made

  Previously, if a package was in `production-types` mode (after running `libsync build --types-only`), running `libsync package-json --mode development` would not update the package.json fields, leaving it in an inconsistent state. Additionally, production mode would silently use incorrect file extensions when build files were missing, masking build errors.

  ## How to Update

  No code changes required. If you encounter errors about missing production files, run `libsync build` first to generate the production build artifacts before running `libsync package-json --mode production`.

## 1.0.9

### Patch Changes

- [`38d5771`](https://github.com/rnarcos/libsync/commit/38d5771a15cf6bde862c8ac1dc906e86e11d9814) Thanks [@rnarcos](https://github.com/rnarcos)! - Enhanced error reporting across all CLI commands. Fatal errors now always display full stack traces, while non-fatal errors show brief descriptions with full details available in verbose mode. TypeScript compilation errors now display the actual compilation errors instead of just exit codes. All errors are properly logged and no longer silently suppressed.

## 1.0.8

### Patch Changes

- [`9a8dc06`](https://github.com/rnarcos/libsync/commit/9a8dc06d0871b6b644e07dbb4e3e593c4be0b908) Thanks [@rnarcos](https://github.com/rnarcos)! - Fixed field ordering in package.json exports when using `--types-only` flag. Export fields are now correctly ordered as `types`, `import`, `require` (instead of `import`, `require`, `types`), ensuring proper TypeScript resolution.

## 1.0.7

### Patch Changes

- [`3edce00`](https://github.com/rnarcos/libsync/commit/3edce00d0f6de2f2bc24f634fa2c91b43cd5c987) Thanks [@rnarcos](https://github.com/rnarcos)! - Following typescript specification for defining export proxies, using `types`, `import`, `require`.

## 1.0.6

### Patch Changes

- [`ead9282`](https://github.com/rnarcos/libsync/commit/ead9282d6e8434677a9778b35e88850f6f5222a5) Thanks [@rnarcos](https://github.com/rnarcos)! - Improved `build --types-only` mode and development mode cleanup:

  **Types-only mode improvements:**
  - Preserves existing build artifacts (no cleaning of cjs/esm directories)
  - Cleans stale `.d.ts` files before generating new ones to avoid outdated type definitions
  - Updates only `types` fields in package.json while preserving `main`/`module`/`import`/`require`
    paths
  - Generates proxy package.json files with correct types paths matching root package.json mode
  - Properly detects `.d.ts` files in both flat structure (`esm/index.d.ts`) and nested structure
    (`esm/src/index.d.ts`) based on TypeScript configuration

  **Development mode cleanup:**
  - When reverting to development mode (e.g., on build errors), now automatically removes all proxy
    package.json directories
  - Build output directories (cjs/esm) are preserved to allow inspection and debugging
  - Package.json fields are updated to point back to source files

  **Proxy generation:**
  - Proxies are now only generated once during build, not cleaned and regenerated multiple times
  - Export fields now use consistent ordering for better readability

  This allows for efficient type-checking workflows where the CLI can remain in production mode while
  generating updated types, and ensures clean transitions between development and production modes.

## 1.0.5

### Patch Changes

- [`f460160`](https://github.com/rnarcos/libsync/commit/f4601604c4ca1f7f83737015d983c9b58083a9f4) Thanks [@rnarcos](https://github.com/rnarcos)! - The `clean` command explicitly resets package.json to development mode as expected.

## 1.0.4

### Patch Changes

- [`a237a75`](https://github.com/rnarcos/libsync/commit/a237a75e54bee7a4eda7d0a33650422722a01cd5) Thanks [@rnarcos](https://github.com/rnarcos)! - Fixed `production-types` mode to preserve existing `main`/`module`/`import`/`require` paths in package.json and only update the `types` field to point to production build outputs. Previously, production-types mode would reset these fields to development (source) paths. Also removed the automatic package.json reset to development mode during cleanup, ensuring package.json is only modified when explicitly needed.

## 1.0.3

### Patch Changes

- [`b4dbf90`](https://github.com/rnarcos/libsync/commit/b4dbf90e54be13e9748f831ee7e4ed83d9d31fe1) Thanks [@rnarcos](https://github.com/rnarcos)! - Fixed type definition generation to respect `libsync.config.mjs` `formats.types` setting instead of requiring a `types` field in the root `package.json`. Type definitions are now generated automatically when `formats.types` is enabled and `tsconfig.build.json` exists, regardless of whether the original package.json had a `types` field. This ensures consistent type generation across all build modes (development, production, and production-types).

## 1.0.2

### Patch Changes

- [`14394e8`](https://github.com/rnarcos/libsync/commit/14394e87fe9410a5d665af4fd03b75afa2bc723e) Thanks [@rnarcos](https://github.com/rnarcos)! - Fixed type definition generation to respect `libsync.config.mjs` `formats.types` setting instead of requiring a `types` field in the root `package.json`. Type definitions are now generated automatically when `formats.types` is enabled and `tsconfig.build.json` exists, regardless of whether the original package.json had a `types` field. This ensures consistent type generation across all build modes (development, production, and production-types).

## 1.0.1

### Patch Changes

- [`4ba5575`](https://github.com/rnarcos/libsync/commit/4ba5575afb8c110261cef40a397c734c232bc78c) Thanks [@rnarcos](https://github.com/rnarcos)! - Fixed proxy package.json files missing `types` field in `--types-only` mode. Directory exports (like `cli`, `config`) now correctly reference their type definition files at `esm/[module]/index.d.ts` instead of being omitted.

## 1.0.0

### Major Changes

- [`84b31f4`](https://github.com/rnarcos/libsync/commit/84b31f4bc9690dadc035029a492d2d77233d0347) Thanks [@rnarcos](https://github.com/rnarcos)! - ## Major Changes

  ### Build Configuration Refactor

  The build system now uses `libsync.config.mjs` as the source of truth for determining what formats to build, instead of inferring from `package.json` fields.

  **Breaking Changes:**
  - **New Configuration Schema**: Added `commands.build.formats` to `libsync.config.mjs`:
    ```js
    export default {
      commands: {
        build: {
          formats: {
            cjs: 'cjs', // string path or false to disable
            esm: 'esm', // string path or false to disable
            types: true, // boolean to enable/disable TypeScript types
          },
        },
      },
    };
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
          cjs: 'cjs', // Enable CJS builds
          esm: 'esm', // Enable ESM builds
          types: true, // Enable TypeScript definitions
        },
      },
    },
  };
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

## 0.0.7

### Patch Changes

- [`e91bd1e`](https://github.com/rnarcos/libsync/commit/e91bd1ec64d621c6a0931b36a931118de879c898) Thanks [@rnarcos](https://github.com/rnarcos)! - Fixed package.json main, module, types, and bin fields to use actual file extensions instead of
  hardcoded .js extensions. The logic now properly detects the real file extensions (.cjs, .js, etc.)
  using getActualFileExtension for both the main package.json and proxy package.json files. This
  ensures correct path resolution in production and development modes.

- [`51e1397`](https://github.com/rnarcos/libsync/commit/51e1397c584a261f2c491905364096e42e935f26) Thanks [@rnarcos](https://github.com/rnarcos)! - Fixed package.json generation to correctly handle build output file extensions:
  - **Dynamic extension detection**: Package.json exports and proxy files now detect actual file
    extensions from build output (`.js`, `.cjs`, `.mjs`, etc.) instead of assuming hardcoded
    extensions. This ensures correct module resolution when tsup outputs different extensions.
  - **Conditional TypeScript declarations**: Only include `types` fields in package.json when `.d.ts`
    files actually exist in the build output, preventing module resolution errors for packages without
    TypeScript declarations.
  - **Support for `.json` files**: Added `.json` to supported file extensions in both config schema
    and file detection logic, enabling proper handling of JSON modules in exports.

  These fixes ensure package.json files accurately reflect the actual build artifacts, improving
  module resolution reliability across different bundler configurations.

- [`793fdc0`](https://github.com/rnarcos/libsync/commit/793fdc03aa14915c16b432ee1aa5a4ff41c6781a) Thanks [@rnarcos](https://github.com/rnarcos)! - **BREAKING CHANGE: Rename `dev` command to `package-json` with new mode system**
  - The `dev` command has been **renamed** to `package-json`
  - All scripts using `libsync dev` must be updated to `libsync package-json`
  - Replaced boolean `prod` parameter with `--mode <production|development>` flag
  - Default mode is `development`
  - Mode parameter is now a string enum: `'production' | 'development'`

  Update all package.json scripts across your workspace:

  ```diff
  {
    "scripts": {
  -   "dev:package-json": "libsync dev --"
  +   "dev:package-json": "libsync package-json --"
    }
  }
  ```

  - Added `--check` flag to validate package.json without writing changes
  - Useful in CI/CD pipelines to ensure package.json is in the correct state
  - Exits with code 1 if package.json doesn't match expected configuration

  ```bash
  libsync package-json --check

  libsync package-json --mode production --check
  ```

  - Added `--write` flag (default: true) for explicit control
  - When `--check` is used, `--write` is automatically set to false
  - Mutually exclusive with `--check`

  ```bash
  libsync package-json

  libsync package-json --mode production

  libsync package-json --check

  libsync package-json --watch

  libsync package-json --mode production --watch
  ```

  - Fixed clean command incorrectly modifying `.gitignore` files
  - The clean command now only removes build artifacts without touching `.gitignore`
  - `.gitignore` is only modified when running package-json/build commands with
    `writeToGitIgnore: false` config
  1. **Update all scripts** that use `libsync dev` to `libsync package-json`
  2. **Review CI/CD pipelines** - consider adding `--check` flag for validation
  3. **Update documentation** referencing the old `dev` command
  4. **Test your workflows** to ensure the new command works as expected

  No changes are needed to your `libsync.config.mjs` configuration files.

## 0.0.4

### Patch Changes

- [`af7fa83`](https://github.com/rnarcos/libsync/commit/af7fa83081e8a57b9fcd969e5c8d4b49f30676fc)
  Thanks [@rnarcos](https://github.com/rnarcos)! - # Introduce unified configuration system with
  libsync.config.mjs

  This release introduces a powerful new configuration system that consolidates all libsync settings
  into a single `libsync.config.mjs` file, replacing the previous `tsup.config.mjs` approach.

  ## ✨ New Features

  ### Unified Configuration System
  - **New config file**: `libsync.config.mjs` - centralized configuration for all libsync behavior
  - **Deep merge support**: Override only the settings you need, defaults are preserved
  - **TypeScript support**: Import types with `import type { LibsyncConfig } from 'libsync/config'`
  - **Fail-fast validation**: Clear error messages with suggestions when config is invalid

  ### Integrated tsup Configuration
  - Define tsup config directly in `libsync.config.mjs` under `commands.build.tsup`
  - Support for format-specific overrides: `{ default, esm, cjs }`
  - Priority system: libsync.config.mjs → tsup.config.mjs → defaults

  ### Granular Build & Export Control
  - **`files.ignoreBuildPaths`**: Completely exclude paths from build, proxies, and exports
    - Defaults: `['**/*.test.*', '**/*.spec.*', '**/__tests__/**']`
  - **`files.ignoreExportPaths`**: Build files but exclude from proxies and exports
    - Useful for CLI commands that shouldn't be importable
  - Pattern matching with automatic `src/` prefix stripping for intuitive usage

  ### Enhanced Package.json Management
  - **Smart path conversion**: Automatically convert `bin`, `main`, `module`, and `types` fields
    between dev/prod modes
  - **Actual file detection**: No more guessing `.js` vs `.ts` - dynamically detects real file
    extensions
  - **Relative paths**: All paths normalized to start with `./`
  - **Bin field support**: Handles both string and object syntax

  ### Development Workflow Improvements
  - **Dev mode proxies**: `libsync dev` now generates proxies pointing to `src/` files
  - **Watch mode enhancement**: Automatically regenerates proxies when files are added/removed
  - **Smart proxy cleanup**: Removes entire root directories (commands/, utils/, schemas/) for clean
    state
  - **Better error logging**: Clear, actionable error messages with stack traces

  ## 🔧 Configuration Options

  ```javascript
  /** @type {import('libsync').LibsyncConfig} */
  export default {
    // Directory names
    directories: {
      source: 'src', // Source directory
      cjs: 'cjs', // CommonJS output
      esm: 'esm', // ES Modules output
    },

    // TypeScript settings
    typescript: {
      configFile: 'tsconfig.json',
      buildConfigFile: 'tsconfig.build.json',
      buildCacheFile: '.cache/tsbuildinfo.json',
    },

    // File handling
    files: {
      extensions: [
        '.js',
        '.jsx',
        '.ts',
        '.tsx',
        '.cjs',
        '.mjs',
        '.cts',
        '.mts',
      ],
      ignoreBuildPaths: ['**/*.test.*', '**/*.spec.*', '**/__tests__/**'],
      ignoreExportPaths: [], // e.g., ['commands/*'] for CLI-only files
    },

    // Build configuration
    commands: {
      build: {
        tsup: {
          // Universal config or format-specific: { default, esm, cjs }
        },
      },
    },
  };
  ```

  ## 🔄 Command Updates
  - **`build`**: Generates production proxies with build outputs
  - **`dev`**: Generates development proxies pointing to src/ files
  - **`dev --watch`**: Auto-regenerates proxies when files change
  - **`clean`**: Now removes proxy directories in addition to build outputs
  - **`publish:staging`**: Requires package to be built first (removed `--no-build` flag)

  ## ⚠️ Breaking Changes
  1. **Removed `--no-build` flag** from `publish:staging` command
     - Packages must be built before publishing to staging
     - Run `libsync build` before `libsync publish:staging`
  2. **Configuration migration** from `tsup.config.mjs` to `libsync.config.mjs`
     - Existing `tsup.config.mjs` files still work but are deprioritized
     - Recommended to migrate to `libsync.config.mjs` for better control

  ## 📚 Migration Guide

  **Before (tsup.config.mjs):**

  ```javascript
  export default {
    plugins: [mdx()],
    external: [/^some-pattern/],
  };
  ```

  **After (libsync.config.mjs):**

  ```javascript
  export default {
    commands: {
      build: {
        tsup: {
          plugins: [mdx()],
          external: [/^some-pattern/],
        },
      },
    },
  };
  ```

  ## 🐛 Bug Fixes
  - Fixed watch mode not regenerating proxies on file changes
  - Fixed clean command not removing proxy directories
  - Fixed ignore patterns not matching full relative paths
  - Fixed empty subdirectories causing build failures
  - Fixed index export incorrectly removed when using ignoreExportPaths

  ## 📖 Documentation
  - Added comprehensive `libsync.config.example.mjs` with all options documented
  - Updated README with detailed configuration section
  - Added TypeScript configuration examples
  - Updated publish-staging documentation with build prerequisites

- [`3292aa6`](https://github.com/rnarcos/libsync/commit/3292aa61c851bababea5e70ca48877bf38b7d265)
  Thanks [@rnarcos](https://github.com/rnarcos)! - Fixing bug where package.json "exports" were not
  being processed recursively - only at first level.

- [`5648bef`](https://github.com/rnarcos/libsync/commit/5648bef064afb4475cb202e21b5f6436739bd6dd)
  Thanks [@rnarcos](https://github.com/rnarcos)! - Fixing `publish-staging` command to better handle
  verdaccio server management.
