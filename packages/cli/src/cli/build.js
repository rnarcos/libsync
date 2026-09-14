/**
 * @fileoverview Build command implementation
 * Comprehensive build process with TypeScript compilation, bundling, and packaging
 */

import { mkdir, rm } from 'fs/promises';
import path from 'path';

import chalk from 'chalk';
import chokidar from 'chokidar';
import spawn from 'cross-spawn';
import fse from 'fs-extra';
import { build } from 'tsdown';

import { getConfig, initConfig } from '../utils/config.js';
import { logFatalError, logNonFatalError } from '../utils/error-logging.js';
import {
  cleanBuild,
  getPackageBuilds,
  getAllBuildFiles,
  getSourcePath,
  getTsupEntryForFormat,
  isBinaryPackage,
  shouldGenerateTypes,
  validateFormatsBin,
  makeGitignore,
  makeProxies,
  writePackageJson,
  isPackageJsonFrozen,
  FREEZE_PACKAGE_JSON_ENV,
  PackageError,
  ConfigurationError,
} from '../utils/package.js';

/**
 * Build options type definition
 * @typedef {Object} BuildOptions
 * @property {string} path - Package path to build
 * @property {boolean} watch - Watch for file changes and rebuild
 * @property {boolean} typesOnly - Only build TypeScript type definitions (production-types mode)
 * @property {boolean} verbose - Enable verbose logging
 */

/**
 * Build command implementation with comprehensive error handling
 * @param {BuildOptions} options - Build command options
 * @returns {Promise<void>} Build completion promise
 */
