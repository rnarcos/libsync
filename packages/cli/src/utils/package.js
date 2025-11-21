/**
 * @fileoverview Package utilities for building, cleaning, and managing libraries
 * Comprehensive package.json manipulation with error handling and validation
 */

import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'fs';
import { join, resolve, dirname, sep } from 'path';

import chalk from 'chalk';
import fse from 'fs-extra';
import { rimraf } from 'rimraf';

import { packageJsonSchema } from '../schemas/commands-config.js';

import { getConfig } from './config.js';
import { matchesAnyPattern } from './patterns.js';

/**
 * Custom error class for package-related errors
 */
export class PackageError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string} [packagePath] - Optional package path where error occurred
   */
  constructor(message, packagePath) {
    super(message);
    this.name = 'PackageError';
    /** @readonly */
    this.packagePath = packagePath;
  }
}

/**
 * Custom error class for configuration errors
 */
export class ConfigurationError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string[]} [suggestions] - Suggested fixes
   */
  constructor(message, suggestions = []) {
    super(message);
    this.name = 'ConfigurationError';
    /** @readonly */
    this.suggestions = suggestions;
  }
}

/**
 * Check if a path is a directory
 * @param {string} path - Path to check
 * @returns {boolean} Whether the path is a directory
 */
function isDirectory(path) {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Remove file extension from path
 * @param {string} path - File path
 * @returns {string} Path without extension
 */
export function removeExt(path) {
  return path.replace(/\.[^.]+$/, '');
}

/**
 * Check if a .d.ts file exists for a given path
 * @param {string} rootPath - Root path of the package
 * @param {string} relativePath - Relative path without extension (e.g., "esm/index")
 * @returns {boolean} Whether the .d.ts file exists
 */
function hasTypesFile(rootPath, relativePath) {
  const typesPath = join(rootPath, `${relativePath}.d.ts`);
  return existsSync(typesPath);
}

/**
 * Safely read and parse a JSON file with detailed error handling
 * @param {string} filePath - Path to JSON file
 * @returns {any} Parsed JSON content
 */
function readJsonFile(filePath) {
  if (!existsSync(filePath)) {
    throw new PackageError(`File not found: ${filePath}`);
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new PackageError(
        `Invalid JSON syntax in ${filePath}: ${error.message}`,
      );
    }
    throw new PackageError(
      `Error reading ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Read and validate package.json with comprehensive error handling
 * @param {string} rootPath - Root path of the package
 * @returns {import('../schemas/commands-config.js').PackageJson} Validated package.json content
 */
export function readPackageJson(rootPath) {
  const packagePath = resolve(rootPath);
  const pkgPath = join(packagePath, 'package.json');

  try {
    const rawPackageJson = readJsonFile(pkgPath);
    const validationResult = packageJsonSchema.safeParse(rawPackageJson);

    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      );

      throw new ConfigurationError(
        `Invalid package.json at ${pkgPath}:\n${errorMessages.map((msg) => `  • ${msg}`).join('\n')}`,
        [
          'Ensure package.json has a valid "name" field',
          'Add "main", "module", or "bin" fields for buildable packages',
          'Consider adding "type": "module" for ES module packages',
          'Verify all field values match expected formats',
        ],
      );
    }

    return validationResult.data;
  } catch (error) {
    if (error instanceof ConfigurationError || error instanceof PackageError) {
      throw error;
    }

    throw new PackageError(
      `Failed to read package.json from ${packagePath}: ${error instanceof Error ? error.message : String(error)}`,
      packagePath,
    );
  }
}

/**
 * Find the closest package.json directory by traversing up the directory tree
 * @param {string} startPath - Starting path (file or directory)
 * @returns {string | null} Directory containing package.json, or null if not found
 */
export function findClosestPackageJson(startPath) {
  try {
    let currentPath = resolve(startPath);

    // If it's a file, start from its directory
    if (existsSync(currentPath) && !isDirectory(currentPath)) {
      currentPath = dirname(currentPath);
    }

    // Traverse up the directory tree
    const root = resolve(sep); // System root directory
    while (currentPath !== root) {
      const packageJsonPath = join(currentPath, 'package.json');

      if (existsSync(packageJsonPath)) {
        return currentPath;
      }

      // Move up one directory
      const parentPath = dirname(currentPath);
      if (parentPath === currentPath) {
        // Reached the root
        break;
      }
      currentPath = parentPath;
    }

    return null;
  } catch (error) {
    console.warn(
      chalk.yellow(
        `Warning: Could not find closest package.json for ${startPath}: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    return null;
  }
}

/**
 * Group multiple paths by their closest package.json
 * @param {string[]} paths - Array of file or directory paths
 * @returns {Map<string, string[]>} Map of package directories to their associated paths
 */
export function groupPathsByPackage(paths) {
  /** @type {Map<string, string[]>} */
  const packageGroups = new Map();

  for (const path of paths) {
    const packageDir = findClosestPackageJson(path);

    if (packageDir) {
      if (!packageGroups.has(packageDir)) {
        packageGroups.set(packageDir, []);
      }
      packageGroups.get(packageDir)?.push(path);
    } else {
      console.warn(
        chalk.yellow(`⚠️  Could not find package.json for path: ${path}`),
      );
    }
  }

  return packageGroups;
}

/**
 * Check if a package is a binary package (has bin field)
 * @param {string} rootPath - Root path of the package
 * @returns {boolean} Whether the package is a binary package
 */
export function isBinaryPackage(rootPath) {
  try {
    const pkg = readPackageJson(rootPath);
    return typeof pkg.bin !== 'undefined';
  } catch (error) {
    console.warn(
      chalk.yellow(
        `Warning: Could not determine if package is binary: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    return false;
  }
}

/**
 * Check if a package is a pure CLI package (bin only, no library exports)
 * @param {string} rootPath - Root path of the package
 * @returns {boolean} Whether the package is a pure CLI package
 */
export function isPureCLIPackage(rootPath) {
  try {
    const pkg = readPackageJson(rootPath);
    // Pure CLI: has bin but no main/module fields
    return typeof pkg.bin !== 'undefined' && !pkg.main && !pkg.module;
  } catch (error) {
    console.warn(
      chalk.yellow(
        `Warning: Could not determine if package is pure CLI: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    return false;
  }
}

/**
 * Check if a package should be processed in dev mode (library or dual-purpose)
 * @param {string} rootPath - Root path of the package
 * @returns {boolean} Whether the package should be processed
 */
export function shouldProcessInDev(rootPath) {
  try {
    const pkg = readPackageJson(rootPath);
    // Process if it has main/module fields (library or dual-purpose)
    return !!(pkg.main || pkg.module);
  } catch (error) {
    console.warn(
      chalk.yellow(
        `Warning: Could not determine if package should be processed: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    return false;
  }
}

/**
 * Check if a package has TypeScript type definitions field
 * @param {string} rootPath - Root path of the package
 * @returns {boolean} Whether the package has types field
 */
export function hasTypesField(rootPath) {
  try {
    const pkg = readPackageJson(rootPath);
    // Check for both 'types' and 'typings' fields
    return !!(pkg.types || pkg.typings);
  } catch (error) {
    console.warn(
      chalk.yellow(
        `Warning: Could not determine if package has types field: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    return false;
  }
}

/**
 * Check if TypeScript types should be generated based on config and tsconfig.build.json existence
 * @param {string} rootPath - Root path of the package
 * @returns {boolean} Whether types should be generated
 */
export function shouldGenerateTypes(rootPath) {
  try {
    const config = getConfig();

    // Get types config from formats (defaults to true)
    const generateTypes = config?.commands?.build?.formats?.types ?? true;

    if (!generateTypes) {
      return false;
    }

    // Only generate if tsconfig.build.json exists
    const buildConfigFile =
      config?.typescript?.buildConfigFile || 'tsconfig.build.json';
    const tsconfigPath = join(rootPath, buildConfigFile);

    return existsSync(tsconfigPath);
  } catch (error) {
    console.warn(
      chalk.yellow(
        `Warning: Could not determine if types should be generated: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    return false;
  }
}

/**
 * Get build configurations for different output formats
 * @param {string} rootPath - Root path of the package
 * @returns {Record<string, string>} Build format to directory mapping
 */
export function getPackageBuilds(rootPath) {
  try {
    const pkg = readPackageJson(rootPath);
    const config = getConfig();

    /** @type {Record<string, string>} */
    const builds = {};

    // Get format configuration from config (source of truth)
    const formats = config?.commands?.build?.formats || {
      cjs: 'cjs',
      esm: 'esm',
      types: true,
    };

    // Add CJS build if enabled in config
    if (formats.cjs !== false) {
      // Use explicit path from config, or fall back to directories.cjs, or default 'cjs'
      builds.cjs = typeof formats.cjs === 'string' ? formats.cjs : getCJSDir();
    }

    // Add ESM build if enabled in config
    if (formats.esm !== false) {
      // Use explicit path from config, or fall back to directories.esm, or default 'esm'
      builds.esm = typeof formats.esm === 'string' ? formats.esm : getESMDir();
    }

    // For binary packages, ensure we have at least one build format
    if (pkg.bin && Object.keys(builds).length === 0) {
      // Default to ESM for modern Node.js CLIs
      builds.esm = getESMDir();
    }

    if (Object.keys(builds).length === 0) {
      throw new ConfigurationError(
        'No build formats detected in libsync.config.mjs',
        [
          'Set "commands.build.formats.cjs" to a directory path to enable CJS output',
          'Set "commands.build.formats.esm" to a directory path to enable ESM output',
          'Set "bin" field in package.json for CLI applications',
          'Example: commands: { build: { formats: { cjs: "cjs", esm: "esm" } } }',
        ],
      );
    }

    return builds;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw new PackageError(
      `Failed to determine build configuration: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// Standard directory names
export const getSourceDir = () => getConfig()?.directories?.source || 'src';
export const getESMDir = () => getConfig()?.directories?.esm || 'esm';
export const getCJSDir = () => getConfig()?.directories?.cjs || 'cjs';

/**
 * Get source path with validation
 * @param {string} rootPath - Root path of the package
 * @returns {string} Source directory path
 */
export function getSourcePath(rootPath) {
  const sourcePath = join(rootPath, getSourceDir());

  if (!existsSync(sourcePath)) {
    throw new ConfigurationError(`Source directory not found: ${sourcePath}`, [
      'Create a src/ directory in your package root',
      'Add your TypeScript/JavaScript source files to src/',
      'Ensure src/index.ts, src/index.js, or src/index.cjs exists as the main entry point',
    ]);
  }

  if (!isDirectory(sourcePath)) {
    throw new ConfigurationError(
      `Source path is not a directory: ${sourcePath}`,
      ['Ensure src/ is a directory, not a file'],
    );
  }

  return sourcePath;
}

/**
 * Normalize file paths for cross-platform compatibility
 * @param {string} filePath - File path to normalize
 * @returns {string} Normalized path
 */
function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

/**
 * Normalize ignore patterns by stripping source directory prefix if present
 * @param {string[]} patterns - Array of patterns
 * @returns {string[]} Normalized patterns
 */
function normalizeIgnorePatterns(patterns) {
  const sourceDir = getSourceDir();
  const sourcePrefixes = [`${sourceDir}/`, `./${sourceDir}/`];

  return patterns.map((pattern) => {
    for (const prefix of sourcePrefixes) {
      if (pattern.startsWith(prefix)) {
        return pattern.slice(prefix.length);
      }
    }
    return pattern;
  });
}

/**
 * Check if a file should be included in build (not ignored by ignoreBuildPaths)
 * @param {string} rootPath - Root directory path
 * @param {string} filename - File name to check
 * @param {string} [relativePath=''] - Relative path from src (for pattern matching)
 * @returns {boolean} Whether the file should be built
 */
function shouldBuild(rootPath, filename, relativePath = '') {
  const config = getConfig();

  // Check ignore patterns against the full relative path
  const ignoreBuildPaths = normalizeIgnorePatterns(
    config?.files?.ignoreBuildPaths || [
      '**/*.test.*',
      '**/*.spec.*',
      '**/__tests__/**',
    ],
  );

  // Build full relative path for pattern matching
  const pathToMatch = relativePath ? `${relativePath}/${filename}` : filename;

  if (matchesAnyPattern(pathToMatch, ignoreBuildPaths)) {
    return false;
  }

  const fullPath = join(rootPath, filename);

  // Include all directories
  if (isDirectory(fullPath)) {
    return true;
  }

  // Include JS/TS files
  const extensions = config?.files?.extensions || [
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.cjs',
    '.mjs',
    '.cts',
    '.mts',
  ];

  const extensionPattern = new RegExp(
    `(${extensions.map((e) => e.replace('.', '\\.')).join('|')})$`,
  );
  return extensionPattern.test(filename);
}

/**
 * Check if a file should be included in exports (not ignored by ignoreBuildPaths or ignoreExportPaths)
 * @param {string} rootPath - Root directory path
 * @param {string} filename - File name to check
 * @param {string} [relativePath=''] - Relative path from src (for pattern matching)
 * @returns {boolean} Whether the file should be exported
 */
function shouldExport(rootPath, filename, relativePath = '') {
  const config = getConfig();

  // Build full relative path for pattern matching
  const pathToMatch = relativePath ? `${relativePath}/${filename}` : filename;

  // Check build ignore patterns first (normalized)
  const ignoreBuildPaths = normalizeIgnorePatterns(
    config?.files?.ignoreBuildPaths || [
      '**/*.test.*',
      '**/*.spec.*',
      '**/__tests__/**',
    ],
  );

  if (matchesAnyPattern(pathToMatch, ignoreBuildPaths)) {
    return false;
  }

  // Check export-specific ignore patterns (normalized)
  const ignoreExportPaths = normalizeIgnorePatterns(
    config?.files?.ignoreExportPaths || [],
  );

  if (matchesAnyPattern(pathToMatch, ignoreExportPaths)) {
    return false;
  }

  const fullPath = join(rootPath, filename);

  // Include all directories
  if (isDirectory(fullPath)) {
    return true;
  }

  // Include JS/TS files
  const extensions = config?.files?.extensions || [
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.cjs',
    '.mjs',
    '.cts',
    '.mts',
  ];

  const extensionPattern = new RegExp(
    `(${extensions.map((e) => e.replace('.', '\\.')).join('|')})$`,
  );
  return extensionPattern.test(filename);
}

/**
 * Get all files for build entry points (includes bin-covered files)
 * @param {string} sourcePath - Source directory path
 * @param {string} [prefix=''] - Path prefix for nested directories
 * @returns {Record<string, string>} All files mapping for build
 */
export function getAllBuildFiles(sourcePath, prefix = '') {
  if (!existsSync(sourcePath)) {
    throw new ConfigurationError(
      `Source directory does not exist: ${sourcePath}`,
      ['Ensure the src/ directory exists and contains your source files'],
    );
  }

  try {
    // Special handling for pure CLI packages (bin only, no library exports)
    if (prefix === '' && isPureCLIPackage(join(sourcePath, '..'))) {
      const indexPath = join(sourcePath, 'index.ts');
      if (!existsSync(indexPath) && !existsSync(join(sourcePath, 'index.js'))) {
        throw new ConfigurationError('Pure CLI package missing index file', [
          'Create src/index.ts, src/index.js, or src/index.cjs as the main entry point',
          'Ensure the file exports the main CLI functionality',
        ]);
      }

      return {
        index: existsSync(indexPath) ? indexPath : join(sourcePath, 'index.js'),
      };
    }

    const files = readdirSync(sourcePath)
      .filter((filename) => shouldBuild(sourcePath, filename, prefix))
      .sort(); // Ensure consistent order across platforms

    // Only throw error if root directory is empty, subdirectories can be empty
    if (files.length === 0 && prefix === '') {
      throw new ConfigurationError(
        `No valid source files found in: ${sourcePath}`,
        [
          'Add TypeScript (.ts, .tsx, .cts, .mts) or JavaScript (.js, .jsx, .cjs, .mjs) files to src/',
          'Ensure files are not test files (avoid .test.* or .spec.* naming)',
          'Create at least an index file (src/index.ts, src/index.js, or src/index.cjs)',
        ],
      );
    }

    // Return empty object for empty subdirectories (they'll be ignored)
    if (files.length === 0) {
      return {};
    }

    return files.reduce((acc, filename) => {
      const path = join(sourcePath, filename);
      const childFiles = isDirectory(path)
        ? getAllBuildFiles(path, join(prefix, filename))
        : null;

      if (childFiles) {
        return { ...childFiles, ...acc };
      } else {
        const key = removeExt(normalizePath(join(prefix, filename)));
        return { ...acc, [key]: normalizePath(path) };
      }
    }, /** @type {Record<string, string>} */ ({}));
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw new ConfigurationError(
      `Failed to analyze source files in ${sourcePath}: ${error instanceof Error ? error.message : String(error)}`,
      ['Check file permissions and directory structure'],
    );
  }
}

/**
 * Get public files for exports with comprehensive error handling (excludes bin-covered files)
 * @param {string} sourcePath - Source directory path
 * @param {string} [prefix=''] - Path prefix for nested directories
 * @returns {Record<string, string>} Mapping of export names to file paths
 */
export function getPublicFiles(sourcePath, prefix = '') {
  if (!existsSync(sourcePath)) {
    throw new ConfigurationError(
      `Source directory does not exist: ${sourcePath}`,
      ['Ensure the src/ directory exists and contains your source files'],
    );
  }

  try {
    // Special handling for pure CLI packages (bin only, no library exports)
    if (prefix === '' && isPureCLIPackage(join(sourcePath, '..'))) {
      const indexPath = join(sourcePath, 'index.ts');
      if (!existsSync(indexPath) && !existsSync(join(sourcePath, 'index.js'))) {
        throw new ConfigurationError('Pure CLI package missing index file', [
          'Create src/index.ts, src/index.js, or src/index.cjs as the main entry point',
          'Ensure the file exports the main CLI functionality',
        ]);
      }

      return {
        index: existsSync(indexPath) ? indexPath : join(sourcePath, 'index.js'),
      };
    }

    const files = readdirSync(sourcePath)
      .filter((filename) => shouldExport(sourcePath, filename, prefix))
      .sort(); // Ensure consistent order across platforms

    // Only throw error if root directory is empty, subdirectories can be empty
    if (files.length === 0 && prefix === '') {
      throw new ConfigurationError(
        `No valid source files found in: ${sourcePath}`,
        [
          'Add TypeScript (.ts, .tsx, .cts, .mts) or JavaScript (.js, .jsx, .cjs, .mjs) files to src/',
          'Ensure files are not test files (avoid .test.* or .spec.* naming)',
          'Create at least an index file (src/index.ts, src/index.js, or src/index.cjs)',
        ],
      );
    }

    // Return empty object for empty subdirectories (they'll be ignored)
    if (files.length === 0) {
      return {};
    }

    const result = files.reduce((acc, filename) => {
      const path = join(sourcePath, filename);

      if (isDirectory(path)) {
        // Recursively process directory
        const childFiles = getPublicFiles(path, join(prefix, filename));

        // Check if this directory has an index file
        const hasIndex =
          existsSync(path) &&
          readdirSync(path).some((file) =>
            /^index\.(ts|js|cjs|mjs)$/.test(file),
          );

        // Start with all child files
        const result = { ...acc, ...childFiles };

        if (hasIndex) {
          const indexFileName = readdirSync(path).find((file) =>
            /^index\.(ts|js|cjs|mjs)$/.test(file),
          );
          if (indexFileName) {
            const indexFile = join(path, indexFileName);
            const dirKey = normalizePath(join(prefix, filename));
            result[dirKey] = normalizePath(indexFile);

            // Remove the explicit index file export (directory export replaces it)
            const indexKey = normalizePath(join(prefix, filename, 'index'));
            delete result[indexKey];
          }
        }

        return result;
      } else {
        // Regular file - add it to exports
        const key = removeExt(normalizePath(join(prefix, filename)));
        return { ...acc, [key]: normalizePath(path) };
      }
    }, /** @type {Record<string, string>} */ ({}));

    return result;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw new PackageError(
      `Error reading source files: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Get proxy folder configuration
 * @param {string} rootPath - Root path of the package
 * @returns {Record<string, string>} Proxy folder mapping
 */
export function getProxyFolders(rootPath) {
  try {
    const publicFiles = getPublicFiles(getSourcePath(rootPath));
    return Object.fromEntries(
      Object.entries(publicFiles)
        .map(([name, filePath]) => {
          const proxyName = name.replace(/\/index$/, '');

          // Check if this is a directory export (file path ends with /index.ext)
          const isDirectoryExport = /\/index\.[^/]+$/.test(filePath);

          // For directory exports, we need to preserve '/index' in the path for type lookup
          // e.g., 'cli' export -> 'cli/index' path for finding cli/index.d.ts
          const relativePath = isDirectoryExport ? `${proxyName}/index` : name;

          return [proxyName, relativePath];
        })
        .filter(([name]) => name !== 'index'),
    );
  } catch (error) {
    console.warn(
      chalk.yellow(
        `Warning: Could not generate proxy folders: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    return {};
  }
}

/**
 * Get all build folders that will be created
 * @param {string} rootPath - Root path of the package
 * @param {boolean} [includeProxies=true] - Whether to include proxy folders
 * @returns {string[]} Array of build folder names
 */
export function getBuildFolders(rootPath, includeProxies = true) {
  try {
    const pkg = readPackageJson(rootPath);
    /** @type {string[]} */
    const folders = [];

    if (pkg.main) folders.push(getCJSDir());
    if (pkg.module) folders.push(getESMDir());

    // Add proxy folders if requested
    if (includeProxies) {
      folders.push(...Object.keys(getProxyFolders(rootPath)));
    }

    return folders;
  } catch (error) {
    console.warn(
      chalk.yellow(
        `Warning: Could not determine build folders: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    return [];
  }
}

/**
 * Get the actual index file extension by checking filesystem
 * @param {string} sourcePath - Source directory path
 * @param {boolean} prod - Whether in production mode
 * @returns {string} The actual file extension (.js, .ts, .mjs, .cjs)
 */
function getIndexFileExtension(sourcePath, prod) {
  if (prod) return '.ts'; // Not used in prod mode

  const config = getConfig();
  const possibleExtensions = config?.files?.extensions || [
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.cjs',
    '.mjs',
    '.cts',
    '.mts',
  ];

  for (const ext of possibleExtensions) {
    const indexPath = join(sourcePath, `index${ext}`);
    if (existsSync(indexPath)) {
      return ext;
    }
  }
  return '.js'; // Default fallback
}

/**
 * Normalize a path to ensure it starts with ./
 * @param {string} path - Path to normalize
 * @returns {string} Normalized path starting with ./
 */
function ensureRelativePath(path) {
  if (!path) return path;
  if (path.startsWith('./')) return path;
  if (path.startsWith('/')) return `.${path}`;
  return `./${path}`;
}

/**
 * Convert a path from source to build format
 * @param {string} inputPath - The path to convert (e.g., "src/index.js" or "./src/index.js")
 * @param {object} builds - Build configuration
 * @returns {string} Converted path (e.g., "./cjs/index.cjs")
 */
function convertPathToProduction(inputPath, builds) {
  if (!inputPath) return inputPath;

  const sourceDir = getSourceDir();
  const cjsDir = getCJSDir();
  const esmDir = getESMDir();

  // Normalize to ensure it starts with ./
  const path = ensureRelativePath(inputPath);

  // Check if path is a source path (handles both "./src/" and "src/")
  const sourcePrefixes = [`./${sourceDir}/`, `${sourceDir}/`];
  const isSourcePath = sourcePrefixes.some(
    (prefix) =>
      path === `./${prefix}` ||
      path.startsWith(`./${sourceDir}/`) ||
      inputPath.startsWith(`${sourceDir}/`) ||
      inputPath.startsWith(`./${sourceDir}/`),
  );

  if (!isSourcePath) {
    return path; // Already in build format or external
  }

  // Remove source prefix and ensure no leading ./
  const relativePath = path.replace(new RegExp(`^\\.?/?${sourceDir}/`), '');

  // Convert to build path based on available builds
  if ('cjs' in builds) {
    // CJS: use cjs directory and .cjs extension
    const converted = `./${cjsDir}/${relativePath}`;
    return converted.replace(/\.(m?[jt]s|[cm][jt]s)$/, '.cjs');
  } else if ('esm' in builds) {
    // ESM: use esm directory and .js extension
    const converted = `./${esmDir}/${relativePath}`;
    return converted.replace(/\.(m?ts|[cm]ts)$/, '.js');
  }

  return path; // No builds configured
}

/**
 * Convert a path from production to development format
 * Detects the actual file extension in the source directory
 * @param {string} inputPath - Path to convert (e.g., "./cjs/cli.cjs" or "./esm/cli.js")
 * @param {string} [rootPath] - Root path for file extension detection
 * @returns {string} Converted path (e.g., "./src/cli.ts")
 */
function convertPathToDevelopment(inputPath, rootPath = process.cwd()) {
  if (!inputPath) return inputPath;

  const sourceDir = getSourceDir();
  const cjsDir = getCJSDir();
  const esmDir = getESMDir();

  // Normalize to ensure it starts with ./
  const path = ensureRelativePath(inputPath);

  // Check if it's a CJS build path
  if (path.startsWith(`./${cjsDir}/`) || inputPath.startsWith(`${cjsDir}/`)) {
    const relativePath = path
      .replace(new RegExp(`^\\.?/?${cjsDir}/`), '')
      .replace(/\.cjs$/, '');

    // Detect actual file extension in source
    const actualExt = getActualFileExtension(rootPath, relativePath, true);
    return `./${sourceDir}/${relativePath}${actualExt}`;
  }

  // Check if it's an ESM build path
  if (path.startsWith(`./${esmDir}/`) || inputPath.startsWith(`${esmDir}/`)) {
    const relativePath = path
      .replace(new RegExp(`^\\.?/?${esmDir}/`), '')
      .replace(/\.js$/, '');

    // Detect actual file extension in source
    const actualExt = getActualFileExtension(rootPath, relativePath, true);
    return `./${sourceDir}/${relativePath}${actualExt}`;
  }

  return path; // Already in source format or external
}

/**
 * Convert bin field between dev and production formats
 * @param {string | Record<string, string> | undefined} bin - The bin field from package.json
 * @param {string} mode - Mode: 'production' or 'development'
 * @param {object} builds - Build configuration
 * @param {string} rootPath - Root path for file extension detection
 * @returns {string | Record<string, string> | undefined} Converted bin field
 */
function convertBinPaths(bin, mode, builds, rootPath) {
  if (!bin) return bin;

  const isProduction = mode === 'production';

  if (typeof bin === 'string') {
    return isProduction
      ? convertPathToProduction(bin, builds)
      : convertPathToDevelopment(bin, rootPath);
  }

  if (typeof bin === 'object') {
    const converted = /** @type {Record<string, string>} */ ({});
    for (const [name, binPath] of Object.entries(bin)) {
      if (typeof binPath === 'string') {
        converted[name] = isProduction
          ? convertPathToProduction(binPath, builds)
          : convertPathToDevelopment(binPath, rootPath);
      }
    }
    return converted;
  }

  return bin;
}

/**
 * Generate package.json content for different environments
 * @param {string} rootPath - Root path of the package
 * @param {string} [mode='development'] - Mode: 'production' or 'development'
 * @returns {import('../schemas/commands-config.js').PackageJson} Generated package.json content
 */
export function getPackageJson(rootPath, mode = 'development') {
  const pkg = readPackageJson(rootPath);
  const sourcePath = getSourcePath(rootPath);
  const publicFiles = getPublicFiles(sourcePath);

  const sourceDir = getSourceDir();
  const cjsDir = getCJSDir();
  const esmDir = getESMDir();
  const builds = getPackageBuilds(rootPath);
  const buildKeys = Object.keys(builds);
  const isProduction = mode === 'production';
  const indexExtension = getIndexFileExtension(sourcePath, isProduction);

  /**
   * Get export path for a given file
   * @param {string} path - File path
   * @returns {string | { import: string; require: string }} Export configuration
   */
  const getExports = (path) => {
    if (!isProduction) {
      return path.replace(sourcePath, `./${sourceDir}`);
    }

    const relativePath = removeExt(path).replace(sourcePath, '');

    // Detect actual file extensions from build output
    const esmExt =
      'esm' in builds
        ? getActualFileExtension(rootPath, join(esmDir, relativePath), false)
        : '.js';
    const cjsExt =
      'cjs' in builds
        ? getActualFileExtension(rootPath, join(cjsDir, relativePath), false)
        : '.cjs';

    const esmExport = `./${join(esmDir, relativePath)}${esmExt}`;
    const cjsExport = `./${join(cjsDir, relativePath)}${cjsExt}`;

    if ('esm' in builds && 'cjs' in builds) {
      return {
        import: esmExport,
        require: cjsExport,
      };
    }

    if (buildKeys[0] === 'esm') return esmExport;
    return cjsExport;
  };

  const moduleExports = Object.entries(publicFiles).reduce(
    (acc, [name, path]) => {
      // Convert name to export key format
      const exportKey =
        name === 'index' ? '.' : `./${name.replace(/\/index$/, '')}`;

      return { ...acc, [exportKey]: getExports(path) };
    },
    /** @type {Record<string, any>} */ ({}),
  );

  // Always update main/module/types based on build configuration
  // These are separate from the exports map
  // Ensure all paths start with ./
  const originalHadTypes = 'types' in pkg;

  if ('cjs' in builds) {
    if (isProduction) {
      // Detect actual extension from build output
      const cjsIndexExt = getActualFileExtension(
        rootPath,
        join(cjsDir, 'index'),
        false,
      );
      pkg.main = ensureRelativePath(join(cjsDir, `index${cjsIndexExt}`));
      // Only set types if the .d.ts file exists
      if (originalHadTypes && hasTypesFile(rootPath, join(cjsDir, 'index'))) {
        pkg.types = ensureRelativePath(join(cjsDir, 'index.d.ts'));
      }
    } else {
      pkg.main = ensureRelativePath(join(sourceDir, `index${indexExtension}`));
      if (originalHadTypes) {
        pkg.types = ensureRelativePath(
          join(sourceDir, `index${indexExtension}`),
        );
      }
    }
  }

  if ('esm' in builds) {
    if (isProduction) {
      // Detect actual extension from build output
      const esmIndexExt = getActualFileExtension(
        rootPath,
        join(esmDir, 'index'),
        false,
      );
      pkg.module = ensureRelativePath(join(esmDir, `index${esmIndexExt}`));
      // Only set types if the .d.ts file exists
      if (originalHadTypes && hasTypesFile(rootPath, join(esmDir, 'index'))) {
        pkg.types = ensureRelativePath(join(esmDir, 'index.d.ts'));
      }
    } else {
      pkg.module = ensureRelativePath(
        join(sourceDir, `index${indexExtension}`),
      );
      if (originalHadTypes) {
        pkg.types = ensureRelativePath(
          join(sourceDir, `index${indexExtension}`),
        );
      }
    }
  }

  pkg.exports = {
    ...moduleExports,
    './package.json': './package.json',
  };

  // Convert bin paths to appropriate format (dev/prod)
  if (pkg.bin) {
    pkg.bin = convertBinPaths(pkg.bin, mode, builds, rootPath);
  }

  return pkg;
}

/**
 * Write package.json with error handling, preserving original structure
 * @param {string} rootPath - Root path of the package
 * @param {string} [mode='development'] - Mode: 'production' or 'development'
 * @param {boolean} [checkMode=false] - Check mode: validate without writing, returns true if there are changes
 * @returns {boolean} Returns false if no changes or checkMode is false, true if checkMode and there are changes
 */
export function writePackageJson(
  rootPath,
  mode = 'development',
  checkMode = false,
) {
  try {
    const pkgPath = join(rootPath, 'package.json');
    const currentContents = readFileSync(pkgPath, 'utf-8');

    // Read original package.json object (preserves property order)
    const pkg = JSON.parse(currentContents);

    // Check if original package.json had a types field BEFORE any modifications
    const originalHadTypes = 'types' in pkg;

    // Calculate what the new values should be
    const sourcePath = getSourcePath(rootPath);
    const publicFiles = getPublicFiles(sourcePath);

    const sourceDir = getSourceDir();
    const cjsDir = getCJSDir();
    const esmDir = getESMDir();
    const builds = getPackageBuilds(rootPath);

    const isProduction = mode === 'production';
    const isProductionTypes = mode === 'production-types';
    const indexExtension = getIndexFileExtension(sourcePath, isProduction);
    // const buildKeys = Object.keys(builds); // Currently unused

    /**
     * Get export path for a given file - conditional export format based on package.json fields
     * @param {string} path - File path
     * @returns {Record<string, string>} Export configuration
     */
    const getExports = (path) => {
      const relativePath = removeExt(path).replace(sourcePath, '');
      const exportConfig = /** @type {Record<string, string>} */ ({});

      // Types field will be present only if it was originally present
      const willHaveTypesField = originalHadTypes;

      if (!isProduction && !isProductionTypes) {
        // Development mode: formats point to source file with original extension
        const originalExtension = path.match(/\.[^.]+$/)?.[0] || '.js';
        const sourceExport = `./${join(sourceDir, relativePath)}${originalExtension}`;

        // Add types export first (Node.js best practice)
        if (willHaveTypesField) {
          exportConfig.types = sourceExport; // types field present
        }

        // Add exports based on what fields will be present in package.json
        if ('esm' in builds) {
          exportConfig.import = sourceExport; // module field present
        }
        if ('cjs' in builds) {
          exportConfig.require = sourceExport; // main field present
        }

        return exportConfig;
      }

      if (isProductionTypes) {
        // Production-types mode: types point to built files, but import/require point to source
        const originalExtension = path.match(/\.[^.]+$/)?.[0] || '.js';
        const sourceExport = `./${join(sourceDir, relativePath)}${originalExtension}`;

        // Add types export first (pointing to built .d.ts files)
        if (willHaveTypesField) {
          // ESM types take precedence over CJS types
          if (
            'esm' in builds &&
            hasTypesFile(rootPath, join(esmDir, relativePath))
          ) {
            exportConfig.types = `./${join(esmDir, relativePath)}.d.ts`;
          } else if (
            'cjs' in builds &&
            hasTypesFile(rootPath, join(cjsDir, relativePath))
          ) {
            exportConfig.types = `./${join(cjsDir, relativePath)}.d.ts`;
          }
        }

        // Add exports pointing to source files
        if ('esm' in builds) {
          exportConfig.import = sourceExport;
        }
        if ('cjs' in builds) {
          exportConfig.require = sourceExport;
        }

        return exportConfig;
      }

      // Production mode: different formats point to different built files
      // Detect actual file extensions from build output
      const esmExt =
        'esm' in builds
          ? getActualFileExtension(rootPath, join(esmDir, relativePath), false)
          : '.js';
      const cjsExt =
        'cjs' in builds
          ? getActualFileExtension(rootPath, join(cjsDir, relativePath), false)
          : '.cjs';

      const esmExport = `./${join(esmDir, relativePath)}${esmExt}`;
      const cjsExport = `./${join(cjsDir, relativePath)}${cjsExt}`;

      // Add types export first (Node.js best practice)
      // Only include types if the .d.ts file actually exists
      if (willHaveTypesField) {
        // ESM types take precedence over CJS types (matches package.json logic)
        if (
          'esm' in builds &&
          hasTypesFile(rootPath, join(esmDir, relativePath))
        ) {
          exportConfig.types = `./${join(esmDir, relativePath)}.d.ts`;
        } else if (
          'cjs' in builds &&
          hasTypesFile(rootPath, join(cjsDir, relativePath))
        ) {
          exportConfig.types = `./${join(cjsDir, relativePath)}.d.ts`;
        }
      }

      // Add exports based on what builds are configured
      if ('esm' in builds) {
        exportConfig.import = esmExport; // module field present
      }

      if ('cjs' in builds) {
        exportConfig.require = cjsExport; // main field present
      }

      return exportConfig;
    };

    // Generate exports
    const moduleExports = Object.entries(publicFiles).reduce(
      (acc, [name, path]) => {
        // Convert name to export key format
        const exportKey =
          name === 'index' ? '.' : `./${name.replace(/\/index$/, '')}`;

        return { ...acc, [exportKey]: getExports(path) };
      },
      /** @type {Record<string, any>} */ ({}),
    );

    // Directly mutate the original object (preserves property order)
    // Always update main/module/types - these are independent of exports
    // Ensure all paths start with ./
    if ('cjs' in builds) {
      if (isProduction) {
        // Detect actual extension from build output
        const cjsIndexExt = getActualFileExtension(
          rootPath,
          join(cjsDir, 'index'),
          false,
        );
        pkg.main = ensureRelativePath(join(cjsDir, `index${cjsIndexExt}`));
        // Only set types if the .d.ts file exists
        if (originalHadTypes && hasTypesFile(rootPath, join(cjsDir, 'index'))) {
          pkg.types = ensureRelativePath(join(cjsDir, 'index.d.ts'));
        }
      } else if (isProductionTypes) {
        // Production-types mode: main points to source, types point to built .d.ts
        pkg.main = ensureRelativePath(
          join(sourceDir, `index${indexExtension}`),
        );
        if (originalHadTypes && hasTypesFile(rootPath, join(cjsDir, 'index'))) {
          pkg.types = ensureRelativePath(join(cjsDir, 'index.d.ts'));
        }
      } else {
        pkg.main = ensureRelativePath(
          join(sourceDir, `index${indexExtension}`),
        );
        if (originalHadTypes) {
          pkg.types = ensureRelativePath(
            join(sourceDir, `index${indexExtension}`),
          );
        }
      }
    }

    if ('esm' in builds) {
      if (isProduction) {
        // Detect actual extension from build output
        const esmIndexExt = getActualFileExtension(
          rootPath,
          join(esmDir, 'index'),
          false,
        );
        pkg.module = ensureRelativePath(join(esmDir, `index${esmIndexExt}`));
        // Only set types if the .d.ts file exists
        if (originalHadTypes && hasTypesFile(rootPath, join(esmDir, 'index'))) {
          pkg.types = ensureRelativePath(join(esmDir, 'index.d.ts'));
        }
      } else if (isProductionTypes) {
        // Production-types mode: module points to source, types point to built .d.ts
        pkg.module = ensureRelativePath(
          join(sourceDir, `index${indexExtension}`),
        );
        if (originalHadTypes && hasTypesFile(rootPath, join(esmDir, 'index'))) {
          pkg.types = ensureRelativePath(join(esmDir, 'index.d.ts'));
        }
      } else {
        pkg.module = ensureRelativePath(
          join(sourceDir, `index${indexExtension}`),
        );
        if (originalHadTypes) {
          pkg.types = ensureRelativePath(
            join(sourceDir, `index${indexExtension}`),
          );
        }
      }
    }

    // Convert bin paths to appropriate format (dev/prod)
    if (pkg.bin) {
      pkg.bin = convertBinPaths(pkg.bin, mode, builds, rootPath);
    }

    // Update exports (this is the key part - direct property mutation)
    pkg.exports = {
      ...moduleExports,
      './package.json': './package.json',
    };

    // Compare and write if changed
    const nextContents = `${JSON.stringify(pkg, null, 2)}\n`;

    const hasChanges = currentContents !== nextContents;

    if (checkMode) {
      // In check mode, return whether there are changes
      return hasChanges;
    }

    if (!hasChanges) {
      return false; // No changes needed
    }

    writeFileSync(pkgPath, nextContents);
    console.log(`${chalk.blue(pkg.name)} - Updated package.json`);
    return false;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      console.error(chalk.red(`Configuration error in ${rootPath}:`));
      console.error(chalk.red(`  ${error.message}`));
      error.suggestions.forEach((suggestion) => {
        console.error(chalk.yellow(`  💡 ${suggestion}`));
      });
      throw error;
    }

    throw new PackageError(
      `Failed to write package.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Clean build artifacts with improved error handling
 * @param {string} rootPath - Root path of the package
 */
export function cleanBuild(rootPath) {
  console.log(chalk.blue(`🧹 Cleaning build artifacts in ${rootPath}...`));

  try {
    // First update package.json to dev mode
    writePackageJson(rootPath);

    // Clean proxy directories (root-level directories like commands/, utils/, schemas/)
    cleanProxies(rootPath);

    // Clean build output directories (esm/, cjs/)
    const buildDirs = [getESMDir(), getCJSDir()];
    let cleanedCount = 0;

    buildDirs.forEach((dir) => {
      const dirPath = join(rootPath, dir);
      if (existsSync(dirPath)) {
        try {
          rimraf.sync(dirPath);
          console.log(chalk.gray(`   Removed: ${dir}`));
          cleanedCount++;
        } catch (error) {
          console.warn(
            chalk.yellow(
              `   Warning: Could not remove ${dir}: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
        }
      }
    });

    if (cleanedCount === 0) {
      console.log(chalk.gray('   No build output directories found to clean'));
    } else {
      console.log(
        chalk.green(
          `   Cleaned ${cleanedCount} build output ${cleanedCount === 1 ? 'directory' : 'directories'}`,
        ),
      );
    }
  } catch (error) {
    throw new PackageError(
      `Clean failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Generate .gitignore for build artifacts, preserving user content
 * @param {string} rootPath - Root path of the package
 */
export function makeGitignore(rootPath) {
  const gitignorePath = join(rootPath, '.gitignore');

  try {
    // Get config to check writeToGitIgnore setting
    const config = getConfig();
    const writeToGitIgnore = config?.files?.writeToGitIgnore ?? true;

    const buildFolders = getBuildFolders(rootPath, writeToGitIgnore);

    // Add TypeScript cache directory if writeToGitIgnore is enabled
    const allFolders = [...buildFolders];
    if (writeToGitIgnore) {
      const cacheFile =
        config?.typescript?.buildCacheFile || '.cache/tsbuildinfo.json';
      const cacheDir = dirname(cacheFile);
      if (cacheDir && cacheDir !== '.' && !allFolders.includes(cacheDir)) {
        allFolders.push(cacheDir);
      }
    }

    if (allFolders.length === 0) {
      console.log(chalk.gray('   No build folders to add to .gitignore'));
      return;
    }

    // Generate the build artifacts section
    const buildArtifactsSection = [
      '# Build artifacts (auto-generated by libsync)',
      '# Do not edit this section manually - it will be overwritten',
      ...allFolders.sort().map((name) => `/${name}`),
      '# End build artifacts',
    ].join('\n');

    let gitignoreContent = '';
    let hasExistingFile = false;

    if (existsSync(gitignorePath)) {
      hasExistingFile = true;
      gitignoreContent = readFileSync(gitignorePath, 'utf-8');
    }

    // Update or create .gitignore with preserved user content
    const updatedContent = updateGitignoreWithBuildArtifacts(
      gitignoreContent,
      buildArtifactsSection,
    );

    writeFileSync(gitignorePath, updatedContent);

    if (hasExistingFile) {
      console.log(
        chalk.green(
          `   Updated .gitignore with ${allFolders.length} build ${allFolders.length === 1 ? 'directory' : 'directories'}`,
        ),
      );
    } else {
      console.log(
        chalk.green(
          `   Created .gitignore with ${allFolders.length} build ${allFolders.length === 1 ? 'directory' : 'directories'}`,
        ),
      );
    }
  } catch (error) {
    console.warn(
      chalk.yellow(
        `Warning: Could not update .gitignore: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
}

/**
 * Update .gitignore content with build artifacts section, preserving user content
 * @param {string} existingContent - Existing .gitignore content
 * @param {string} buildArtifactsSection - New build artifacts section
 * @returns {string} Updated .gitignore content
 */
function updateGitignoreWithBuildArtifacts(
  existingContent,
  buildArtifactsSection,
) {
  const startMarker = '# Build artifacts (auto-generated by libsync)';
  const endMarker = '# End build artifacts';

  // If no existing content, just return the build artifacts section
  if (!existingContent.trim()) {
    return buildArtifactsSection + '\n';
  }

  const lines = existingContent.split('\n');
  const startIndex = lines.findIndex((line) => line.trim() === startMarker);
  const endIndex = lines.findIndex((line) => line.trim() === endMarker);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    // Replace existing build artifacts section
    const beforeSection = lines.slice(0, startIndex);
    const afterSection = lines.slice(endIndex + 1);

    // Remove trailing empty lines from before section
    while (
      beforeSection.length > 0 &&
      beforeSection[beforeSection.length - 1]?.trim() === ''
    ) {
      beforeSection.pop();
    }

    // Remove leading empty lines from after section
    while (afterSection.length > 0 && afterSection[0]?.trim() === '') {
      afterSection.shift();
    }

    const result = [
      ...beforeSection,
      ...(beforeSection.length > 0 ? [''] : []), // Add separator if there's content before
      buildArtifactsSection,
      ...(afterSection.length > 0 ? ['', ...afterSection] : []), // Add separator if there's content after
    ].join('\n');

    return result.endsWith('\n') ? result : result + '\n';
  } else {
    // No existing build artifacts section, append to end
    const trimmedContent = existingContent.trimEnd();
    return (
      trimmedContent +
      (trimmedContent ? '\n\n' : '') +
      buildArtifactsSection +
      '\n'
    );
  }
}

/**
 * Remove build artifacts section from .gitignore
 * @param {string} rootPath - Root path of the package
 */
export function cleanGitignore(rootPath) {
  const gitignorePath = join(rootPath, '.gitignore');

  if (!existsSync(gitignorePath)) {
    return; // No .gitignore to clean
  }

  try {
    const gitignoreContent = readFileSync(gitignorePath, 'utf-8');
    const startMarker = '# Build artifacts (auto-generated by libsync)';
    const endMarker = '# End build artifacts';

    const lines = gitignoreContent.split('\n');
    const startIndex = lines.findIndex((line) => line.trim() === startMarker);
    const endIndex = lines.findIndex((line) => line.trim() === endMarker);

    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      // Remove the build artifacts section
      const beforeSection = lines.slice(0, startIndex);
      const afterSection = lines.slice(endIndex + 1);

      // Remove trailing empty lines from before section
      while (
        beforeSection.length > 0 &&
        beforeSection[beforeSection.length - 1]?.trim() === ''
      ) {
        beforeSection.pop();
      }

      // Remove leading empty lines from after section
      while (afterSection.length > 0 && afterSection[0]?.trim() === '') {
        afterSection.shift();
      }

      // Combine sections with proper spacing
      const result = [
        ...beforeSection,
        ...(beforeSection.length > 0 && afterSection.length > 0 ? [''] : []),
        ...afterSection,
      ].join('\n');

      writeFileSync(
        gitignorePath,
        result.endsWith('\n') ? result : result + '\n',
      );

      console.log(chalk.green('   Cleaned .gitignore build artifacts section'));
    }
  } catch (error) {
    console.warn(
      chalk.yellow(
        `Warning: Could not clean .gitignore: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
}

/**
 * Get actual file extension for a given path by checking filesystem
 * @param {string} rootPath - Root path of the package
 * @param {string} relativePath - Relative path without extension
 * @param {boolean} isSource - Whether to look in source directory
 * @returns {string} The actual file extension (e.g., '.ts', '.js', '.mts')
 */
function getActualFileExtension(rootPath, relativePath, isSource = true) {
  const config = getConfig();
  const baseDir = isSource ? getSourceDir() : '';
  const extensions = config?.files?.extensions || [
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.cjs',
    '.mjs',
    '.cts',
    '.mts',
    '.json',
  ];

  for (const ext of extensions) {
    const fullPath = isSource
      ? join(rootPath, baseDir, `${relativePath}${ext}`)
      : join(rootPath, `${relativePath}${ext}`);
    if (existsSync(fullPath)) {
      return ext;
    }
  }
  return '.js'; // fallback
}

/**
 * Clean up existing proxy directories
 * Removes entire root-level directories (e.g., commands/, utils/, schemas/)
 * @param {string} rootPath - Root path of the package
 */
export function cleanProxies(rootPath) {
  try {
    const proxyFolders = getProxyFolders(rootPath);

    // Get unique root-level directories from proxy paths
    const rootDirs = new Set();
    Object.keys(proxyFolders).forEach((name) => {
      // Extract the first segment of the path (e.g., "commands" from "commands/build")
      const rootDir = name.split('/')[0];
      rootDirs.add(rootDir);
    });

    let cleanedCount = 0;

    rootDirs.forEach((rootDir) => {
      const proxyDir = join(rootPath, rootDir);
      if (existsSync(proxyDir)) {
        try {
          rimraf.sync(proxyDir);
          cleanedCount++;
        } catch (error) {
          console.warn(
            chalk.yellow(
              `   Warning: Could not remove proxy directory ${rootDir}: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
        }
      }
    });

    if (cleanedCount > 0) {
      console.log(
        chalk.gray(
          `   Cleaned ${cleanedCount} root proxy ${cleanedCount === 1 ? 'directory' : 'directories'}`,
        ),
      );
    }
  } catch (error) {
    console.warn(
      chalk.yellow(
        `   Warning: Could not clean proxy directories: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
}

/**
 * Create proxy packages for sub-modules
 * @param {string} rootPath - Root path of the package
 * @param {string} [mode='production'] - Mode: 'production', 'development', or 'production-types'
 */
export function makeProxies(rootPath, mode = 'production') {
  try {
    // Clean existing proxies first
    cleanProxies(rootPath);

    const proxyFolders = getProxyFolders(rootPath);
    /** @type {string[]} */
    const created = [];

    if (Object.keys(proxyFolders).length === 0) {
      console.log(chalk.gray('   No proxies to generate'));
      return;
    }

    Object.entries(proxyFolders).forEach(([name, path]) => {
      try {
        const proxyDir = join(rootPath, name);
        fse.ensureDirSync(proxyDir);

        const proxyPackageJson = generateProxyPackageJson(
          rootPath,
          name,
          path,
          mode,
        );
        writeFileSync(join(proxyDir, 'package.json'), proxyPackageJson);

        created.push(chalk.green(name));
      } catch (error) {
        console.error(
          chalk.red(
            `   Error: Could not create proxy for ${name}: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
        if (error instanceof Error && error.stack) {
          console.error(chalk.gray(error.stack));
        }
      }
    });

    const modeLabel =
      mode === 'production'
        ? 'production'
        : mode === 'production-types'
          ? 'production-types'
          : 'development';
    if (created.length > 0) {
      console.log(
        chalk.green(
          `   Created ${created.length} ${modeLabel} proxy ${created.length === 1 ? 'package' : 'packages'}: ${created.join(', ')}`,
        ),
      );
    }
  } catch (error) {
    console.error(
      chalk.red(
        `   Error: Could not create proxy packages: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    if (error instanceof Error && error.stack) {
      console.error(chalk.gray(error.stack));
    }
  }
}

/**
 * Generate proxy package.json content
 * @param {string} rootPath - Root path of the package
 * @param {string} moduleName - Name of the module
 * @param {string} path - Path to the module
 * @param {string} [mode='production'] - Mode: 'production', 'development', or 'production-types'
 * @returns {string} JSON string for proxy package.json
 */
function generateProxyPackageJson(
  rootPath,
  moduleName,
  path,
  mode = 'production',
) {
  const pkg = readPackageJson(rootPath);
  const builds = getPackageBuilds(rootPath);
  const sourceDir = getSourceDir();
  const mainDir = getCJSDir();
  const moduleDir = getESMDir();
  const prefix = '../'.repeat(moduleName.split('/').length);
  const originalHadTypes = 'types' in pkg;

  const isProduction = mode === 'production';
  const isProductionTypes = mode === 'production-types';

  /** @type {Record<string, any>} */
  const proxyPkg = {
    name: `${pkg.name}/${moduleName}`,
    private: true,
    sideEffects: false,
  };

  if (isProduction) {
    // Production mode - point to built files with detected extensions
    if ('esm' in builds) {
      const esmExt = getActualFileExtension(
        rootPath,
        join(moduleDir, path),
        false,
      );
      proxyPkg.module = join(prefix, moduleDir, `${path}${esmExt}`);
      // Only include types if .d.ts exists and original package.json had types field
      if (originalHadTypes && hasTypesFile(rootPath, join(moduleDir, path))) {
        proxyPkg.types = join(prefix, moduleDir, `${path}.d.ts`);
      }
    }

    if ('cjs' in builds) {
      const cjsExt = getActualFileExtension(
        rootPath,
        join(mainDir, path),
        false,
      );
      proxyPkg.main = join(prefix, mainDir, `${path}${cjsExt}`);
      // Only include types if .d.ts exists and original package.json had types field
      if (originalHadTypes && hasTypesFile(rootPath, join(mainDir, path))) {
        proxyPkg.types = join(prefix, mainDir, `${path}.d.ts`);
      }
    }
  } else if (isProductionTypes) {
    // Production-types mode - types point to built files, main/module point to source
    const srcExt = getActualFileExtension(rootPath, path, true);
    const srcPath = join(prefix, sourceDir, `${path}${srcExt}`);

    // Main and module point to source
    if ('cjs' in builds) {
      proxyPkg.main = srcPath;
    }
    if ('esm' in builds) {
      proxyPkg.module = srcPath;
    }

    // Types point to built .d.ts files
    if (originalHadTypes) {
      // ESM types take precedence over CJS types
      if ('esm' in builds && hasTypesFile(rootPath, join(moduleDir, path))) {
        proxyPkg.types = join(prefix, moduleDir, `${path}.d.ts`);
      } else if (
        'cjs' in builds &&
        hasTypesFile(rootPath, join(mainDir, path))
      ) {
        proxyPkg.types = join(prefix, mainDir, `${path}.d.ts`);
      }
    }
  } else {
    // Dev mode - point to source files with actual extensions
    const srcExt = getActualFileExtension(rootPath, path, true);
    const srcPath = join(prefix, sourceDir, `${path}${srcExt}`);
    proxyPkg.main = srcPath;
    proxyPkg.module = srcPath;
    // Only set types in dev mode if original package.json had types field
    if (originalHadTypes) {
      proxyPkg.types = srcPath; // Points to .ts/.tsx files in dev
    }
  }

  return JSON.stringify(proxyPkg, null, 2);
}
