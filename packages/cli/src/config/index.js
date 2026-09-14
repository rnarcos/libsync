/**
 * @fileoverview libsync configuration schema
 * Defines the structure and validation for libsync.config.mjs
 */

import { z } from 'zod';

// Bundler config accepts any object (we don't validate tsdown's internal schema)
const bundlerConfigSchema = z.record(z.any());

// Bundler configuration can be:
// 1. An object applied to all formats: { minify: true }
// 2. A function that receives {type: 'esm'|'cjs'} and returns config
const bundlerConfigUnion = z
  .union([
    bundlerConfigSchema,
    z.function(
      z.tuple([z.object({ type: z.enum(['esm', 'cjs']) })]),
      bundlerConfigSchema,
    ),
  ])
  .optional();

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
        runner: z.enum(['tsc', 'tsgo']).default('tsc'),
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
            '.json',
          ]),
        // Paths to completely ignore during build (won't be compiled by tsc/tsdown, no proxies, no exports)
        ignoreBuildPaths: z
          .array(z.string())
          .default(['**/*.test.*', '**/*.spec.*', '**/__tests__/**']),
        // Paths to ignore only for exports (still built by tsc/tsdown, but no proxies or exports)
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
            // Build format configuration
            formats: z
              .object({
                cjs: z.union([z.literal(false), z.string()]).default('cjs'),
                esm: z.union([z.literal(false), z.string()]).default('esm'),
                types: z.boolean().default(true),
                /**
                 * Declarative bin entries: command name, path under source dir, and output format.
                 * When non-empty, libsync overwrites package.json `bin` from this config.
                 */
                bin: z
                  .array(
                    z.object({
                      command: z.string().min(1),
                      path: z.string().min(1),
                      format: z.enum(['cjs', 'esm']),
                    }),
                  )
                  .optional(),
              })
              .default({}),
            // Bundler (tsdown) configuration (see bundlerConfigUnion above)
            bundler: bundlerConfigUnion,
            // Removed in favor of `bundler` — reject with a clear message
            // instead of silently ignoring a leftover key.
            tsup: z
              .any()
              .refine((value) => value === undefined, {
                message:
                  'commands.build.tsup was removed — use commands.build.bundler',
              })
              .optional(),
          })
          .default({}),
      })
      .default({}),
  })
  .default({});

/**
 * @typedef {import('type-fest').PartialDeep<import('zod').infer<typeof libsyncConfigSchema>>} LibsyncConfig
 */
