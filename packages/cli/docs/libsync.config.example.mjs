/**
 * Example libsync configuration
 * Copy this file to your project root as libsync.config.mjs
 *
 * For TypeScript support:
 * import type { LibsyncConfig } from 'libsync/config';
 * const config: LibsyncConfig = { ... };
 * export default config;
 */
export default {
  // Directory structure (all optional)
  directories: {
    source: 'src', // Source directory
    cjs: 'cjs', // CommonJS output directory
    esm: 'esm', // ESM output directory
  },

  // TypeScript configuration (all optional)
  typescript: {
    // TypeScript compiler to use: 'tsc' (default, stable) or 'tsgo' (experimental, faster)
    // tsgo is TypeScript 7 written in Go - preview quality, some edge cases don't work
    // Install tsgo: npm install -g @typescript/native-preview
    runner: 'tsc',

    configFile: 'tsconfig.json', // Main TypeScript config
    buildConfigFile: 'tsconfig.build.json', // Build-specific config
    buildCacheFile: '.cache/tsbuildinfo.json', // Build cache file
  },

  // File patterns (all optional)
  files: {
    // Recognized file extensions
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.cjs', '.mjs', '.cts', '.mts'],

    // Paths to completely ignore during build
    // These files won't be compiled by tsc/tsup, won't have proxies, and won't be in exports
    // Patterns are relative to source directory (src/ prefix is automatically stripped)
    // Examples: 'index.*', '**/*.test.*', 'commands/**', 'src/utils/internal.ts'
    ignoreBuildPaths: ['**/*.test.*', '**/*.spec.*', '**/__tests__/**'],

    // Paths to ignore only for exports (still built, but not exported)
    // Useful for CLI commands that need to be built but shouldn't be library imports
    // To ignore index file (removes "." export and main/module/types): use 'index.*'
    // Examples: 'index.*' (no library exports), 'commands/**' (builds CLIs, no exports)
    ignoreExportPaths: [],
  },

  // Command-specific configuration
  commands: {
    build: {
      // Output formats (optional). When `bin` is non-empty, libsync overwrites package.json `bin`
      // from this list: each entry maps an npm command name to a source file under `source` and
      // the output format (cjs or esm). Paths must exist relative to the source directory.
      // Example: `libsync` CLI from src/cli/index.js as CommonJS, `my-tool` as ESM only:
      // formats: {
      //   cjs: 'cjs',
      //   esm: 'esm',
      //   types: true,
      //   bin: [
      //     { command: 'libsync', path: 'cli/index.js', format: 'cjs' },
      //     { command: 'my-tool', path: 'other/cli.js', format: 'esm' },
      //   ],
      // },

      // Option 1: Universal tsup config (applied to all formats)
      tsup: {
        splitting: true,
        treeshake: true,
        minify: true,
      },

      // Option 2: Format-specific tsup config
      // tsup: {
      //   default: { splitting: true },           // Fallback for all formats
      //   esm: { format: 'esm', splitting: true }, // ESM-specific
      //   cjs: { format: 'cjs', splitting: false }, // CJS-specific
      // },
    },
  },
};
