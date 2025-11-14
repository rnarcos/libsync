/**
 * @fileoverview libsync configuration schema
 * Defines the structure and validation for libsync.config.mjs
 */

import { z } from 'zod';

// Tsup config accepts any object (we don't validate tsup's internal schema)
const tsupConfigSchema = z.record(z.any());

export const libsyncConfigSchema = z
  .object({
    // Directory structure configuration
    directories: z
      .object({
        source: z.string().default('src'),
        cjs: z.string().default('cjs'),
        esm: z.string().default('esm'),
      })
      .default({}),

    // TypeScript configuration
    typescript: z
      .object({
        configFile: z.string().default('tsconfig.json'),
        buildConfigFile: z.string().default('tsconfig.build.json'),
        buildCacheFile: z.string().default('.cache/tsbuildinfo.json'),
      })
      .default({}),

    // File pattern configuration
    files: z
      .object({
        extensions: z
          .array(z.string())
          .default([
            '.js',
            '.jsx',
            '.ts',
            '.tsx',
            '.cjs',
            '.mjs',
            '.cts',
            '.mts',
          ]),
        // Paths to completely ignore during build (won't be compiled by tsc/tsup, no proxies, no exports)
        ignoreBuildPaths: z
          .array(z.string())
          .default(['**/*.test.*', '**/*.spec.*', '**/__tests__/**']),
        // Paths to ignore only for exports (still built by tsc/tsup, but no proxies or exports)
        // Useful for CLI commands that should be built but not exported as library imports
        ignoreExportPaths: z.array(z.string()).default([]),
        // Whether to write build artifacts and proxies to .gitignore
        writeToGitIgnore: z.boolean().default(true),
      })
      .default({}),

    // Command-specific configuration
    commands: z
      .object({
        build: z
          .object({
            // Tsup configuration can be:
            // 1. A single object applied to all formats: { splitting: true }
            // 2. Format-specific with default fallback: { default: {...}, esm: {...}, cjs: {...} }
            tsup: z
              .union([
                tsupConfigSchema,
                z.object({
                  default: tsupConfigSchema.optional(),
                  esm: tsupConfigSchema.optional(),
                  cjs: tsupConfigSchema.optional(),
                }),
              ])
              .optional(),
          })
          .default({}),
      })
      .default({}),
  })
  .default({});

/**
 * @typedef {import('zod').infer<typeof libsyncConfigSchema>} LibsyncConfig
 */
