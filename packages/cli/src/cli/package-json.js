/**
 * @fileoverview Package.json command implementation
 * Package.json generation with monorepo and single-repo support for production and development modes
 */

import { existsSync } from 'fs';
import { basename } from 'path';

import chalk from 'chalk';
import { watch } from 'chokidar';

import { initConfig } from '../utils/config.js';
import {
  shouldProcessInDev,
  readPackageJson,
  writePackageJson,
  makeProxies,
  makeGitignore,
  PackageError,
  ConfigurationError,
  groupPathsByPackage,
} from '../utils/package.js';

/**
 * Package.json options type definition
 * @typedef {Object} PackageJsonOptions
 * @property {string} mode - Mode: 'production' or 'development'
 * @property {boolean} watch - Watch for file changes
 * @property {string} path - Package path to process
 * @property {string[]} [paths] - Multiple paths to process (optional)
 * @property {boolean} verbose - Enable verbose logging
 * @property {boolean} check - Check mode: validate without writing
 * @property {boolean} write - Write mode: update package.json files
 */

/**
 * Package information structure
 * @typedef {Object} PackageInfo
 * @property {string} path - Package path
 * @property {string} name - Package name
 * @property {boolean} isValid - Whether package is valid
 * @property {string} [error] - Error message if invalid
 */

/**
 * Package.json command implementation - processes packages based on provided paths
 * @param {PackageJsonOptions} options - Package.json command options
 * @returns {Promise<void>} Processing completion promise
 */
