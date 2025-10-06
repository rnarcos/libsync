/**
 * @fileoverview Clean command implementation
 * Simple and robust build artifact cleanup
 */

import chalk from 'chalk';
import {
  cleanBuild,
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

  console.log(chalk.blue(`🧹 Cleaning build artifacts at: ${packagePath}`));

  try {
    cleanBuild(packagePath);

    if (verbose) {
      console.log(chalk.gray(`   Processed package at: ${packagePath}`));
      console.log(chalk.gray(`   Reset package.json to development mode`));
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