export async function buildCommand(options) {
  const { path: packagePath, watch: watchMode, typesOnly, verbose } = options;

  // Initialize config before any operations
  await initConfig(packagePath);

  console.log(chalk.blue(`🔨 Building package at: ${packagePath}`));
  if (typesOnly) {
    console.log(
      chalk.blue(
        '📘 Types-only mode: building type definitions only (production-types mode)',
      ),
    );
  }
  if (watchMode) {
    console.log(chalk.blue('👀 Watch mode enabled - will rebuild on changes'));
  }

  // When frozen, build emits artifacts but leaves root package.json untouched
  // (keeps Turbo remote cache warm — see docs/build.md).
  const frozen = isPackageJsonFrozen();
  if (frozen) {
    console.log(
      chalk.gray(
        `📌 ${FREEZE_PACKAGE_JSON_ENV} set — leaving package.json untouched`,
      ),
    );
  }

  // Set production environment
  Object.defineProperty(process.env, 'NODE_ENV', {
    writable: true,
    enumerable: true,
    configurable: true,
    value: 'production',
  });

  try {
    // Step 1: Clean existing build artifacts (skip for types-only mode to preserve existing builds)
    if (typesOnly) {
      console.log(
        chalk.gray(
          '📝 Step 1: Skipping clean (types-only mode preserves existing builds)...',
        ),
      );
    } else {
      console.log(chalk.gray('📝 Step 1: Cleaning build artifacts...'));
      cleanBuild(packagePath);
    }

    // Step 2: Validate and get source configuration
    console.log(chalk.gray('📝 Step 2: Analyzing project structure...'));
    const sourcePath = getSourcePath(packagePath);
    validateFormatsBin(packagePath);
    const builds = getPackageBuilds(packagePath);
    const entry = getAllBuildFiles(sourcePath);

    if (verbose) {
      console.log(chalk.gray(`   Source path: ${sourcePath}`));
      console.log(
        chalk.gray(`   Entry points: ${Object.keys(entry).join(', ')}`),
      );
      console.log(
        chalk.gray(`   Build formats: ${Object.keys(builds).join(', ')}`),
      );
    }

    // Step 3: Create build directories
    console.log(chalk.gray('📝 Step 3: Creating build directories...'));
    const buildDirs = Object.values(builds).filter(Boolean);

    await Promise.all(
      buildDirs.map(async (buildDir) => {
        const fullPath = path.join(packagePath, buildDir);
        await mkdir(fullPath, { recursive: true });
        if (verbose) {
          console.log(chalk.gray(`   Created: ${buildDir}/`));
        }
      }),
    );

    // Step 4: TypeScript compilation (if types generation is enabled)
    if (shouldGenerateTypes(packagePath)) {
      console.log(chalk.gray('📝 Step 4: Running TypeScript compilation...'));

      // In types-only mode, clean existing .d.ts files to avoid stale types
      if (typesOnly) {
        console.log(chalk.gray('   Cleaning existing type definitions...'));
        await cleanExistingTypes(packagePath, builds, verbose);
      }

      await runTypeScriptCompilation(packagePath, sourcePath, builds, verbose);
    } else {
      const reason = isBinaryPackage(packagePath)
        ? 'binary package'
        : 'no types field in package.json';
      console.log(
        chalk.gray(`📝 Step 4: Skipping TypeScript compilation (${reason})`),
      );
    }

    // For types-only mode, skip tsup bundling but update types fields in package.json
    if (typesOnly) {
      console.log(
        chalk.gray('📝 Step 5: Skipping tsdown bundling (types-only mode)'),
      );
      console.log(chalk.gray('📝 Step 6: Generating package metadata...'));
      makeGitignore(packagePath);
      makeProxies(packagePath, 'production-types');

      if (frozen) {
        console.log(
          chalk.gray(
            '📝 Step 7: Skipping package.json types update (frozen)...',
          ),
        );
      } else {
        console.log(
          chalk.gray(
            '📝 Step 7: Updating types fields in package.json (production-types mode)...',
          ),
        );
        console.log(
          chalk.blue(
            '   → Preserving main/module/import/require, updating only types fields',
          ),
        );
        try {
          writePackageJson(packagePath, 'production-types');
        } catch (finalError) {
          console.error(
            chalk.red(
              '❌ Failed to update package.json types fields, reverting to dev mode...',
            ),
          );
          // Log the error before attempting recovery
          logFatalError(
            finalError,
            'Failed to update package.json types fields',
          );
          try {
            writePackageJson(packagePath, 'development');
          } catch (revertError) {
            logNonFatalError(
              revertError,
              '⚠️  Failed to revert package.json to dev mode',
              verbose,
            );
          }
          throw finalError;
        }
      }
    } else {
      // Step 5: Load and apply bundler configuration
      console.log(chalk.gray('📝 Step 5: Loading build configuration...'));
      const bundlerConfigOverrides = loadBundlerConfiguration(
        packagePath,
        builds,
      );

      // Step 6: Run tsdown builds for each format
      console.log(chalk.gray('📝 Step 6: Building with tsdown...'));
      for (const [format, outDir] of Object.entries(builds)) {
        console.log(chalk.blue(`   Building ${format} format...`));

        const formatEntry = getTsupEntryForFormat(
          packagePath,
          sourcePath,
          /** @type {'cjs'|'esm'} */ (format),
        );

        // JSON sources are copied as-is instead of bundled: consumers may
        // reference them directly (e.g. tsconfig `extends` pointing at a
        // shared config), which requires raw .json files in the output.
        /** @type {Record<string, string>} */
        const bundleEntry = {};
        /** @type {Record<string, string>} */
        const jsonEntry = {};
        for (const [entryKey, entryPath] of Object.entries(formatEntry)) {
          if (entryPath.endsWith('.json')) {
            jsonEntry[entryKey] = entryPath;
          } else {
            bundleEntry[entryKey] = entryPath;
          }
        }

        /** @type {Map<string, string>} */
        const jsonDestinations = new Map();
        for (const [entryKey, entryPath] of Object.entries(jsonEntry)) {
          const destination = path.join(
            packagePath,
            outDir,
            `${entryKey}.json`,
          );
          fse.copySync(entryPath, destination);
          jsonDestinations.set(path.resolve(entryPath), destination);
          if (verbose) {
            console.log(
              chalk.gray(`   Copied JSON: ${entryKey}.json → ${outDir}/`),
            );
          }
        }

        // The bundler doesn't watch copied JSON sources — re-copy on change
        // ourselves. The watcher also keeps the process alive for
        // JSON-only formats, where no bundler watcher exists.
        if (watchMode && jsonDestinations.size > 0) {
          chokidar
            .watch([...jsonDestinations.keys()])
            .on('change', (changedPath) => {
              const destination = jsonDestinations.get(
                path.resolve(changedPath),
              );
              if (!destination) {
                return;
              }
              try {
                fse.copySync(changedPath, destination);
                console.log(
                  chalk.gray(
                    `   Re-copied JSON: ${path.relative(packagePath, changedPath)}`,
                  ),
                );
              } catch (error) {
                logNonFatalError(
                  error,
                  `Failed to re-copy JSON: ${changedPath}`,
                  verbose,
                );
              }
            });
        }

        if (Object.keys(bundleEntry).length === 0) {
          console.log(
            chalk.green(`   ✅ ${format} build completed (JSON only)`),
          );
          continue;
        }

        // Chunks must use the same extension convention as entries:
        // consumer packages are `"type": "module"`, so a `.js` chunk would be
        // parsed as ESM when required from CJS output.
        const jsExtension = format === 'cjs' ? '.cjs' : '.js';

        try {
          // In watch mode tsdown resolves before the initial build finishes
          // writing outputs, but later steps (package.json finalization)
          // need them on disk — so block on the first `build:done`.
          /** @type {(() => void) | undefined} */
          let resolveInitialBuild;
          const initialBuild = new Promise((resolve) => {
            resolveInitialBuild = () => resolve(undefined);
          });

          const overrides = bundlerConfigOverrides[format] || {};
          // Merge (rather than replace) user outputOptions/hooks when they
          // are plain objects; the function forms can't be merged and are
          // superseded by libsync's own values.
          const userOutputOptions =
            typeof overrides.outputOptions === 'object'
              ? overrides.outputOptions
              : undefined;
          const userHooks =
            typeof overrides.hooks === 'object' ? overrides.hooks : undefined;

          await build({
            ...overrides,
            entry: bundleEntry,
            format: /** @type {'cjs'|'esm'} */ (format),
            outDir: path.join(packagePath, outDir),
            watch: watchMode,
            // libsync owns cleaning (step 1) and tsc has already emitted
            // .d.ts files into outDir (step 4) — tsdown must not wipe them.
            clean: false,
            // Types come from the tsc step, never from tsdown.
            dts: false,
            // Don't auto-discover tsdown.config files; libsync passes the
            // resolved configuration explicitly.
            config: false,
            outExtensions: () => ({ js: jsExtension }),
            outputOptions: {
              ...userOutputOptions,
              chunkFileNames: `__chunks/[hash]${jsExtension}`,
            },
            hooks: {
              ...userHooks,
              'build:done': async (ctx) => {
                await userHooks?.['build:done']?.(ctx);
                resolveInitialBuild?.();
              },
            },
          });

          if (watchMode) {
            await initialBuild;
          }

          console.log(chalk.green(`   ✅ ${format} build completed`));
        } catch (error) {
          throw new PackageError(
            `Failed to build ${format} format: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      // Step 7: Generate .gitignore and proxies (proxies already cleaned in step 1)
      console.log(chalk.gray('📝 Step 7: Generating package metadata...'));
      makeGitignore(packagePath);
      makeProxies(packagePath, 'production');

      // Step 8: Final step - Update package.json to production mode (only if everything succeeded)
      if (frozen) {
        console.log(
          chalk.gray(
            '📝 Step 8: Skipping package.json finalization (frozen)...',
          ),
        );
      } else {
        console.log(
          chalk.gray('📝 Step 8: Finalizing package.json for production...'),
        );
        try {
          writePackageJson(packagePath, 'production');
        } catch (finalError) {
          // If final step fails, ensure package.json is in dev mode
          console.error(
            chalk.red(
              '❌ Failed to finalize package.json, reverting to dev mode...',
            ),
          );
          // Log the error before attempting recovery
          logFatalError(finalError, 'Failed to finalize package.json');
          try {
            writePackageJson(packagePath, 'development');
          } catch (revertError) {
            logNonFatalError(
              revertError,
              '⚠️  Failed to revert package.json to dev mode',
              verbose,
            );
          }
          throw finalError;
        }
      }
    }

    if (watchMode) {
      console.log(chalk.green(`\n✅ Initial build completed!`));
      console.log(
        chalk.blue('👀 Watching for changes... Press Ctrl+C to stop'),
      );
    } else {
      console.log(chalk.green(`\n🎉 Build completed successfully!`));
    }
  } catch (error) {
    // Ensure package.json is in dev mode if build fails at any step — unless
    // frozen, in which case no swap ever happened and there is nothing to undo.
    if (!frozen) {
      try {
        console.error(
          chalk.yellow('🔄 Reverting package.json to development mode...'),
        );
        writePackageJson(packagePath, 'development');
      } catch (revertError) {
        logNonFatalError(
          revertError,
          '⚠️  Failed to revert package.json to dev mode',
          verbose,
        );
      }
    }

    if (error instanceof ConfigurationError) {
      console.error(chalk.red('\n❌ Configuration Error:'));
      console.error(chalk.red(`   ${error.message}`));

      if (error.suggestions.length > 0) {
        console.error(chalk.yellow('\n💡 Suggestions to fix this:'));
        error.suggestions.forEach((suggestion) => {
          console.error(chalk.yellow(`   • ${suggestion}`));
        });
      }

      // Fatal errors always show full details
      if (error.stack) {
        console.error(chalk.gray('\n   Full error details:'));
        console.error(chalk.gray(error.stack));
      }
    } else if (error instanceof PackageError) {
      console.error(chalk.red('\n❌ Package Error:'));
      console.error(chalk.red(`   ${error.message}`));
      if (error.packagePath) {
        console.error(chalk.gray(`   Package: ${error.packagePath}`));
      }

      // Fatal errors always show full details
      if (error.stack) {
        console.error(chalk.gray('\n   Full error details:'));
        console.error(chalk.gray(error.stack));
      }
    } else {
      // Unexpected errors are always fatal - log full details
      console.error(chalk.red('\n❌ Unexpected error:'));
      if (error instanceof Error) {
        console.error(chalk.red(`   ${error.message}`));
        if (error.stack) {
          console.error(chalk.gray('\n   Full error details:'));
          console.error(chalk.gray(error.stack));
        }
      } else {
        console.error(chalk.red(`   ${String(error)}`));
      }
    }

    throw error; // Re-throw for proper CLI error handling
  }
}

/**
 * Clean existing .d.ts files from build directories
 * @param {string} packagePath - Package path
 * @param {Record<string, string>} builds - Build configurations
 * @param {boolean} verbose - Enable verbose logging
 * @returns {Promise<void>} Cleanup promise
 */
async function cleanExistingTypes(packagePath, builds, verbose) {
  const buildDirs = Object.values(builds).filter(Boolean);

  /**
   * Recursively find all .d.ts files in a directory
   * @param {string} dir - Directory to search
   * @returns {Promise<string[]>} Array of .d.ts file paths
   */
  async function findDtsFiles(dir) {
    /** @type {string[]} */
    const files = [];

    /**
     * Walk directory recursively
     * @param {string} currentDir - Current directory path
     */
    async function walk(currentDir) {
      const entries = await fse.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.d.ts')) {
          files.push(fullPath);
        }
      }
    }

    try {
      await walk(dir);
    } catch (error) {
      // Non-fatal: directory walk may fail if directory doesn't exist or is inaccessible
      logNonFatalError(error, `Failed to walk directory: ${dir}`, verbose);
    }

    return files;
  }

  for (const buildDir of buildDirs) {
    const fullPath = path.join(packagePath, buildDir);
    if (fse.existsSync(fullPath)) {
      const dtsFiles = await findDtsFiles(fullPath);

      for (const dtsFile of dtsFiles) {
        try {
          await rm(dtsFile, { force: true });
          if (verbose) {
            console.log(
              chalk.gray(`   Removed: ${path.relative(packagePath, dtsFile)}`),
            );
          }
        } catch (error) {
          // Non-fatal: file removal may fail if file is locked or doesn't exist
          logNonFatalError(
            error,
            `Failed to remove: ${path.relative(packagePath, dtsFile)}`,
            verbose,
          );
        }
      }

      if (verbose && dtsFiles.length > 0) {
        console.log(
          chalk.gray(
            `   Cleaned ${dtsFiles.length} type definition files from ${buildDir}`,
          ),
        );
      }
    }
  }
}

/**
 * Run TypeScript compilation step
 * @param {string} packagePath - Package path
 * @param {string} sourcePath - Source directory path
 * @param {Record<string, string>} builds - Build configurations
 * @param {boolean} verbose - Enable verbose logging
 * @returns {Promise<void>} Compilation promise
 */
async function runTypeScriptCompilation(
  packagePath,
  sourcePath,
  builds,
  verbose,
) {
  const config = getConfig();
  const buildTSConfigPath = path.join(
    packagePath,
    config?.typescript?.buildConfigFile || 'tsconfig.build.json',
  );

  if (!fse.existsSync(buildTSConfigPath)) {
    console.log(
      chalk.yellow(
        '   ⚠️  tsconfig.build.json not found, skipping TypeScript compilation',
      ),
    );
    return;
  }

  try {
    const tsconfig =
      /** @type {import('../schemas/commands-config.js').TsConfig} */ (
        fse.readJSONSync(buildTSConfigPath)
      );

    // Clear TypeScript build cache
    const tsBuildCachePath = path.join(
      packagePath,
      config?.typescript?.buildCacheFile ||
        tsconfig.compilerOptions?.tsBuildInfoFile ||
        '.cache/tsbuildinfo.json',
    );

    if (fse.existsSync(tsBuildCachePath)) {
      await rm(tsBuildCachePath, { recursive: true, force: true });
      if (verbose) {
        console.log(chalk.gray(`   Cleared TS cache: ${tsBuildCachePath}`));
      }
    }

    // Determine output directory
    const outDir = builds.esm || builds.cjs;
    if (!outDir) {
      throw new ConfigurationError(
        'No output directory available for TypeScript compilation',
        ['Ensure package.json has either "main" or "module" field configured'],
      );
    }

    // Run TypeScript compiler
    const runner = config?.typescript?.runner || 'tsc';
    const runnerName = runner === 'tsgo' ? 'tsgo' : 'tsc';

    const tscArgs = [
      '--project',
      buildTSConfigPath,
      '--emitDeclarationOnly',
      '--noEmit',
      'false',
      '--outDir',
      outDir,
      '--tsBuildInfoFile',
      tsBuildCachePath,
    ];

    if (verbose) {
      console.log(chalk.gray(`   Running: ${runnerName} ${tscArgs.join(' ')}`));
    }

    const tscProcess = spawn.sync(runnerName, tscArgs, {
      stdio: verbose ? 'inherit' : 'pipe',
      cwd: packagePath,
      encoding: 'utf8',
    });

    if (tscProcess.error) {
      // Enhanced error message for tsgo
      if (
        runner === 'tsgo' &&
        'code' in tscProcess.error &&
        tscProcess.error.code === 'ENOENT'
      ) {
        throw new PackageError(
          `TypeScript runner 'tsgo' not found. Install with: npm install -g @typescript/native-preview\n` +
            `Or switch to 'tsc' in your libsync.config.mjs`,
          packagePath,
        );
      }
      throw new PackageError(
        `Failed to run TypeScript compiler: ${tscProcess.error.message}`,
        packagePath,
      );
    }

    if (tscProcess.status !== 0) {
      // Capture TypeScript error output
      const errorOutput =
        tscProcess.stderr?.toString() || tscProcess.stdout?.toString() || '';
      const errorMessage = errorOutput
        ? `TypeScript compilation failed:\n${errorOutput}`
        : `TypeScript compilation failed with exit code ${tscProcess.status}`;

      // Always show TypeScript errors, even if not in verbose mode
      if (!verbose && errorOutput) {
        console.error(chalk.red('\n   TypeScript compilation errors:'));
        console.error(chalk.red(errorOutput));
      }

      throw new PackageError(errorMessage.trim(), packagePath);
    }

    console.log(chalk.green(`   ✅ TypeScript compilation completed`));

    // Copy ESM to CJS if both formats are needed
    if (builds.esm && builds.cjs && builds.esm !== builds.cjs) {
      const esmPath = path.join(packagePath, builds.esm);
      const cjsPath = path.join(packagePath, builds.cjs);

      if (verbose) {
        console.log(chalk.gray(`   Copying ${builds.esm} → ${builds.cjs}`));
      }

      fse.copySync(esmPath, cjsPath);
      console.log(chalk.green(`   ✅ Copied type definitions to CJS output`));
    }
  } catch (error) {
    if (error instanceof ConfigurationError || error instanceof PackageError) {
      throw error;
    }

    throw new PackageError(
      `TypeScript compilation setup failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Load bundler (tsdown) configuration from libsync.config.mjs.
 * Standalone bundler config files (tsup.config.*, tsdown.config.*) are not
 * read — libsync.config.mjs `commands.build.bundler` is the only source.
 * @param {string} packagePath - Package path
 * @param {Record<string, string>} builds - Build configurations
 * @returns {Record<string, any>} Tsdown configuration overrides per format
 */
function loadBundlerConfiguration(packagePath, builds) {
  const config = getConfig();

  // Surface leftover standalone config files so their silence isn't mistaken
  // for them being applied.
  const ignoredConfigFile = [
    'tsdown.config.js',
    'tsdown.config.mjs',
    'tsup.config.js',
    'tsup.config.mjs',
  ].find((fileName) => fse.existsSync(path.join(packagePath, fileName)));

  if (ignoredConfigFile) {
    console.warn(
      chalk.yellow(
        `   ⚠️  ${ignoredConfigFile} is ignored — move bundler options to commands.build.bundler in libsync.config.mjs`,
      ),
    );
  }

  const inlineConfig = config?.commands?.build?.bundler;

  if (inlineConfig) {
    console.log(
      chalk.gray('   Loading bundler config from libsync.config.mjs...'),
    );

    // Check if it's a function
    if (typeof inlineConfig === 'function') {
      // Function format: (options) => config
      return Object.keys(builds).reduce(
        (acc, format) => ({
          ...acc,
          [format]: inlineConfig({ type: /** @type {'esm'|'cjs'} */ (format) }),
        }),
        /** @type {Record<string, any>} */ ({}),
      );
    } else {
      // Object format: apply same config to all formats
      return Object.keys(builds).reduce(
        (acc, format) => ({
          ...acc,
          [format]: inlineConfig,
        }),
        /** @type {Record<string, any>} */ ({}),
      );
    }
  }

  console.log(chalk.gray('   Using default tsdown configuration'));
  return Object.keys(builds).reduce(
    (acc, format) => ({
      ...acc,
      [format]: undefined,
    }),
    /** @type {Record<string, any>} */ ({}),
  );
}
