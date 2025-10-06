#!/usr/bin/env node

/**
 * @fileoverview Main CLI entry point with Commander.js
 * TypeScript-style CLI built with JavaScript and JSDoc type annotations
 */

import { program } from 'commander';
import chalk from 'chalk';
import { buildCommand } from './commands/build.js';
import { cleanCommand } from './commands/clean.js';
import { devCommand } from './commands/dev.js';
import { publishStaging } from './commands/publish-staging.js';
import { configValidation } from './schemas/config.js';
import {
  checkProjectStructure,
  displayWelcomeMessage,
} from './utils/validation.js';

// Display welcome message
displayWelcomeMessage();

program
  .name('libsync')
  .description('CLI tool for library maintainers using tsup')
  .version('1.0.0')
  .option('--verbose', 'Enable verbose logging', false);

program
  .command('build')
  .description('Build a library package using tsup')
  .option('-p, --path <path>', 'Package path to build', process.cwd())
  .option('-w, --watch', 'Watch for file changes and rebuild', false)
  .option('--skip-validation', 'Skip project structure validation', false)
  .action(async (options, cmd) => {
    const globalOptions = cmd.parent?.opts() || {};

    try {
      const validatedOptions = configValidation.build.parse({
        ...options,
        verbose: globalOptions.verbose,
      });

      if (!validatedOptions.skipValidation) {
        await checkProjectStructure(validatedOptions.path, 'build');
      }

      await buildCommand(validatedOptions);

      console.log(chalk.green(`\n✅ Build completed successfully!`));
      console.log(chalk.gray(`   Package location: ${validatedOptions.path}`));
    } catch (error) {
      console.error(chalk.red('\n❌ Build failed:'));

      if (error instanceof Error) {
        console.error(chalk.red(`   ${error.message}`));

        if (globalOptions.verbose && error.stack) {
          console.error(chalk.gray('\nStack trace:'));
          console.error(chalk.gray(error.stack));
        }
      } else {
        console.error(chalk.red(`   ${String(error)}`));
      }

      console.error(chalk.yellow('\n💡 Troubleshooting tips:'));
      console.error(
        chalk.yellow(
          '   • Ensure your package.json has proper main/module/bin fields',
        ),
      );
      console.error(
        chalk.yellow(
          '   • Check that your src/ directory exists and contains TypeScript/JavaScript files',
        ),
      );
      console.error(
        chalk.yellow('   • Verify tsconfig.build.json is properly configured'),
      );
      console.error(
        chalk.yellow('   • Use --verbose for detailed error information'),
      );
      console.error(
        chalk.yellow('   • Use --skip-validation to bypass structure checks\n'),
      );

      process.exit(1);
    }
  });

program
  .command('clean')
  .description('Clean build artifacts from a package')
  .option('-p, --path <path>', 'Package path to clean', process.cwd())
  .option('--skip-validation', 'Skip project structure validation', false)
  .action(async (options, cmd) => {
    const globalOptions = cmd.parent?.opts() || {};

    try {
      const validatedOptions = configValidation.clean.parse({
        ...options,
        verbose: globalOptions.verbose,
      });

      if (!validatedOptions.skipValidation) {
        await checkProjectStructure(validatedOptions.path, 'clean');
      }

      await cleanCommand(validatedOptions);

      console.log(chalk.green(`\n✅ Clean completed successfully!`));
      console.log(chalk.gray(`   Package location: ${validatedOptions.path}`));
    } catch (error) {
      console.error(chalk.red('\n❌ Clean failed:'));

      if (error instanceof Error) {
        console.error(chalk.red(`   ${error.message}`));

        if (globalOptions.verbose && error.stack) {
          console.error(chalk.gray('\nStack trace:'));
          console.error(chalk.gray(error.stack));
        }
      } else {
        console.error(chalk.red(`   ${String(error)}`));
      }

      console.error(chalk.yellow('\n💡 Troubleshooting tips:'));
      console.error(
        chalk.yellow(
          '   • Ensure the target directory exists and contains a package.json',
        ),
      );
      console.error(
        chalk.yellow(
          '   • Check that you have write permissions in the target directory',
        ),
      );
      console.error(
        chalk.yellow('   • Use --verbose for detailed error information\n'),
      );

      process.exit(1);
    }
  });

