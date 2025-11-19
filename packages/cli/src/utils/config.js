/**
 * @fileoverview Configuration loader for libsync
 * Handles loading and validating libsync.config.mjs
 */

import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';

import { ZodError } from 'zod';

import { libsyncConfigSchema } from '../config/index.js';

import { ConfigurationError } from './package.js';

let _config = /** @type {import('../config/index.js').LibsyncConfig | null} */ (
  null
);

/**
 * Load and validate libsync.config.mjs
 * @param {string} packagePath - Package root path
 * @returns {Promise<import('../config/index.js').LibsyncConfig>}
 */
export async function loadLibsyncConfig(packagePath) {
  const configPath = resolve(join(packagePath, 'libsync.config.mjs'));

  // No config file - return defaults
  if (!existsSync(configPath)) {
    return libsyncConfigSchema.parse({});
  }

  try {
    // Convert to file URL for proper ESM import in both CJS and ESM contexts
    const configUrl = pathToFileURL(configPath).href;
    // Use indirect eval to prevent tsup from transforming the dynamic import
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    const configModule = await dynamicImport(configUrl);
    const userConfig = configModule.default || configModule;

    // Get default config first
    const defaultConfig = libsyncConfigSchema.parse({});

    // Validate user config
    const config = libsyncConfigSchema.parse(userConfig);

    // Merge extensions: combine user extensions with defaults (deduplicate)
    if (userConfig?.files?.extensions) {
      const defaultExtensions = defaultConfig.files?.extensions || [];
      const userExtensions = config.files?.extensions || [];
      // Merge and deduplicate
      config.files.extensions = [
        ...new Set([...defaultExtensions, ...userExtensions]),
      ];
    }

    return config;
  } catch (error) {
    /** @type {ZodError} */
    const zodError = /** @type {ZodError} */ (error);
    // Fail fast with helpful error
    if (zodError instanceof ZodError) {
      const issues = zodError.errors
        .map((e) => `  • ${e.path.join('.')}: ${e.message}`)
        .join('\n');
      throw new ConfigurationError(`Invalid libsync.config.mjs:\n${issues}`, [
        'Check your libsync.config.mjs for validation errors',
        'See docs/libsync.config.example.mjs for valid options',
        'Import types from "libsync/config" for TypeScript support',
      ]);
    }
    throw new ConfigurationError(
      `Failed to load libsync.config.mjs: ${error instanceof Error ? error.message : String(error)}`,
      [
        'Check for syntax errors in your config file',
        'Ensure it exports a valid configuration object',
        'Try: export default { directories: { source: "src" } }',
      ],
    );
  }
}

/**
 * Initialize config singleton
 * @param {string} packagePath - Package root path
 * @returns {Promise<import('../config/index.js').LibsyncConfig>}
 */
export async function initConfig(packagePath) {
  _config = await loadLibsyncConfig(packagePath);
  return _config;
}

/**
 * Get current config
 * @returns {import('../config/index.js').LibsyncConfig | null}
 */
export function getConfig() {
  return _config;
}
