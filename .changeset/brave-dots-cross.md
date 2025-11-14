---
"libsync": patch
---

# Introduce unified configuration system with libsync.config.mjs

This release introduces a powerful new configuration system that consolidates all libsync settings into a single `libsync.config.mjs` file, replacing the previous `tsup.config.mjs` approach.

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
- **Smart path conversion**: Automatically convert `bin`, `main`, `module`, and `types` fields between dev/prod modes
- **Actual file detection**: No more guessing `.js` vs `.ts` - dynamically detects real file extensions
- **Relative paths**: All paths normalized to start with `./`
- **Bin field support**: Handles both string and object syntax

### Development Workflow Improvements
- **Dev mode proxies**: `libsync dev` now generates proxies pointing to `src/` files
- **Watch mode enhancement**: Automatically regenerates proxies when files are added/removed
- **Smart proxy cleanup**: Removes entire root directories (commands/, utils/, schemas/) for clean state
- **Better error logging**: Clear, actionable error messages with stack traces

## 🔧 Configuration Options

```javascript
/** @type {import('libsync/config').LibsyncConfig} */
export default {
  // Directory names
  directories: {
    source: 'src',      // Source directory
    cjs: 'cjs',         // CommonJS output
    esm: 'esm',         // ES Modules output
  },

  // TypeScript settings
  typescript: {
    configFile: 'tsconfig.json',
    buildConfigFile: 'tsconfig.build.json',
    buildCacheFile: '.cache/tsbuildinfo.json',
  },

  // File handling
  files: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.cjs', '.mjs', '.cts', '.mts'],
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