export async function packageJsonCommand(options) {
  const {
    watch: watchMode,
    path: packagePath,
    paths,
    verbose,
    mode,
    check,
    write,
  } = options;

  // Check mode cannot be used with watch mode
  if (check && watchMode) {
    throw new Error('Cannot use --check with --watch mode');
  }

  try {
    // If multiple paths are provided, group them by package and process each
    if (paths && paths.length > 0) {
      console.log(chalk.blue(`📦 Processing ${paths.length} path(s)...`));

      const packageGroups = groupPathsByPackage(paths);

      if (packageGroups.size === 0) {
        console.error(
          chalk.yellow('⚠️  No valid packages found for the provided paths'),
        );
        return;
      }

      console.log(
        chalk.blue(
          `\n📦 Found ${packageGroups.size} unique package(s) to process\n`,
        ),
      );

      // Process each unique package
      for (const [pkgPath, associatedPaths] of packageGroups.entries()) {
        console.log(chalk.blue(`\n📦 Processing package at: ${pkgPath}`));
        console.log(
          chalk.gray(`   Associated paths: ${associatedPaths.length}`),
        );
        if (verbose) {
          associatedPaths.forEach((p) => {
            console.log(chalk.gray(`     - ${p}`));
          });
        }

        await processCurrentPackage(pkgPath, mode, verbose, check, write);
      }

      if (watchMode) {
        console.log(chalk.blue('\n👀 Starting watch mode for all packages...'));
        await startWatchModeForMultiplePackages(
          Array.from(packageGroups.keys()),
          mode,
          verbose,
        );
      } else {
        console.log(
          chalk.green(
            `\n✅ ${mode.charAt(0).toUpperCase() + mode.slice(1)} package.json processing completed for all packages!`,
          ),
        );
      }
    } else {
      // Single package mode (original behavior)
      if (check) {
        console.log(
          chalk.blue(`📦 Checking ${mode} package.json configuration...`),
        );
      } else {
        console.log(chalk.blue(`📦 Processing ${mode} package.json...`));
      }
      console.log(chalk.gray(`   Package path: ${packagePath}`));

      await processCurrentPackage(packagePath, mode, verbose, check, write);

      if (watchMode) {
        await startWatchMode(packagePath, mode, verbose);
      } else {
        if (check) {
          console.log(
            chalk.green(
              `✅ ${mode.charAt(0).toUpperCase() + mode.slice(1)} package.json check passed!`,
            ),
          );
        } else {
          console.log(
            chalk.green(
              `✅ ${mode.charAt(0).toUpperCase() + mode.slice(1)} package.json processing completed!`,
            ),
          );
        }
        console.log(chalk.gray(`   Package path: ${packagePath}`));
      }
    }
  } catch (error) {
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
 * Process the current package
 * @param {string} packagePath - Package path
 * @param {string} mode - Mode: 'production' or 'development'
 * @param {boolean} verbose - Enable verbose logging
 * @param {boolean} check - Check mode: validate without writing
 * @param {boolean} _write - Write mode: update package.json files
 * @returns {Promise<void>} Processing promise
 */
async function processCurrentPackage(
  packagePath,
  mode,
  verbose,
  check = false,
  _write = true,
) {
  try {
    // Initialize config before processing package
    await initConfig(packagePath);

    const packageInfo = analyzePackage(packagePath);

    if (!packageInfo.isValid) {
      throw new ConfigurationError(
        `Invalid package at ${packagePath}: ${packageInfo.error}`,
        [
          'Ensure package.json exists and is valid',
          'Check that the package has proper name and structure',
          'Verify src/ directory exists with source files',
        ],
      );
    }

    if (!shouldProcessInDev(packagePath)) {
      console.log(
        chalk.gray(`   Skipping pure CLI package: ${packageInfo.name}`),
      );
      return;
    }

    const hasChanges = writePackageJson(packagePath, mode, check);

    if (check) {
      // In check mode, we validate without writing
      if (!hasChanges) {
        console.log(chalk.green(`   ✅ ${packageInfo.name} is up to date`));
      } else {
        throw new PackageError(
          `Package.json for ${packageInfo.name} does not match expected ${mode} configuration`,
        );
      }
    } else {
      // In write mode, update everything
      makeProxies(packagePath, mode);
      makeGitignore(packagePath); // Update .gitignore with proxies (if writeToGitIgnore is true)
      console.log(chalk.green(`   ✅ Updated ${packageInfo.name}`));
    }

    if (verbose) {
      console.log(
        chalk.gray(
          `   ${mode.charAt(0).toUpperCase() + mode.slice(1)} mode: package.json and proxies point to ${mode === 'production' ? 'build output' : 'src/'}`,
        ),
      );
      console.log(
        chalk.gray(`   Package: ${packageInfo.name} at ${packagePath}`),
      );
    }
  } catch (error) {
    throw new PackageError(
      `Failed to process package: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Start watch mode for file changes in the current package
 * @param {string} packagePath - Package path
 * @param {string} mode - Mode: 'production' or 'development'
 * @param {boolean} verbose - Enable verbose logging
 * @returns {Promise<void>} Watch mode promise
 */
async function startWatchMode(packagePath, mode, verbose) {
  console.log(chalk.blue('\n👀 Starting watch mode...'));
  console.log(chalk.yellow('Press Ctrl+C to stop watching\n'));

  const watcher = watch(['src/**/*'], {
    ignoreInitial: true,
    cwd: packagePath,
    ignored: ['**/*.test.*', '**/*.spec.*', '**/node_modules/**', '**/.git/**'],
  });

  /**
   * Process file changes
   * @param {string} filePath - Changed file path
   */
  const processFileChange = (filePath) => {
    try {
      const packageInfo = analyzePackage(packagePath);

      if (!packageInfo.isValid || !shouldProcessInDev(packagePath)) {
        if (verbose) {
          console.log(
            chalk.gray(
              `   Ignored: ${packageInfo.name || filePath} (${!packageInfo.isValid ? 'invalid' : 'pure CLI'} package)`,
            ),
          );
        }
        return;
      }

      writePackageJson(packagePath, mode);
      makeProxies(packagePath, mode);
      makeGitignore(packagePath);
      console.log(chalk.blue(`🔄 Updated ${packageInfo.name} (${filePath})`));
    } catch (error) {
      console.warn(
        chalk.yellow(
          `⚠️  Error processing ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  };

  watcher
    .on('add', processFileChange)
    .on('unlink', processFileChange)
    .on('unlinkDir', (dirPath) => {
      if (verbose) {
        console.log(chalk.gray(`📂 Directory removed: ${dirPath}`));
      }
    })
    .on('error', (error) => {
      console.error(chalk.red(`❌ Watch error: ${error.message}`));
    });

  console.log(chalk.green('✅ Watch mode started successfully'));
}

/**
 * Start watch mode for multiple packages
 * @param {string[]} packagePaths - Array of package paths
 * @param {string} mode - Mode: 'production' or 'development'
 * @param {boolean} verbose - Enable verbose logging
 * @returns {Promise<void>} Watch mode promise
 */
async function startWatchModeForMultiplePackages(packagePaths, mode, verbose) {
  console.log(chalk.blue('\n👀 Starting watch mode for multiple packages...'));
  console.log(chalk.yellow('Press Ctrl+C to stop watching\n'));

  const _watchers = packagePaths.map((packagePath) => {
    const packageInfo = analyzePackage(packagePath);
    const packageName = packageInfo.name || basename(packagePath);

    const watcher = watch(['src/**/*'], {
      ignoreInitial: true,
      cwd: packagePath,
      ignored: [
        '**/*.test.*',
        '**/*.spec.*',
        '**/node_modules/**',
        '**/.git/**',
      ],
    });

    /**
     * Process file changes
     * @param {string} filePath - Changed file path
     */
    const processFileChange = (filePath) => {
      try {
        const pkgInfo = analyzePackage(packagePath);

        if (!pkgInfo.isValid || !shouldProcessInDev(packagePath)) {
          if (verbose) {
            console.log(
              chalk.gray(
                `   Ignored: ${pkgInfo.name || filePath} (${!pkgInfo.isValid ? 'invalid' : 'pure CLI'} package)`,
              ),
            );
          }
          return;
        }

        writePackageJson(packagePath, mode);
        makeProxies(packagePath, mode);
        makeGitignore(packagePath);
        console.log(chalk.blue(`🔄 Updated ${pkgInfo.name} (${filePath})`));
      } catch (error) {
        console.warn(
          chalk.yellow(
            `⚠️  Error processing ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      }
    };

    watcher
      .on('add', processFileChange)
      .on('unlink', processFileChange)
      .on('unlinkDir', (dirPath) => {
        if (verbose) {
          console.log(
            chalk.gray(`📂 Directory removed in ${packageName}: ${dirPath}`),
          );
        }
      })
      .on('error', (error) => {
        console.error(
          chalk.red(`❌ Watch error in ${packageName}: ${error.message}`),
        );
      });

    return watcher;
  });

  console.log(
    chalk.green(`✅ Watch mode started for ${packagePaths.length} package(s)`),
  );

  // Keep process running
  await new Promise(() => {});
}

/**
 * Analyze a package and return its information
 * @param {string} packagePath - Package path to analyze
 * @returns {PackageInfo} Package information
 */
function analyzePackage(packagePath) {
  try {
    if (!existsSync(packagePath)) {
      return {
        path: packagePath,
        name: basename(packagePath),
        isValid: false,
        error: 'Package directory does not exist',
      };
    }

    const pkg = readPackageJson(packagePath);

    return {
      path: packagePath,
      name: pkg.name,
      isValid: true,
    };
  } catch (error) {
    return {
      path: packagePath,
      name: basename(packagePath),
      isValid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
