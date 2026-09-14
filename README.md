# 🔧 libsync

A comprehensive CLI tool and monorepo for library maintainers using [tsdown](https://tsdown.dev/). This project provides both the CLI tooling and example implementations to help you build, maintain, and distribute high-quality JavaScript and TypeScript libraries.

## ✨ Features

- **🔨 Build Command**: Build libraries with dual ESM/CJS output using tsdown
- **🧹 Clean Command**: Remove build artifacts and reset to development mode
- **📦 Dev Command**: Generate development package.json files for monorepos
- **🎯 Type-Safe**: Built with JavaScript + JSDoc for full TypeScript experience
- **⚡ Fast**: Powered by tsdown and Rolldown for lightning-fast builds
- **🔄 Watch Mode**: Real-time rebuilding during development
- **📋 Validation**: Comprehensive project structure and configuration validation
- **🏗️ Examples**: Complete recipe examples for different library types

## 🚀 Quick Start

### Installation

```bash
# Install globally
pnpm add -g libsync

# Or use directly with npx
npx libsync --help
```

### Basic Usage

```bash
# Build a library
libsync build

# Clean build artifacts
libsync clean

# Generate dev package.json files
libsync dev

# Watch mode
libsync dev --watch

# Process current package
libsync dev
```

## 📁 Monorepo Structure

```
libsync/
├── packages/
│   └── cli/              # Main CLI package
│       ├── src/
│       │   ├── commands/ # Command implementations
│       │   ├── utils/    # Utility functions
│       │   ├── schemas/  # Zod validation schemas
│       │   └── index.js  # CLI entry point
│       └── package.json
├── recipes/              # Example library implementations
│   ├── js-library/       # JavaScript library with JSDoc
│   ├── ts-library/       # TypeScript library
│   ├── react-component/  # React component library
│   └── react-native/     # React Native library
└── package.json          # Root monorepo config
```

## 🛠️ CLI Commands

### `libsync build`

Build a library package using tsdown with dual ESM/CJS output.

```bash
libsync build [options]

Options:
  -p, --path <path>      Package path to build (default: current directory)
  --skip-validation      Skip project structure validation
  --verbose             Enable verbose logging
```

**Features:**

- TypeScript compilation with declaration files
- Dual format output (ESM + CJS)
- Automatic proxy package generation
- Source map generation
- Build artifact optimization

### `libsync clean`

Remove build artifacts and reset package.json to development mode.

```bash
libsync clean [options]

Options:
  -p, --path <path>      Package path to clean (default: current directory)
  --skip-validation      Skip project structure validation
  --verbose             Enable verbose logging
```

### `libsync dev`

Generate development-friendly package.json for the current package.

```bash
libsync dev [options]

Options:
  -p, --path <path>           Package path to process (default: current directory)
  -w, --watch                 Watch for file changes and auto-regenerate
  --verbose                   Enable verbose logging
```

**Features:**

- Automatic export generation
- File watching with hot reload
- Development-mode package.json generation

## 📚 Recipe Examples

### JavaScript Library (with JSDoc)

A complete example showing how to build a JavaScript library with full TypeScript support via JSDoc annotations.

```bash
cd recipes/js-library
pnpm install
pnpm build
```

**Features:**

- JSDoc type annotations
- ESM/CJS dual output
- Node.js native testing
- Zero TypeScript compilation

### TypeScript Library

Advanced TypeScript library example with comprehensive patterns and testing.

```bash
cd recipes/ts-library
pnpm install
pnpm build
pnpm test
```

**Features:**

- Advanced TypeScript patterns
- Zod validation
- Event system implementation
- Vitest testing framework
- Concurrent async processing

### React Component Library

React component library with TypeScript and modern build tooling.

```bash
cd recipes/react-component
pnpm install
pnpm build
pnpm test
```

### React Native Library

React Native library example with platform-specific builds.

```bash
cd recipes/react-native
pnpm install
pnpm build
```

## ⚙️ Configuration

### libsync.config.mjs

`libsync` supports a configuration file to customize build heuristics and behaviors. Create a `libsync.config.mjs` file in your project root to override default settings.

#### Basic Configuration

```javascript
// libsync.config.mjs
export default {
  directories: {
    source: 'src',
    cjs: 'dist/cjs',
    esm: 'dist/esm',
  },
  typescript: {
    configFile: 'tsconfig.json',
    buildConfigFile: 'tsconfig.build.json',
    buildCacheFile: '.cache/tsbuildinfo.json',
  },
  files: {
    // Don't build test files at all
    ignoreBuildPaths: ['**/*.test.*', '**/*.spec.*', '**/__tests__/**'],
    // For CLI-only packages: build index but don't export it (removes "." export)
    ignoreExportPaths: ['index.*'],
    // Or for mixed packages: build CLI commands but don't export them
    // ignoreExportPaths: ['commands/**'],
  },
};
```

#### Available Options

**directories** - Configure build directory structure
- `source` (default: `'src'`) - Source directory
- `cjs` (default: `'cjs'`) - CommonJS output directory
- `esm` (default: `'esm'`) - ESM output directory

**typescript** - TypeScript configuration paths
- `configFile` (default: `'tsconfig.json'`) - Main TypeScript config
- `buildConfigFile` (default: `'tsconfig.build.json'`) - Build-specific config
- `buildCacheFile` (default: `'.cache/tsbuildinfo.json'`) - tsc build cache location

**files** - File pattern configuration
- `extensions` (default: `['.js', '.jsx', '.ts', '.tsx', '.cjs', '.mjs', '.cts', '.mts']`) - Recognized file extensions for source files and index files
- `ignoreBuildPaths` (default: `['**/*.test.*', '**/*.spec.*', '**/__tests__/**']`) - Paths to completely ignore during build. Files matching these patterns won't be compiled by TypeScript/tsdown, won't have proxy packages generated, and won't be included in the exports map. **Patterns are relative to source directory** (e.g., `'index.*'`, `'utils/helper.ts'`). The `src/` prefix is automatically stripped if present.
- `ignoreExportPaths` (default: `[]`) - Paths to ignore only for exports. Files matching these patterns will still be compiled by TypeScript/tsdown, but won't have proxy packages generated and won't be included in the exports map. **Useful for CLI-only packages**: Use `'index.*'` to build the index but remove the `"."` export and `main`/`module`/`types` fields. Use `'commands/**'` to build CLI commands without exporting them as library imports.

**commands.build** - Build command configuration

**commands.build.bundler** - bundler (tsdown) configuration

Option 1: Universal configuration (applies to all formats)
```javascript
export default {
  commands: {
    build: {
      bundler: {
        treeshake: true,
        minify: true,
      },
    },
  },
};
```

Option 2: Format-specific configuration (function receives the current format)
```javascript
export default {
  commands: {
    build: {
      bundler: ({ type }) => ({
        minify: type === 'esm',
      }),
    },
  },
};
```

#### TypeScript Support

For full TypeScript support, import the config type:

```typescript
// libsync.config.mjs
import type { LibsyncConfig } from 'libsync/config';

const config: LibsyncConfig = {
  directories: {
    source: 'src',
  },
};

export default config;
```

#### Configuration Priority

`libsync` respects the following priority for build configuration:

1. **libsync.config.mjs** (`commands.build.bundler`) - Only configuration source
2. **Default settings** - Built-in defaults

Standalone bundler config files (`tsup.config.*`, `tsdown.config.*`) are **not** read — if one is present it is ignored with a warning.

#### Migration from tsup.config.mjs

If you have an existing `tsup.config.mjs`, move its options into `libsync.config.mjs` under `commands.build.bundler` and drop esbuild-specific options (`splitting`, `esbuildOptions`, `loader`) — code splitting is native in tsdown and JSON sources are copied to the output as-is:

```javascript
// libsync.config.mjs
export default {
  commands: {
    build: {
      bundler: {
        treeshake: true,
      },
      // Per-format overrides via the function form:
      // bundler: ({ type }) => ({ minify: type === 'esm' }),
    },
  },
};
```

#### Complete Example

See [`docs/libsync.config.example.mjs`](./packages/cli/docs/libsync.config.example.mjs) for a fully documented configuration example with all available options.

### Package.json Structure

For dual-purpose packages (both CLI and library):

```json
{
  "name": "my-library",
  "main": "cjs/index.cjs",
  "module": "esm/index.js",
  "types": "esm/index.d.ts",
  "bin": {
    "my-cli": "./src/index.js"
  },
  "exports": {
    "./utils": {
      "import": "./esm/utils.js",
      "require": "./cjs/utils.cjs",
      "types": "./esm/utils.d.ts"
    }
  }
}
```

### TypeScript Configuration

Recommended `tsconfig.json` for JavaScript projects:

```json
{
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "declaration": true,
    "emitDeclarationOnly": false,
    "noEmit": false
  },
  "include": ["src/**/*.js"]
}
```

### Build Configuration

Example bundler options in `libsync.config.mjs`:

```javascript
export default {
  commands: {
    build: {
      bundler: {
        target: 'node18',
        sourcemap: true,
        external: ['dependency-name'],
      },
    },
  },
};
```

Note: `entry`, `format`, `outDir`, `clean`, and `dts` are always controlled by libsync and cannot be overridden.

## 🔍 Validation & Error Handling

The CLI provides comprehensive validation and helpful error messages:

### Project Structure Validation

- ✅ Package.json validation with Zod schemas
- ✅ TypeScript configuration checks
- ✅ Source directory structure validation
- ✅ Workspace configuration validation

### Error Messages

- 🚨 **Clear error descriptions** with context
- 💡 **Actionable suggestions** for fixes
- 🔍 **Verbose mode** for debugging
- 📋 **Validation bypass** options

## 🏗️ Development

### Setup

```bash
# Clone the repository
git clone <repo-url>
cd libsync

# Install dependencies
pnpm install

# Build the CLI
pnpm build:cli

# Test the CLI
cd packages/cli
node src/index.js --help
```

### Scripts

```bash
# Build all packages
pnpm build

# Clean all artifacts
pnpm clean

# Development mode with watching
pnpm dev

# Format code
pnpm format

# Lint code
pnpm lint

# Type checking
pnpm typecheck
```

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** changes: `git commit -m 'Add amazing feature'`
4. **Push** to branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

## 👨‍💻 Author

**Marcos Fernandes**
- GitHub: [@rnarcos](https://github.com/rnarcos)

## 📄 License

MIT © 2025 Marcos Fernandes. See [LICENSE](./LICENSE) for details.

## 💡 Inspiration

This library was heavily inspired by the excellent open source work of **[Diego Haz](https://github.com/diegohaz)** and his innovative build and publish workflows for [ariakit](https://github.com/ariakit/ariakit). The workflow and tooling he built for ariakit served as the foundation for the core concepts implemented in libsync.

## 🙏 Acknowledgments

- [Diego Haz](https://github.com/diegohaz) - Original inspiration for build/publish workflows
- [tsdown](https://tsdown.dev/) - The elegant bundler for libraries, powered by Rolldown
- [Commander.js](https://github.com/tj/commander.js/) - Command-line interface framework
- [Zod](https://zod.dev/) - TypeScript-first schema validation
- [Turborepo](https://turbo.build/) - High-performance build system
