/**
 * @fileoverview Error logging utilities
 * Provides consistent error reporting with support for fatal and non-fatal errors
 */

import chalk from 'chalk';

/**
 * Log an error with appropriate detail level
 * @param {Error | unknown} error - The error to log
 * @param {Object} options - Logging options
 * @param {boolean} [options.fatal=false] - Whether this is a fatal error (always logs full details)
 * @param {string} [options.context] - Context description (e.g., "Failed to revert package.json")
 * @param {boolean} [options.verbose=false] - Whether verbose logging is enabled
 * @returns {void}
 */
export function logError(error, options = {}) {
  const { fatal = false, context, verbose = false } = options;

  // Determine if we should show full error details
  const showFullDetails = fatal || verbose;

  // Get error message and stack
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  // Log context if provided
  if (context) {
    console.error(chalk.red(`   ${context}`));
  }

  // Always log the error message
  if (errorMessage) {
    console.error(chalk.red(`   Error: ${errorMessage}`));
  }

  // For fatal errors or verbose mode, always log full stack trace
  if (showFullDetails && errorStack) {
    console.error(chalk.gray('\n   Full error details:'));
    console.error(chalk.gray(errorStack));
  } else if (errorStack && !fatal) {
    // For non-fatal errors, log a note that full details are available in verbose mode
    console.error(
      chalk.gray('   (Use --verbose flag to see full error details)'),
    );
  }
}

/**
 * Log a fatal error (always shows full details)
 * @param {Error | unknown} error - The error to log
 * @param {string} [context] - Context description
 * @returns {void}
 */
export function logFatalError(error, context) {
  logError(error, { fatal: true, context });
}

/**
 * Log a non-fatal error (shows brief description, full details in verbose mode)
 * @param {Error | unknown} error - The error to log
 * @param {string} [context] - Context description
 * @param {boolean} [verbose=false] - Whether verbose logging is enabled
 * @returns {void}
 */
export function logNonFatalError(error, context, verbose = false) {
  logError(error, { fatal: false, context, verbose });
}
