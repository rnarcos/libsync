/**
 * @fileoverview Pattern matching utilities
 * Provides utilities for matching files against glob and regex patterns
 */

import { minimatch } from 'minimatch';

/**
 * Check if filename matches any of the provided patterns
 * Supports both glob patterns and regex patterns
 * @param {string} filename - Filename to check
 * @param {string[]} patterns - Array of glob or regex patterns
 * @returns {boolean}
 */
export function matchesAnyPattern(filename, patterns) {
  return patterns.some((pattern) => {
    // Regex pattern format: /pattern/
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      const regex = new RegExp(pattern.slice(1, -1));
      return regex.test(filename);
    }
    // Glob pattern
    return minimatch(filename, pattern);
  });
}
