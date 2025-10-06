/**
 * @fileoverview Dev command implementation
 * Development package.json generation with monorepo and single-repo support
 */

import { basename } from 'path';
import { existsSync } from 'fs';
import chalk from 'chalk';
import { watch } from 'chokidar';
import {
  shouldProcessInDev,
  readPackageJson,
  writePackageJson,
  PackageError,
  ConfigurationError,
  groupPathsByPackage,
} from '../utils/package.js';

/**
 * Dev options type definition
 * @typedef {Object} DevOptions
 * @property {boolean} watch - Watch for file changes
 * @property {string} path - Package path to process
 * @property {string[]} [paths] - Multiple paths to process (optional)
 * @property {boolean} verbose - Enable verbose logging
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
 * Dev command implementation - processes packages based on provided paths
 * @param {DevOptions} options - Dev command options
 * @returns {Promise<void>} Dev completion promise
 */
export async function devCommand(options) {
  const { watch: watchMode, path: packagePath, paths, verbose } = options;

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

        await processCurrentPackage(pkgPath, verbose);
      }

      if (watchMode) {
        console.log(chalk.blue('\n👀 Starting watch mode for all packages...'));
        await startWatchModeForMultiplePackages(
          Array.from(packageGroups.keys()),
          verbose,
        );
      } else {
        console.log(
          chalk.green(
            '\n✅ Development package.json processing completed for all packages!',
          ),
        );
      }
    } else {
      // Single package mode (original behavior)
      console.log(chalk.blue(`📦 Processing development package.json...`));
      console.log(chalk.gray(`   Package path: ${packagePath}`));

      await processCurrentPackage(packagePath, verbose);

      if (watchMode) {
        await startWatchMode(packagePath, verbose);
      } else {
        console.log(
          chalk.green('✅ Development package.json processing completed!'),
        );
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
 * Process the current package
 * @param {string} packagePath - Package path
 * @param {boolean} verbose - Enable verbose logging
 * @returns {Promise<void>} Processing promise
 */
async function processCurrentPackage(packagePath, verbose) {
  try {
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

    writePackageJson(packagePath);
    console.log(chalk.green(`   ✅ Updated ${packageInfo.name}`));

    if (verbose) {
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
 * @param {boolean} verbose - Enable verbose logging
 * @returns {Promise<void>} Watch mode promise
 */
async function startWatchMode(packagePath, verbose) {
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

      writePackageJson(packagePath);
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
 * @param {boolean} verbose - Enable verbose logging
 * @returns {Promise<void>} Watch mode promise
 */
async function startWatchModeForMultiplePackages(packagePaths, verbose) {
  console.log(chalk.blue('\n👀 Starting watch mode for multiple packages...'));
  console.log(chalk.yellow('Press Ctrl+C to stop watching\n'));

  const watchers = packagePaths.map((packagePath) => {
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

        writePackageJson(packagePath);
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
