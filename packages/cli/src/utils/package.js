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
import { packageJsonSchema } from '../schemas/config.js';

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
 * @returns {import('../schemas/config.js').PackageJson} Validated package.json content
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
 * Get build configurations for different output formats
 * @param {string} rootPath - Root path of the package
 * @returns {Record<string, string>} Build format to directory mapping
 */
export function getPackageBuilds(rootPath) {
  try {
    const pkg = readPackageJson(rootPath);

    /** @type {Record<string, string>} */
    const builds = {};

    // Add CJS build if main field exists
    if (pkg.main) {
      builds.cjs = getCJSDir();
    }

    // Add ESM build if module field exists
    if (pkg.module) {
      builds.esm = getESMDir();
    }

    // For binary packages, ensure we have at least one build format
    if (pkg.bin && Object.keys(builds).length === 0) {
      // Default to ESM for modern Node.js CLIs
      builds.esm = getESMDir();
    }

    if (Object.keys(builds).length === 0) {
      throw new ConfigurationError(
        'No build formats detected in package.json',
        [
          'Add "main" field for CommonJS output',
          'Add "module" field for ESM output',
          'Add "bin" field for CLI applications',
          'Example: "main": "./cjs/index.cjs", "module": "./esm/index.js"',
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
export const getSourceDir = () => 'src';
export const getESMDir = () => 'esm';
export const getCJSDir = () => 'cjs';

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
 * Get normalized bin paths from package.json
 * @param {ReturnType<typeof readPackageJson>} pkg - Package.json object
 * @returns {string[]} Array of normalized bin paths (without extensions)
 */
function getBinPaths(pkg) {
  if (!pkg.bin || typeof pkg.bin !== 'object') {
    return [];
  }

  return Object.values(pkg.bin).map((binPath) => {
    // Convert bin path to source path
    // Handle both production format: "./cjs/commands/build.cjs" -> "commands/build"
    // And development format: "./src/commands/build.js" -> "commands/build"
    return binPath
      .replace(/^\.\//, '') // Remove leading ./
      .replace(/^(cjs|esm|src)\//, '') // Remove cjs/, esm/, or src/ prefix
      .replace(/\.(cjs|js|mjs|ts|tsx)$/, ''); // Remove file extension
  });
}

/**
 * Check if a path is covered by bin entries
 * @param {string} relativePath - Path relative to src (e.g., "commands/build")
 * @param {string[]} binPaths - Array of bin paths from getBinPaths()
 * @returns {boolean} True if the path is covered by a bin entry
 */
function isPathCoveredByBin(relativePath, binPaths) {
  return binPaths.includes(relativePath);
}

/**
 * Check if all files in a directory are covered by bin entries
 * @param {string} dirPath - Full path to the directory
 * @param {string} dirName - Directory name relative to src
 * @param {string[]} binPaths - Array of bin paths from getBinPaths()
 * @returns {boolean} True if all files are covered by bin entries
 */
function areAllFilesInBin(dirPath, dirName, binPaths) {
  try {
    const files = readdirSync(dirPath);

    for (const file of files) {
      const filePath = join(dirPath, file);

      if (isDirectory(filePath)) {
        // Recursively check subdirectories
        const subDirName = `${dirName}/${file}`;
        if (!areAllFilesInBin(filePath, subDirName, binPaths)) {
          return false;
        }
      } else {
        // Skip non-JS files
        if (!/\.(js|jsx|ts|tsx|cjs|mjs|cts|mts)$/.test(file)) {
          continue;
        }

        // Check if this file is covered by a bin entry
        const fileWithoutExt = file.replace(
          /\.(js|jsx|ts|tsx|cjs|mjs|cts|mts)$/,
          '',
        );
        const expectedBinPath = `${dirName}/${fileWithoutExt}`;

        if (!isPathCoveredByBin(expectedBinPath, binPaths)) {
          return false; // Found a file not covered by bin
        }
      }
    }

    return true; // All files are covered by bin entries
  } catch {
    return false; // If we can't read the directory, don't exclude it
  }
}

/**
 * Check if a file should be included in build entry points (includes bin-covered files)
 * @param {string} rootPath - Root directory path
 * @param {string} filename - File name to check
 * @returns {boolean} Whether the file should be included
 */
function isPublicModuleForBuild(rootPath, filename) {
  // Exclude test files
  if (/^.*\.test\..*/.test(filename) || /^.*\.spec\..*/.test(filename)) {
    return false;
  }

  const fullPath = join(rootPath, filename);

  // Include all directories for build (don't exclude bin-covered directories)
  if (isDirectory(fullPath)) {
    return true;
  }

  // Include JS/TS files
  return /\.(js|jsx|ts|tsx|cjs|mjs|cts|mts)$/.test(filename);
}

/**
 * Check if a file should be included in public exports (excludes bin-covered files)
 * @param {string} rootPath - Root directory path
 * @param {string} filename - File name to check
 * @returns {boolean} Whether the file should be included
 */
function isPublicModule(rootPath, filename) {
  // Exclude test files
  if (/^.*\.test\..*/.test(filename) || /^.*\.spec\..*/.test(filename)) {
    return false;
  }

  const fullPath = join(rootPath, filename);

  // Include directories, but exclude directories where all files are covered by bin entries
  if (isDirectory(fullPath)) {
    try {
      const packagePath = join(rootPath, '..');
      const pkg = readPackageJson(packagePath);
      const binPaths = getBinPaths(pkg);

      // If package has bin entries, check if this directory's files are all covered by bin
      if (binPaths.length > 0) {
        // Check if all files in this directory (recursively) are covered by bin entries
        if (areAllFilesInBin(fullPath, filename, binPaths)) {
          return false; // Exclude this directory since all its files are in bin
        }
      }
    } catch {
      return false;
    }
    return true;
  }

  // Include JS/TS files
  return /\.(js|jsx|ts|tsx|cjs|mjs|cts|mts)$/.test(filename);
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
      .filter((filename) => isPublicModuleForBuild(sourcePath, filename))
      .sort(); // Ensure consistent order across platforms

    if (files.length === 0) {
      throw new ConfigurationError(
        `No valid source files found in: ${sourcePath}`,
        [
          'Add TypeScript (.ts, .tsx, .cts, .mts) or JavaScript (.js, .jsx, .cjs, .mjs) files to src/',
          'Ensure files are not test files (avoid .test.* or .spec.* naming)',
          'Create at least an index file (src/index.ts, src/index.js, or src/index.cjs)',
        ],
      );
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
      .filter((filename) => isPublicModule(sourcePath, filename))
      .sort(); // Ensure consistent order across platforms

    if (files.length === 0) {
      throw new ConfigurationError(
        `No valid source files found in: ${sourcePath}`,
        [
          'Add TypeScript (.ts, .tsx, .cts, .mts) or JavaScript (.js, .jsx, .cjs, .mjs) files to src/',
          'Ensure files are not test files (avoid .test.* or .spec.* naming)',
          'Create at least an index file (src/index.ts, src/index.js, or src/index.cjs)',
        ],
      );
    }

    return files.reduce((acc, filename) => {
      const path = join(sourcePath, filename);
      const childFiles = isDirectory(path)
        ? getPublicFiles(path, join(prefix, filename))
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
      Object.keys(publicFiles)
        .map((name) => [name.replace(/\/index$/, ''), name])
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
 * @returns {string[]} Array of build folder names
 */
export function getBuildFolders(rootPath) {
  try {
    const pkg = readPackageJson(rootPath);
    /** @type {string[]} */
    const folders = [];

    if (pkg.main) folders.push(getCJSDir());
    if (pkg.module) folders.push(getESMDir());

    // Add proxy folders
    folders.push(...Object.keys(getProxyFolders(rootPath)));

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
 * Get bin file paths from package.json
 * @param {import('../schemas/config.js').PackageJson} pkg - Package.json content
 * @param {string} _sourcePath - Source directory path
 * @returns {Set<string>} Set of normalized bin file paths
 */
function getBinFilePaths(pkg, _sourcePath) {
  const binPaths = new Set();

  if (!pkg.bin) return binPaths;

  if (typeof pkg.bin === 'string') {
    // Single bin entry - normalize path relative to source
    const normalizedPath = normalizePath(pkg.bin)
      .replace(/^\.\//, '') // Remove leading ./
      .replace(/\.(js|ts|jsx|tsx)$/, ''); // Remove extension for comparison
    binPaths.add(normalizedPath);
  } else if (typeof pkg.bin === 'object') {
    // Multiple bin entries - normalize all paths
    Object.values(pkg.bin).forEach((binPath) => {
      if (typeof binPath === 'string') {
        const normalizedPath = normalizePath(binPath)
          .replace(/^\.\//, '') // Remove leading ./
          .replace(/\.(js|ts|jsx|tsx)$/, ''); // Remove extension for comparison
        binPaths.add(normalizedPath);
      }
    });
  }

  return binPaths;
}

/**
 * Filter public files to exclude bin entries
 * @param {Record<string, string>} publicFiles - Public files mapping
 * @param {Set<string>} binPaths - Set of bin file paths to exclude
 * @param {string} sourcePath - Source directory path
 * @returns {Record<string, string>} Filtered public files
 */
function filterBinFromPublicFiles(publicFiles, binPaths, sourcePath) {
  if (binPaths.size === 0) return publicFiles;

  return Object.fromEntries(
    Object.entries(publicFiles).filter(([_name, path]) => {
      // Convert file path to relative path for comparison
      const relativePath = normalizePath(path)
        .replace(normalizePath(sourcePath), '')
        .replace(/^\//, '') // Remove leading /
        .replace(/\.(js|ts|jsx|tsx)$/, ''); // Remove extension

      // Check if this file is referenced in bin
      return (
        !binPaths.has(`src/${relativePath}`) && !binPaths.has(relativePath)
      );
    }),
  );
}

/**
 * Get the actual index file extension by checking filesystem
 * @param {string} sourcePath - Source directory path
 * @param {boolean} prod - Whether in production mode
 * @returns {string} The actual file extension (.js, .ts, .mjs, .cjs)
 */
function getIndexFileExtension(sourcePath, prod) {
  if (prod) return '.ts'; // Not used in prod mode

  const possibleExtensions = ['.js', '.ts', '.mjs', '.cjs'];
  for (const ext of possibleExtensions) {
    const indexPath = join(sourcePath, `index${ext}`);
    if (existsSync(indexPath)) {
      return ext;
    }
  }
  return '.js'; // Default fallback
}

/**
 * Generate package.json content for different environments
 * @param {string} rootPath - Root path of the package
 * @param {boolean} [prod=false] - Whether to generate for production
 * @returns {import('../schemas/config.js').PackageJson} Generated package.json content
 */
export function getPackageJson(rootPath, prod = false) {
  const pkg = readPackageJson(rootPath);
  const sourcePath = getSourcePath(rootPath);
  const allPublicFiles = getPublicFiles(sourcePath);

  // Filter out bin files from exports
  const binFilePaths = getBinFilePaths(pkg, sourcePath);
  const publicFiles = filterBinFromPublicFiles(
    allPublicFiles,
    binFilePaths,
    sourcePath,
  );

  const sourceDir = getSourceDir();
  const cjsDir = getCJSDir();
  const esmDir = getESMDir();
  const builds = getPackageBuilds(rootPath);
  const buildKeys = Object.keys(builds);
  const indexExtension = getIndexFileExtension(sourcePath, prod);

  /**
   * Get export path for a given file
   * @param {string} path - File path
   * @returns {string | { import: string; require: string }} Export configuration
   */
  const getExports = (path) => {
    if (!prod) {
      return path.replace(sourcePath, `./${sourceDir}`);
    }

    const relativePath = removeExt(path).replace(sourcePath, '');
    const esmExport = `./${join(esmDir, relativePath)}.js`;
    const cjsExport = `./${join(cjsDir, relativePath)}.cjs`;

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
      if (name === 'index') {
        // Always include the main entry point, even if it's also a bin file
        // The main entry represents the library API, bin represents CLI usage
        return { '.': getExports(path), ...acc };
      }
      const pathname = `./${name.replace(/\/index$/, '')}`;
      return { ...acc, [pathname]: getExports(path) };
    },
    /** @type {Record<string, any>} */ ({}),
  );

  // Note: The main entry point (".") is only included if it's not filtered out
  // by bin filtering. If index.js is referenced in bin, it won't be in publicFiles
  // and therefore won't be exported as ".", which is the correct behavior.

  // Update package fields based on build configuration
  if ('cjs' in builds) {
    pkg.main = prod
      ? join(cjsDir, 'index.cjs')
      : join(sourceDir, `index${indexExtension}`);
    pkg.types = prod
      ? join(cjsDir, 'index.d.ts')
      : join(sourceDir, `index${indexExtension}`);
  }

  if ('esm' in builds) {
    pkg.module = prod
      ? join(esmDir, 'index.js')
      : join(sourceDir, `index${indexExtension}`);
    pkg.types = prod
      ? join(esmDir, 'index.d.ts')
      : join(sourceDir, `index${indexExtension}`);
  }

  pkg.exports = {
    ...moduleExports,
    './package.json': './package.json',
  };

  return pkg;
}

/**
 * Write package.json with error handling, preserving original structure
 * @param {string} rootPath - Root path of the package
 * @param {boolean} [prod=false] - Whether to generate for production
 */
export function writePackageJson(rootPath, prod = false) {
  try {
    const pkgPath = join(rootPath, 'package.json');
    const currentContents = readFileSync(pkgPath, 'utf-8');

    // Read original package.json object (preserves property order)
    const pkg = JSON.parse(currentContents);

    // Check if original package.json had a types field BEFORE any modifications
    const originalHadTypes = 'types' in pkg;

    // Calculate what the new values should be
    const sourcePath = getSourcePath(rootPath);
    const allPublicFiles = getPublicFiles(sourcePath);

    // Filter out bin files from exports
    const binFilePaths = getBinFilePaths(pkg, sourcePath);
    const publicFiles = filterBinFromPublicFiles(
      allPublicFiles,
      binFilePaths,
      sourcePath,
    );

    const sourceDir = getSourceDir();
    const cjsDir = getCJSDir();
    const esmDir = getESMDir();
    const builds = getPackageBuilds(rootPath);

    const indexExtension = getIndexFileExtension(sourcePath, prod);
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

      if (!prod) {
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

      // Production mode: different formats point to different built files
      const esmExport = `./${join(esmDir, relativePath)}.js`;
      const cjsExport = `./${join(cjsDir, relativePath)}.cjs`;

      // Add types export first (Node.js best practice)
      if (willHaveTypesField) {
        // ESM types take precedence over CJS types (matches package.json logic)
        if ('esm' in builds) {
          exportConfig.types = `./${join(esmDir, relativePath)}.d.ts`;
        } else if ('cjs' in builds) {
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
        if (name === 'index') {
          return { '.': getExports(path), ...acc };
        }
        const pathname = `./${name.replace(/\/index$/, '')}`;
        return { ...acc, [pathname]: getExports(path) };
      },
      /** @type {Record<string, any>} */ ({}),
    );

    // Directly mutate the original object (preserves property order)
    if ('cjs' in builds) {
      pkg.main = prod
        ? join(cjsDir, 'index.cjs')
        : join(sourceDir, `index${indexExtension}`);
      if (originalHadTypes) {
        pkg.types = prod
          ? join(cjsDir, 'index.d.ts')
          : join(sourceDir, `index${indexExtension}`);
      }
    }

    if ('esm' in builds) {
      pkg.module = prod
        ? join(esmDir, 'index.js')
        : join(sourceDir, `index${indexExtension}`);
      if (originalHadTypes) {
        pkg.types = prod
          ? join(esmDir, 'index.d.ts')
          : join(sourceDir, `index${indexExtension}`);
      }
    }

    // Update bin field(s) to point to appropriate files based on dev/prod mode
    if (pkg.bin) {
      if (typeof pkg.bin === 'string') {
        // Simple string bin
        if (prod) {
          if ('cjs' in builds) {
            pkg.bin = pkg.bin
              .replace(/^\.\/src\//, `./cjs/`)
              .replace(/\.js$/, '.cjs');
          } else if ('esm' in builds) {
            pkg.bin = pkg.bin.replace(/^\.\/src\//, `./esm/`);
          }
        } else {
          // Development mode: ensure bin points to source
          if (pkg.bin.startsWith('./cjs/') || pkg.bin.startsWith('./esm/')) {
            pkg.bin = pkg.bin
              .replace(/^\.\/(?:cjs|esm)\//, `./src/`)
              .replace(/\.cjs$/, '.js');
          }
        }
      } else if (typeof pkg.bin === 'object') {
        // Object with multiple bins
        for (const [name, binPath] of Object.entries(pkg.bin)) {
          if (typeof binPath === 'string') {
            if (prod && binPath.startsWith('./src/')) {
              if ('cjs' in builds) {
                pkg.bin[name] = binPath
                  .replace(/^\.\/src\//, `./cjs/`)
                  .replace(/\.js$/, '.cjs');
              } else if ('esm' in builds) {
                pkg.bin[name] = binPath.replace(/^\.\/src\//, `./esm/`);
              }
            } else if (
              !prod &&
              (binPath.startsWith('./cjs/') || binPath.startsWith('./esm/'))
            ) {
              // Development mode: ensure bin points to source
              pkg.bin[name] = binPath
                .replace(/^\.\/(?:cjs|esm)\//, `./src/`)
                .replace(/\.cjs$/, '.js');
            }
          }
        }
      }
    }

    // Update exports (this is the key part - direct property mutation)
    pkg.exports = {
      ...moduleExports,
      './package.json': './package.json',
    };

    // Compare and write if changed
    const nextContents = `${JSON.stringify(pkg, null, 2)}\n`;

    if (currentContents === nextContents) {
      return; // No changes needed
    }

    writeFileSync(pkgPath, nextContents);
    console.log(`${chalk.blue(pkg.name)} - Updated package.json`);
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

    const buildFolders = getBuildFolders(rootPath);
    let cleanedCount = 0;

    buildFolders.forEach((folder) => {
      const folderPath = join(rootPath, folder);
      if (existsSync(folderPath)) {
        try {
          rimraf.sync(folderPath);
          console.log(chalk.gray(`   Removed: ${folder}`));
          cleanedCount++;
        } catch (error) {
          console.warn(
            chalk.yellow(
              `   Warning: Could not remove ${folder}: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
        }
      }
    });

    if (cleanedCount === 0) {
      console.log(chalk.gray('   No build artifacts found to clean'));
    } else {
      console.log(
        chalk.green(
          `   Cleaned ${cleanedCount} build ${cleanedCount === 1 ? 'directory' : 'directories'}`,
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
    // const pkg = readPackageJson(rootPath); // Currently unused
    const buildFolders = getBuildFolders(rootPath);

    if (buildFolders.length === 0) {
      console.log(chalk.gray('   No build folders to add to .gitignore'));
      return;
    }

    // Generate the build artifacts section
    const buildArtifactsSection = [
      '# Build artifacts (auto-generated by libsync)',
      '# Do not edit this section manually - it will be overwritten',
      ...buildFolders.sort().map((name) => `/${name}`),
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
          `   Updated .gitignore with ${buildFolders.length} build ${buildFolders.length === 1 ? 'directory' : 'directories'}`,
        ),
      );
    } else {
      console.log(
        chalk.green(
          `   Created .gitignore with ${buildFolders.length} build ${buildFolders.length === 1 ? 'directory' : 'directories'}`,
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
 * Create proxy packages for sub-modules
 * @param {string} rootPath - Root path of the package
 */
export function makeProxies(rootPath) {
  try {
    // const pkg = readPackageJson(rootPath); // Currently unused
    const proxyFolders = getProxyFolders(rootPath);
    /** @type {string[]} */
    const created = [];

    Object.entries(proxyFolders).forEach(([name, path]) => {
      try {
        const proxyDir = join(rootPath, name);
        fse.ensureDirSync(proxyDir);

        const proxyPackageJson = generateProxyPackageJson(rootPath, name, path);
        writeFileSync(join(proxyDir, 'package.json'), proxyPackageJson);

        created.push(chalk.green(name));
      } catch (error) {
        console.warn(
          chalk.yellow(
            `Warning: Could not create proxy for ${name}: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      }
    });

    if (created.length > 0) {
      console.log(
        chalk.green(
          `   Created ${created.length} proxy ${created.length === 1 ? 'package' : 'packages'}: ${created.join(', ')}`,
        ),
      );
    }
  } catch (error) {
    console.warn(
      chalk.yellow(
        `Warning: Could not create proxy packages: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
}

/**
 * Generate proxy package.json content
 * @param {string} rootPath - Root path of the package
 * @param {string} moduleName - Name of the module
 * @param {string} path - Path to the module
 * @returns {string} JSON string for proxy package.json
 */
function generateProxyPackageJson(rootPath, moduleName, path) {
  const pkg = readPackageJson(rootPath);
  const builds = getPackageBuilds(rootPath);

  const mainDir = getCJSDir();
  const moduleDir = getESMDir();
  const prefix = '../'.repeat(moduleName.split('/').length);

  /** @type {Record<string, any>} */
  const proxyPkg = {
    name: `${pkg.name}/${moduleName}`,
    private: true,
    sideEffects: false,
  };

  if ('esm' in builds) {
    proxyPkg.module = join(prefix, moduleDir, `${path}.js`);
    proxyPkg.types = join(prefix, moduleDir, `${path}.d.ts`);
  }

  if ('cjs' in builds) {
    proxyPkg.main = join(prefix, mainDir, `${path}.cjs`);
    proxyPkg.types = join(prefix, mainDir, `${path}.d.ts`);
  }

  return JSON.stringify(proxyPkg, null, 2);
}
