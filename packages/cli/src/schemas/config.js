/**
 * @fileoverview Configuration validation schemas using Zod
 * Provides type-safe validation for CLI inputs with JSDoc type annotations
 */

import { z } from 'zod';
import { existsSync } from 'fs';
import { resolve } from 'path';

// Custom path validator
const validPath = z.string().refine(
  (path) => {
    const resolvedPath = resolve(path);
    return existsSync(resolvedPath);
  },
  {
    message: 'Path does not exist',
  },
);

/**
 * Configuration validation schemas for CLI commands
 */
export const configValidation = {
  build: z.object({
    path: validPath.default(process.cwd()),
    watch: z.boolean().default(false),
    skipValidation: z.boolean().default(false),
    verbose: z.boolean().default(false),
  }),

  clean: z.object({
    path: validPath.default(process.cwd()),
    skipValidation: z.boolean().default(false),
    verbose: z.boolean().default(false),
  }),

  dev: z.object({
    watch: z.boolean().default(false),
    path: validPath.default(process.cwd()),
    verbose: z.boolean().default(false),
  }),

  publishStaging: z.object({
    port: z.number().int().min(1024).max(65535).default(4873),
    path: validPath.default(process.cwd()),
    build: z.boolean().default(true),
    verbose: z.boolean().default(false),
    reuseServer: z.boolean().default(false),
    force: z.boolean().default(false),
    stagingVersion: z.boolean().default(false),
  }),
};

/**
 * Package.json validation schema
 */
export const packageJsonSchema = z.object({
  name: z.string().min(1, 'Package name is required'),
  version: z.string().optional(),
  private: z.boolean().optional(),
  main: z.string().optional(),
  module: z.string().optional(),
  bin: z.union([z.string(), z.record(z.string())]).optional(),
  exports: z.record(z.any()).optional(),
  dependencies: z.record(z.string()).optional(),
  devDependencies: z.record(z.string()).optional(),
  peerDependencies: z.record(z.string()).optional(),
  scripts: z.record(z.string()).optional(),
  type: z.enum(['module', 'commonjs']).optional(),
  types: z.string().optional(),
  typings: z.string().optional(),
});

/**
 * TypeScript configuration validation schema
 */
export const tsConfigSchema = z.object({
  compilerOptions: z
    .object({
      target: z.string().optional(),
      module: z.string().optional(),
      lib: z.array(z.string()).optional(),
      outDir: z.string().optional(),
      rootDir: z.string().optional(),
      declaration: z.boolean().optional(),
      declarationMap: z.boolean().optional(),
      sourceMap: z.boolean().optional(),
      strict: z.boolean().optional(),
      esModuleInterop: z.boolean().optional(),
      skipLibCheck: z.boolean().optional(),
      forceConsistentCasingInFileNames: z.boolean().optional(),
      moduleResolution: z.string().optional(),
      tsBuildInfoFile: z.string().optional(),
    })
    .optional(),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  extends: z.string().optional(),
});

/**
 * Build options type definition
 * @typedef {Object} BuildOptions
 * @property {string} path - Package path to build
 * @property {boolean} watch - Watch for file changes and rebuild
 * @property {boolean} skipValidation - Skip project structure validation
 * @property {boolean} verbose - Enable verbose logging
 */

/**
 * Clean options type definition
 * @typedef {Object} CleanOptions
 * @property {string} path - Package path to clean
 * @property {boolean} skipValidation - Skip project structure validation
 * @property {boolean} verbose - Enable verbose logging
 */

/**
 * Dev options type definition
 * @typedef {Object} DevOptions
 * @property {boolean} watch - Watch for file changes
 * @property {string} path - Package path to process
 * @property {boolean} verbose - Enable verbose logging
 */

/**
 * Publish staging options type definition
 * @typedef {Object} PublishStagingOptions
 * @property {number} port - Registry port number (1024-65535)
 * @property {string} path - Package path to publish
 * @property {boolean} build - Whether to build before publishing
 * @property {boolean} verbose - Enable verbose logging
 * @property {boolean} reuseServer - Automatically reuse existing Verdaccio servers without prompting
 * @property {boolean} force - Force republish existing packages (overwrite existing versions)
 * @property {boolean} stagingVersion - Use staging-specific versioning (adds staging suffix)
 */

/**
 * Package.json structure type definition
 * @typedef {Object} PackageJson
 * @property {string} name - Package name
 * @property {string} [version] - Package version
 * @property {boolean} [private] - Whether package is private
 * @property {string} [main] - Main entry point
 * @property {string} [module] - ESM entry point
 * @property {string|Record<string, string>} [bin] - Binary executables
 * @property {Record<string, any>} [exports] - Package exports
 * @property {Record<string, string>} [dependencies] - Runtime dependencies
 * @property {Record<string, string>} [devDependencies] - Development dependencies
 * @property {Record<string, string>} [peerDependencies] - Peer dependencies
 * @property {Record<string, string>} [scripts] - NPM scripts
 * @property {'module'|'commonjs'} [type] - Module type
 * @property {string} [types] - Type definitions entry point
 * @property {string} [typings] - Alternative type definitions entry point
 */

/**
 * TypeScript configuration type definition
 * @typedef {Object} TsConfig
 * @property {Object} [compilerOptions] - TypeScript compiler options
 * @property {string} [compilerOptions.target] - Compilation target
 * @property {string} [compilerOptions.module] - Module system
 * @property {string[]} [compilerOptions.lib] - Library files to include
 * @property {string} [compilerOptions.outDir] - Output directory
 * @property {string} [compilerOptions.rootDir] - Root source directory
 * @property {boolean} [compilerOptions.declaration] - Generate declaration files
 * @property {boolean} [compilerOptions.declarationMap] - Generate declaration maps
 * @property {boolean} [compilerOptions.sourceMap] - Generate source maps
 * @property {boolean} [compilerOptions.strict] - Enable strict type checking
 * @property {boolean} [compilerOptions.esModuleInterop] - Enable ES module interop
 * @property {boolean} [compilerOptions.skipLibCheck] - Skip library type checking
 * @property {boolean} [compilerOptions.forceConsistentCasingInFileNames] - Force consistent casing
 * @property {string} [compilerOptions.moduleResolution] - Module resolution strategy
 * @property {string} [compilerOptions.tsBuildInfoFile] - TypeScript build info file
 * @property {string[]} [include] - Files to include in compilation
 * @property {string[]} [exclude] - Files to exclude from compilation
 * @property {string} [extends] - Base configuration to extend
 */
