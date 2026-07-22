/**
 * @fileoverview Clean command implementation
 * Simple and robust build artifact cleanup
 */

import chalk from 'chalk';

import { initConfig } from '../utils/config.js';
import {
  cleanBuild,
  writePackageJson,
  isPackageJsonFrozen,
  FREEZE_PACKAGE_JSON_ENV,
  PackageError,
  ConfigurationError,
} from '../utils/package.js';

/**
 * Clean options type definition
 * @typedef {Object} CleanOptions
 * @property {string} path - Package path to clean
 * @property {boolean} verbose - Enable verbose logging
 */

/**
 * Clean command implementation with comprehensive error handling
 * @param {CleanOptions} options - Clean command options
 * @returns {Promise<void>} Clean completion promise
 */
export async function cleanCommand(options) {
  const { path: packagePath, verbose } = options;

  // Initialize config before any operations
  await initConfig(packagePath);

  console.log(chalk.blue(`🧹 Cleaning build artifacts at: ${packagePath}`));

  const frozen = isPackageJsonFrozen();

  try {
    // Reset package.json to development mode (clean command should restore dev
    // state) — unless frozen, in which case leave package.json untouched.
    if (frozen) {
      console.log(
        chalk.gray(
          `📌 ${FREEZE_PACKAGE_JSON_ENV} set — leaving package.json untouched`,
        ),
      );
    } else {
      writePackageJson(packagePath, 'development');
    }

    cleanBuild(packagePath);

    if (verbose) {
      console.log(chalk.gray(`   Processed package at: ${packagePath}`));
      if (frozen) {
        console.log(chalk.gray(`   Skipped package.json reset (frozen)`));
      } else {
        console.log(chalk.gray(`   Reset package.json to development mode`));
      }
      console.log(chalk.gray(`   Removed all build directories`));
    }

    console.log(chalk.green('✅ Clean completed successfully!'));
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
      console.error(chalk.red('\n❌ Unexpected error during clean:'));
      console.error(
        chalk.red(
          `   ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    throw error; // Re-throw for proper CLI error handling
  }
}
