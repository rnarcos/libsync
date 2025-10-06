/**
 * @fileoverview Project validation utilities
 * Comprehensive validation for project structure, configuration, and dependencies
 */

import { existsSync, statSync } from 'fs';
import { join, resolve } from 'path';
import chalk from 'chalk';
import { glob } from 'glob';
import { packageJsonSchema, tsConfigSchema } from '../schemas/config.js';
import { readPackageJson } from './package.js';

/**
 * Display a welcome message with tool information
 */
export function displayWelcomeMessage() {
  console.log(chalk.blue('🔧 libsync'));
  console.log(chalk.gray('   A CLI tool for library maintainers using tsup\n'));
}

/**
 * Path validation result
 * @typedef {Object} PathValidationResult
 * @property {boolean} isValid - Whether the path is valid
 * @property {string} [error] - Error message if invalid
 */

/**
 * Validates if a path exists and is accessible
 * @param {string} path - Path to validate
 * @returns {PathValidationResult} Validation result
 */
export function validatePath(path) {
  try {
    const resolvedPath = resolve(path);

    if (!existsSync(resolvedPath)) {
      return {
        isValid: false,
        error: `Path does not exist: ${resolvedPath}`,
      };
    }

    const stats = statSync(resolvedPath);
    if (!stats.isDirectory()) {
      return {
        isValid: false,
        error: `Path is not a directory: ${resolvedPath}`,
      };
    }

    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: `Cannot access path: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Package validation result
 * @typedef {Object} PackageValidationResult
 * @property {boolean} isValid - Whether the package is valid
 * @property {import('../schemas/config.js').PackageJson} [packageJson] - Parsed package.json
 * @property {string[]} warnings - Warning messages
 * @property {string[]} errors - Error messages
 */

/**
 * Validates package.json structure and provides helpful suggestions
 * @param {string} packagePath - Path to the package directory
 * @returns {PackageValidationResult} Validation result
 */
export function validatePackageJson(packagePath) {
  const warnings = /** @type {PackageValidationResult['warnings']} */ ([]);
  const errors = /** @type {PackageValidationResult['errors']} */ ([]);
  const packageJsonPath = join(packagePath, 'package.json');

  if (!existsSync(packageJsonPath)) {
    errors.push(`package.json not found at: ${packageJsonPath}`);
    return { isValid: false, warnings, errors };
  }

  try {
    const packageJson = readPackageJson(packagePath);
    const validationResult = packageJsonSchema.safeParse(packageJson);

    if (!validationResult.success) {
      errors.push('package.json validation failed:');
      validationResult.error.issues.forEach((issue) => {
        errors.push(`  • ${issue.path.join('.')}: ${issue.message}`);
      });
      return { isValid: false, packageJson, warnings, errors };
    }

    const validatedPackage = validationResult.data;

    // Check for common configuration issues
    if (
      !validatedPackage.main &&
      !validatedPackage.module &&
      !validatedPackage.bin
    ) {
      warnings.push(
        'No main, module, or bin field found - package may not be buildable',
      );
    }

    if (validatedPackage.type === undefined) {
      warnings.push(
        'No "type" field specified - consider adding "type": "module" for ES modules',
      );
    }

    if (
      !validatedPackage.types &&
      !validatedPackage.typings &&
      (validatedPackage.main || validatedPackage.module)
    ) {
      warnings.push(
        'No types/typings field found - TypeScript consumers may not get type definitions',
      );
    }

    // Check if package.json is in development mode (pointing to source files)
    const isDevMode =
      (validatedPackage.main && validatedPackage.main.includes('src/')) ||
      (validatedPackage.module && validatedPackage.module.includes('src/')) ||
      (validatedPackage.types && validatedPackage.types.includes('src/'));

    // Only validate production-style paths if not in development mode
    if (!isDevMode) {
      if (
        validatedPackage.main &&
        !validatedPackage.main.includes('cjs') &&
        !validatedPackage.main.includes('.cjs')
      ) {
        warnings.push(
          'Main field may not point to a CommonJS file - consider using .cjs extension or cjs/ directory',
        );
      }

      if (
        validatedPackage.module &&
        !validatedPackage.module.includes('esm') &&
        !validatedPackage.module.includes('.js')
      ) {
        warnings.push(
          'Module field may not point to an ES module file - consider using esm/ directory',
        );
      }
    }

    return { isValid: true, packageJson: validatedPackage, warnings, errors };
  } catch (error) {
    errors.push(
      `Error reading package.json: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { isValid: false, warnings, errors };
  }
}

