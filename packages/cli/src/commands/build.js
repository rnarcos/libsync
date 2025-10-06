/**
 * @fileoverview Build command implementation
 * Comprehensive build process with TypeScript compilation, bundling, and packaging
 */

import path from 'path';
import spawn from 'cross-spawn';
import fse from 'fs-extra';
import { build } from 'tsup';
import { mkdir, rm } from 'fs/promises';
import chalk from 'chalk';
import {
  cleanBuild,
  getPackageBuilds,
  getPublicFiles,
  getAllBuildFiles,
  getSourcePath,
  isBinaryPackage,
  hasTypesField,
  makeGitignore,
  makeProxies,
  writePackageJson,
  PackageError,
  ConfigurationError,
} from '../utils/package.js';

/**
 * Build options type definition
 * @typedef {Object} BuildOptions
 * @property {string} path - Package path to build
 * @property {boolean} watch - Watch for file changes and rebuild
 * @property {boolean} verbose - Enable verbose logging
 */

/**
 * Build command implementation with comprehensive error handling
 * @param {BuildOptions} options - Build command options
 * @returns {Promise<void>} Build completion promise
 */
export async function buildCommand(options) {
  const { path: packagePath, watch: watchMode, verbose } = options;

  console.log(chalk.blue(`🔨 Building package at: ${packagePath}`));
  if (watchMode) {
    console.log(chalk.blue('👀 Watch mode enabled - will rebuild on changes'));
  }

  // Set production environment
  Object.defineProperty(process.env, 'NODE_ENV', {
    writable: true,
    enumerable: true,
    configurable: true,
    value: 'production',
  });

  try {
    // Step 1: Clean existing build artifacts
    console.log(chalk.gray('📝 Step 1: Cleaning build artifacts...'));
    cleanBuild(packagePath);

    // Step 2: Validate and get source configuration
    console.log(chalk.gray('📝 Step 2: Analyzing project structure...'));
    const sourcePath = getSourcePath(packagePath);
    const entry = getAllBuildFiles(sourcePath);
    const builds = getPackageBuilds(packagePath);

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

    // Step 4: TypeScript compilation for packages with types field
    if (hasTypesField(packagePath)) {
      console.log(chalk.gray('📝 Step 4: Running TypeScript compilation...'));
      await runTypeScriptCompilation(packagePath, builds, verbose);
    } else {
      const reason = isBinaryPackage(packagePath)
        ? 'binary package'
        : 'no types field in package.json';
      console.log(
        chalk.gray(`📝 Step 4: Skipping TypeScript compilation (${reason})`),
      );
    }

    // Step 5: Load and apply tsup configuration
    console.log(chalk.gray('📝 Step 5: Loading build configuration...'));
    const tsupConfigOverrides = await loadTsupConfiguration(
      packagePath,
      builds,
      verbose,
    );

    // Step 6: Run tsup builds for each format
    console.log(chalk.gray('📝 Step 6: Building with tsup...'));
    for (const [format, outDir] of Object.entries(builds)) {
      console.log(chalk.blue(`   Building ${format} format...`));

      try {
        await build({
          ...tsupConfigOverrides[format],
          entry,
          format: /** @type {import('tsup').Format} */ (format),
          outDir: path.join(packagePath, outDir),
          splitting: true,
          watch: watchMode,
          esbuildOptions(options) {
            options.chunkNames = '__chunks/[hash]';
          },
        });

        console.log(chalk.green(`   ✅ ${format} build completed`));
      } catch (error) {
        throw new PackageError(
          `Failed to build ${format} format: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Step 7: Generate .gitignore and proxies (but keep package.json in dev mode)
    console.log(chalk.gray('📝 Step 7: Generating package metadata...'));
    makeGitignore(packagePath);
    makeProxies(packagePath);

    // Step 8: Final step - Update package.json to production mode (only if everything succeeded)
    console.log(
      chalk.gray('📝 Step 8: Finalizing package.json for production...'),
    );
    try {
      writePackageJson(packagePath, true);
    } catch (finalError) {
      // If final step fails, ensure package.json is in dev mode
      console.error(
        chalk.red(
          '❌ Failed to finalize package.json, reverting to dev mode...',
        ),
      );
      writePackageJson(packagePath, false);
      throw finalError;
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
    // Ensure package.json is in dev mode if build fails at any step
    try {
      console.error(
        chalk.yellow('🔄 Reverting package.json to development mode...'),
      );
      writePackageJson(packagePath, false);
    } catch {
      console.error(chalk.red('⚠️  Failed to revert package.json to dev mode'));
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
    } else if (error instanceof PackageError) {
      console.error(chalk.red('\n❌ Package Error:'));
      console.error(chalk.red(`   ${error.message}`));
      if (error.packagePath) {
        console.error(chalk.gray(`   Package: ${error.packagePath}`));
      }
    } else {
      console.error(chalk.red('\n❌ Unexpected error:'));
      console.error(
        chalk.red(
          `   ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    throw error; // Re-throw for proper CLI error handling
  }
}

/**
 * Run TypeScript compilation step
 * @param {string} packagePath - Package path
 * @param {Record<string, string>} builds - Build configurations
 * @param {boolean} verbose - Enable verbose logging
 * @returns {Promise<void>} Compilation promise
 */
async function runTypeScriptCompilation(packagePath, builds, verbose) {
  const buildTSConfigPath = path.join(packagePath, 'tsconfig.build.json');

  if (!fse.existsSync(buildTSConfigPath)) {
    console.log(
      chalk.yellow(
        '   ⚠️  tsconfig.build.json not found, skipping TypeScript compilation',
      ),
    );
    return;
  }

  try {
    const tsconfig = /** @type {import('../schemas/config.js').TsConfig} */ (
      fse.readJSONSync(buildTSConfigPath)
    );

    // Clear TypeScript build cache
    const tsBuildCachePath = path.join(
      packagePath,
      tsconfig.compilerOptions?.tsBuildInfoFile ?? '.cache/tsbuildinfo.json',
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
      console.log(chalk.gray(`   Running: tsc ${tscArgs.join(' ')}`));
    }

    const { status: tscCommandStatus, error } = spawn.sync('tsc', tscArgs, {
      stdio: verbose ? 'inherit' : 'pipe',
      cwd: packagePath,
    });

    if (error) {
      throw new PackageError(
        `Failed to run TypeScript compiler: ${error.message}`,
      );
    }

    if (tscCommandStatus !== 0) {
      throw new PackageError(
        `TypeScript compilation failed with exit code ${tscCommandStatus}`,
      );
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
 * Load tsup configuration with error handling
 * @param {string} packagePath - Package path
 * @param {Record<string, string>} builds - Build configurations
 * @param {boolean} verbose - Enable verbose logging
 * @returns {Promise<Record<string, any>>} Tsup configuration overrides
 */
async function loadTsupConfiguration(packagePath, builds, verbose) {
  // Try both .js and .mjs extensions
  const tsupConfigPaths = [
    path.join(packagePath, 'tsup.config.js'),
    path.join(packagePath, 'tsup.config.mjs'),
  ];

  const tsupConfigPath = tsupConfigPaths.find((configPath) =>
    fse.existsSync(configPath),
  );

  try {
    if (tsupConfigPath) {
      const configFileName = path.basename(tsupConfigPath);
      console.log(chalk.gray(`   Loading ${configFileName}...`));

      const configModule = await import(tsupConfigPath);
      const defaultOverride = configModule.default;

      if (verbose && defaultOverride) {
        console.log(chalk.gray('   Found custom tsup configuration'));
      }

      return Object.keys(builds).reduce((accumulator, buildFormat) => {
        const buildSpecificOverride = configModule[buildFormat];
        return {
          ...accumulator,
          [buildFormat]: buildSpecificOverride || defaultOverride,
        };
      }, /** @type {Record<string, any>} */ ({}));
    } else {
      console.log(chalk.gray('   Using default tsup configuration'));

      return Object.keys(builds).reduce(
        (accumulator, buildFormat) => ({
          ...accumulator,
          [buildFormat]: undefined,
        }),
        /** @type {Record<string, any>} */ ({}),
      );
    }
  } catch (error) {
    console.warn(
      chalk.yellow(
        `   Warning: Could not load tsup.config.js: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    console.warn(chalk.yellow('   Falling back to default configuration'));

    return Object.keys(builds).reduce(
      (accumulator, buildFormat) => ({
        ...accumulator,
        [buildFormat]: undefined,
      }),
      /** @type {Record<string, any>} */ ({}),
    );
  }
}