program
  .command('dev [paths...]')
  .description(
    'Generate development package.json for packages (accepts multiple paths)',
  )
  .option('-w, --watch', 'Watch for file changes', false)
  .option(
    '-p, --path <path>',
    'Package path to process (single package mode)',
    process.cwd(),
  )
  .action(async (pathsArg, options, cmd) => {
    const globalOptions = cmd.parent?.opts() || {};

    try {
      // If paths are provided as arguments, use those; otherwise use the -p flag
      const shouldUseMultipleMode = pathsArg && pathsArg.length > 0;

      if (shouldUseMultipleMode) {
        // Multiple paths mode - validate paths exist
        const validPaths = [];
        const invalidPaths = [];

        for (const path of pathsArg) {
          const { existsSync } = await import('fs');
          const { resolve } = await import('path');
          const resolvedPath = resolve(path);
          if (existsSync(resolvedPath)) {
            validPaths.push(resolvedPath);
          } else {
            invalidPaths.push(path);
          }
        }

        if (invalidPaths.length > 0) {
          console.error(
            chalk.yellow(`⚠️  Warning: The following paths do not exist:`),
          );
          invalidPaths.forEach((p) => console.error(chalk.yellow(`   • ${p}`)));
          console.log();
        }

        if (validPaths.length === 0) {
          throw new Error('No valid paths provided');
        }

        const validatedOptions = {
          watch: options.watch || false,
          path: process.cwd(), // Fallback, not used in multi-path mode
          paths: validPaths,
          verbose: globalOptions.verbose || false,
        };

        await devCommand(validatedOptions);

        if (validatedOptions.watch) {
          console.log(chalk.green(`\n✅ Dev mode started with file watching!`));
          console.log(chalk.yellow('   Press Ctrl+C to stop watching...\n'));
          // Keep process running for watch mode
        }
      } else {
        // Single package mode (original behavior)
        const validatedOptions = configValidation.dev.parse({
          ...options,
          verbose: globalOptions.verbose,
        });

        console.log(chalk.blue('📦 Processing current package'));
        await checkProjectStructure(validatedOptions.path, 'dev');

        await devCommand(validatedOptions);

        if (validatedOptions.watch) {
          console.log(chalk.green(`\n✅ Dev mode started with file watching!`));
          console.log(chalk.gray(`   Root path: ${validatedOptions.path}`));
          console.log(chalk.yellow('   Press Ctrl+C to stop watching...\n'));
          // Keep process running for watch mode
        } else {
          console.log(
            chalk.green('✅ Development package.json processing completed!'),
          );
          console.log(chalk.gray(`   Root path: ${validatedOptions.path}`));
        }
      }
    } catch (error) {
      console.error(chalk.red('\n❌ Dev command failed:'));

      if (error instanceof Error) {
        console.error(chalk.red(`   ${error.message}`));

        if (globalOptions.verbose && error.stack) {
          console.error(chalk.gray('\nStack trace:'));
          console.error(chalk.gray(error.stack));
        }
      } else {
        console.error(chalk.red(`   ${String(error)}`));
      }

      console.error(chalk.yellow('\n💡 Troubleshooting tips:'));
      console.error(chalk.yellow('   • Provide valid file or directory paths'));
      console.error(
        chalk.yellow(
          '   • Each path will be resolved to its closest package.json',
        ),
      );
      console.error(
        chalk.yellow('   • Check that packages have valid package.json files'),
      );
      console.error(
        chalk.yellow('   • Use --verbose for detailed error information\n'),
      );

      process.exit(1);
    }
  });

program
  .command('publish:staging')
  .description('Set up staging environment and publish package for testing')
  .option(
    '-p, --port <number>',
    'Registry port number',
    (value) => parseInt(value, 10),
    4873,
  )
  .option('--path <path>', 'Package path to publish', process.cwd())
  .option('--no-build', 'Skip building the package before publishing')
  .option(
    '--reuse-server',
    'Automatically reuse existing Verdaccio servers without prompting',
  )
  .option(
    '--force',
    'Force republish existing packages (overwrite existing versions)',
  )
  .option(
    '--staging-version',
    ' Use staging-specific versioning (adds staging suffix)',
  )
  .action(async (options, cmd) => {
    const globalOptions = cmd.parent?.opts() || {};

    try {
      const validatedOptions = configValidation.publishStaging.parse({
        ...options,
        verbose: globalOptions.verbose,
      });

      await publishStaging(validatedOptions);
    } catch (error) {
      console.error(chalk.red('\n❌ Staging setup failed:'));

      if (error instanceof Error) {
        console.error(chalk.red(`   ${error.message}`));

        if (globalOptions.verbose && error.stack) {
          console.error(chalk.gray('\nStack trace:'));
          console.error(chalk.gray(error.stack));
        }
      } else {
        console.error(chalk.red(`   ${String(error)}`));
      }

      console.error(chalk.yellow('\n💡 Troubleshooting tips:'));
      console.error(
        chalk.yellow(
          '   • Check that no other registry is running on the specified port',
        ),
      );
      console.error(
        chalk.yellow('   • Ensure your package.json is properly configured'),
      );
      console.error(
        chalk.yellow('   • Try a different port using --port <number>'),
      );
      console.error(
        chalk.yellow('   • Use --verbose for detailed error information\n'),
      );

      process.exit(1);
    }
  });

// Handle unknown commands
program.on('command:*', (operands) => {
  console.error(chalk.red(`\n❌ Unknown command: ${operands[0]}`));
  console.error(chalk.yellow('\n💡 Available commands:'));
  console.error(chalk.yellow('   • build - Build a library package'));
  console.error(chalk.yellow('   • clean - Clean build artifacts'));
  console.error(
    chalk.yellow('   • dev   - Generate development package.json files'),
  );
  console.error(
    chalk.yellow(
      '   • publish:staging - Set up staging environment for testing',
    ),
  );
  console.error(
    chalk.gray('\n   Use --help with any command for more information\n'),
  );
  process.exit(1);
});

// Handle no arguments
if (process.argv.length <= 2) {
  program.help();
}

program.parse();