/**
 * TypeScript configuration validation result
 * @typedef {Object} TsConfigValidationResult
 * @property {boolean} isValid - Whether the configuration is valid
 * @property {string[]} warnings - Warning messages
 * @property {string[]} errors - Error messages
 */

/**
 * Validates TypeScript configuration
 * @param {string} packagePath - Path to the package directory
 * @returns {Promise<TsConfigValidationResult>} Validation result
 */
export async function validateTsConfig(packagePath) {
  const warnings = [];
  const errors = [];
  const tsConfigPath = join(packagePath, 'tsconfig.json');
  const buildTsConfigPath = join(packagePath, 'tsconfig.build.json');

  if (!existsSync(tsConfigPath)) {
    warnings.push(
      'tsconfig.json not found - TypeScript compilation may not work properly',
    );
  } else {
    try {
      const { readFileSync } = await import('fs');
      const tsConfig = JSON.parse(readFileSync(tsConfigPath, 'utf-8'));
      const validationResult = tsConfigSchema.safeParse(tsConfig);

      if (!validationResult.success) {
        warnings.push('tsconfig.json has validation issues:');
        validationResult.error.issues.forEach((issue) => {
          warnings.push(`  • ${issue.path.join('.')}: ${issue.message}`);
        });
      }
    } catch (error) {
      errors.push(
        `Error reading tsconfig.json: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (!existsSync(buildTsConfigPath)) {
    warnings.push(
      'tsconfig.build.json not found - build process may not work properly',
    );
    warnings.push(
      '  Consider creating tsconfig.build.json that extends tsconfig.json',
    );
  }

  return { isValid: errors.length === 0, warnings, errors };
}

/**
 * Source structure validation result
 * @typedef {Object} SourceValidationResult
 * @property {boolean} isValid - Whether the source structure is valid
 * @property {string[]} warnings - Warning messages
 * @property {string[]} errors - Error messages
 */

/**
 * Validates source directory structure
 * @param {string} packagePath - Path to the package directory
 * @returns {SourceValidationResult} Validation result
 */
export function validateSourceStructure(packagePath) {
  const warnings = /** @type {SourceValidationResult['warnings']} */ ([]);
  const errors = /** @type {SourceValidationResult['errors']} */ ([]);
  const srcPath = join(packagePath, 'src');

  if (!existsSync(srcPath)) {
    errors.push('src/ directory not found');
    errors.push('  Create a src/ directory with your source files');
    return { isValid: false, warnings, errors };
  }

  const indexFiles = glob.sync('index.{ts,js,tsx,jsx,cjs,mjs,cts,mts}', {
    cwd: srcPath,
  });
  if (indexFiles.length === 0) {
    warnings.push('No index file found in src/ directory');
    warnings.push(
      '  Consider creating src/index.ts, src/index.js, or src/index.cjs as the main entry point',
    );
  }

  const sourceFiles = glob.sync('**/*.{ts,js,tsx,jsx,cjs,mjs,cts,mts}', {
    cwd: srcPath,
    ignore: ['**/*.test.*', '**/*.spec.*', '**/__tests__/**'],
  });

  if (sourceFiles.length === 0) {
    errors.push('No source files found in src/ directory');
    return { isValid: false, warnings, errors };
  }

  const hasTypeScript = sourceFiles.some(
    (file) => file.endsWith('.ts') || file.endsWith('.tsx'),
  );
  const hasJavaScript = sourceFiles.some(
    (file) => file.endsWith('.js') || file.endsWith('.jsx'),
  );

  if (hasTypeScript && hasJavaScript) {
    warnings.push('Mix of TypeScript and JavaScript files found');
    warnings.push(
      '  Consider using consistent file extensions for better maintainability',
    );
  }

  return { isValid: true, warnings, errors };
}

/**
 * Workspace structure validation result
 * @typedef {Object} WorkspaceValidationResult
 * @property {boolean} isValid - Whether the workspace structure is valid
 * @property {string[]} warnings - Warning messages
 * @property {string[]} errors - Error messages
 */

/**
 * Validates workspace structure for monorepos
 * @param {string} rootPath - Root path of the monorepo
 * @param {string[]} workspaces - Workspace directory names
 * @returns {WorkspaceValidationResult} Validation result
 */
export function validateWorkspaceStructure(rootPath, workspaces) {
  const warnings = [];
  const errors = [];

  // Check for workspace configuration files
  const workspaceConfigFiles = [
    'pnpm-workspace.yaml',
    'lerna.json',
    'rush.json',
    'nx.json',
  ];

  const foundConfigs = workspaceConfigFiles.filter((config) =>
    existsSync(join(rootPath, config)),
  );

  if (foundConfigs.length === 0) {
    warnings.push('No workspace configuration found');
    warnings.push(
      '  Consider adding pnpm-workspace.yaml, lerna.json, or similar for monorepo management',
    );
  }

  // Check workspace directories
  const missingWorkspaces = workspaces.filter(
    (workspace) => !existsSync(join(rootPath, workspace)),
  );

  if (missingWorkspaces.length > 0) {
    errors.push(
      `Workspace directories not found: ${missingWorkspaces.join(', ')}`,
    );
    errors.push(`  Create these directories or adjust --workspaces parameter`);
  }

  // Check for packages in workspaces
  const packagesFound = workspaces
    .filter((workspace) => existsSync(join(rootPath, workspace)))
    .reduce((total, workspace) => {
      const workspacePath = join(rootPath, workspace);
      const packages = glob.sync('*/package.json', { cwd: workspacePath });
      return total + packages.length;
    }, 0);

  if (packagesFound === 0) {
    warnings.push('No packages found in workspace directories');
    warnings.push(
      '  Ensure your packages are properly structured with package.json files',
    );
  }

  return { isValid: errors.length === 0, warnings, errors };
}

/**
 * Main project structure validation
 * @param {string} projectPath - Path to the project directory
 * @param {'build' | 'clean' | 'dev'} command - Command being executed
 * @returns {Promise<void>} Validation promise
 */
export async function checkProjectStructure(projectPath, command) {
  console.log(
    chalk.blue(`🔍 Validating project structure for ${command} command...`),
  );

  const pathValidation = validatePath(projectPath);
  if (!pathValidation.isValid) {
    throw new Error(`Invalid project path: ${pathValidation.error}`);
  }

  let hasErrors = false;
  /** @type {string[]} */
  const allWarnings = [];

  if (command === 'dev') {
    // For dev command, we might be in a monorepo root
    const rootPackageJson = join(projectPath, 'package.json');
    if (existsSync(rootPackageJson)) {
      console.log(
        chalk.gray('   Detected package.json in root - validating...'),
      );

      const packageValidation = validatePackageJson(projectPath);

      if (!packageValidation.isValid) {
        console.log(chalk.yellow('⚠️  Root package.json validation issues:'));
        packageValidation.errors.forEach((error) => {
          console.log(chalk.red(`   • ${error}`));
        });
      }

      allWarnings.push(...packageValidation.warnings);
    }
  } else {
    // For build/clean, validate the target package
    console.log(chalk.gray('   Validating package.json...'));
    const packageValidation = validatePackageJson(projectPath);

    if (!packageValidation.isValid) {
      hasErrors = true;
      console.log(chalk.red('❌ Package validation failed:'));
      packageValidation.errors.forEach((error) => {
        console.log(chalk.red(`   • ${error}`));
      });
    }

    allWarnings.push(...packageValidation.warnings);

    if (command === 'build') {
      console.log(chalk.gray('   Validating TypeScript configuration...'));
      const tsConfigValidation = await validateTsConfig(projectPath);
      allWarnings.push(...tsConfigValidation.warnings);

      if (!tsConfigValidation.isValid) {
        tsConfigValidation.errors.forEach((error) => {
          console.log(chalk.red(`   • ${error}`));
        });
      }

      console.log(chalk.gray('   Validating source structure...'));
      const sourceValidation = validateSourceStructure(projectPath);

      if (!sourceValidation.isValid) {
        hasErrors = true;
        console.log(chalk.red('❌ Source structure validation failed:'));
        sourceValidation.errors.forEach((error) => {
          console.log(chalk.red(`   • ${error}`));
        });
      }

      allWarnings.push(...sourceValidation.warnings);
    }
  }

  // Display warnings
  if (allWarnings.length > 0) {
    console.log(chalk.yellow('⚠️  Configuration warnings:'));
    allWarnings.forEach((warning) => {
      console.log(chalk.yellow(`   • ${warning}`));
    });
  }

  if (hasErrors) {
    throw new Error(
      'Project structure validation failed. Use --skip-validation to bypass these checks.',
    );
  }

  if (allWarnings.length === 0) {
    console.log(chalk.green('✅ Project structure looks good!'));
  } else {
    console.log(
      chalk.green('✅ Project structure validation completed with warnings'),
    );
  }

  console.log(); // Add spacing
}
