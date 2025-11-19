#!/usr/bin/env node

/**
 * @fileoverview Verdaccio Staging Server Wrapper for libsync
 *
 * This script wraps Verdaccio to provide a local staging registry for testing packages.
 * Designed to work when libsync is installed in node_modules of external repositories.
 *
 * Key Features:
 * - Validates packages and verifies they are built
 * - Starts or reuses Verdaccio on a specified port
 * - Always allows republishing same versions (force mode by default)
 * - Uses OS temp directory for storage (no file mutations in library directory)
 * - Automatically handles authentication for open-access registry
 */

import { setDefaultResultOrder } from 'dns';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import chalk from 'chalk';
import { spawn } from 'cross-spawn';
import { runServer } from 'verdaccio';

import { packageJsonSchema } from '../schemas/commands-config.js';
import { initConfig } from '../utils/config.js';
import {
  checkPortAvailable,
  promptUser,
  findAvailablePort,
} from '../utils/input.js';
import {
  PackageError,
  ConfigurationError,
  getPackageBuilds,
} from '../utils/package.js';

// Configure Node.js to prefer IPv4 for localhost connections
setDefaultResultOrder('ipv4first');

/**
 * Create fetch options with timeout using AbortController
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {RequestInit} [options={}] - Additional fetch options
 * @returns {RequestInit} Fetch options with signal for timeout
 */
function createFetchWithTimeout(timeoutMs, options = {}) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return {
    ...options,
    signal: controller.signal,
  };
}

/**
 * Create Verdaccio configuration object with ephemeral storage
 * @param {number} port - Registry port
 * @param {string} packageName - Package name to configure for publishing
 * @returns {{config: Object, verdaccioDir: string, registryUrl: string, cleanup: Function}} Verdaccio config and cleanup
 */
function createVerdaccioConfig(port, packageName) {
  const verdaccioDir = mkdtempSync(join(tmpdir(), 'libsync-verdaccio-'));

  console.log(chalk.gray(`📦 Verdaccio storage: ${verdaccioDir}`));

  // Verdaccio configuration with completely open access for staging
  // Using $all for all permissions - no real authentication required
  const config = {
    storage: verdaccioDir,
    configPath: verdaccioDir,
    self_path: verdaccioDir,

    uplinks: {
      npmjs: {
        url: 'https://registry.npmjs.org/',
      },
    },

    // Open access for all packages - this is a local staging server
    packages: {
      [packageName]: {
        access: '$all',
        publish: '$all',
        unpublish: '$all',
        proxy: 'npmjs',
      },
      '@*/*': {
        access: '$all',
        publish: '$all',
        unpublish: '$all',
        proxy: 'npmjs',
      },
      '**': {
        access: '$all',
        publish: '$all',
        unpublish: '$all',
        proxy: 'npmjs',
      },
    },

    logs: [{ type: 'stdout', format: 'pretty', level: 'warn' }],

    web: {
      enable: true,
      title: 'libsync Staging Registry',
    },

    // Legacy API for simpler authentication
    security: {
      api: {
        legacy: true,
      },
    },
  };

  const cleanup = () => {
    try {
      rmSync(verdaccioDir, { recursive: true, force: true });
      console.log(chalk.gray('🧹 Cleaned up temporary storage'));
    } catch (error) {
      // Ignore cleanup errors
    }
  };

  return {
    config,
    verdaccioDir,
    registryUrl: `http://127.0.0.1:${port}`,
    cleanup,
  };
}

/**
 * Start Verdaccio server using programmatic API
 * @param {Object} config - Verdaccio configuration object
 * @param {number} port - Registry port
 * @returns {Promise<{server: any, url: string, port: number, cleanup?: Function}>} HTTP server instance and registry URL
 */
async function startVerdaccio(config, port) {
  console.log(chalk.blue('🚀 Starting Verdaccio registry...'));

  try {
    const app = await runServer(config);

    return new Promise((resolve, reject) => {
      const server = app.listen(port, '0.0.0.0', () => {
        console.log(
          chalk.green(
            `✅ Verdaccio registry started on http://127.0.0.1:${port}`,
          ),
        );

        // Wait a moment for server to be ready, then resolve
        setTimeout(() => {
          resolve({
            server,
            url: `http://127.0.0.1:${port}`,
            port,
          });
        }, 1000);
      });

      server.on('error', (/** @type {any} */ error) => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use`));
        } else {
          reject(error);
        }
      });
    });
  } catch (error) {
    throw new Error(
      `Failed to start Verdaccio: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Check if a Verdaccio server is already running on the port
 * @param {string} registryUrl - Registry URL to check
 * @returns {Promise<{isVerdaccio: boolean, isRunning: boolean}>} Server status
 */
async function checkExistingVerdaccioServer(registryUrl) {
  try {
    const pingResponse = await fetch(
      `${registryUrl}/-/ping`,
      createFetchWithTimeout(3000, { method: 'GET' }),
    );

    if (!pingResponse.ok) {
      return { isVerdaccio: false, isRunning: false };
    }

    // Check if it's Verdaccio by trying the whoami endpoint
    try {
      const whoamiResponse = await fetch(
        `${registryUrl}/-/whoami`,
        createFetchWithTimeout(3000, { method: 'GET' }),
      );

      const isVerdaccio =
        whoamiResponse.status === 200 || whoamiResponse.status === 401;

      return { isVerdaccio, isRunning: true };
    } catch {
      return { isVerdaccio: false, isRunning: true };
    }
  } catch (error) {
    return { isVerdaccio: false, isRunning: false };
  }
}

/**
 * Verify Verdaccio registry is responding
 * @param {string} registryUrl - Registry URL to verify
 * @returns {Promise<boolean>} True if registry is accessible
 */
async function verifyRegistryAccess(registryUrl) {
  try {
    const response = await fetch(
      `${registryUrl}/-/ping`,
      createFetchWithTimeout(5000, { method: 'GET' }),
    );
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Ensure .gitignore includes .npmrc files
 * @param {string} packagePath - Path to package
 */
function ensureNpmrcInGitignore(packagePath) {
  const gitignorePath = join(packagePath, '.gitignore');

  let gitignoreContent = '';
  let hasNpmrcEntry = false;

  if (existsSync(gitignorePath)) {
    gitignoreContent = readFileSync(gitignorePath, 'utf-8');
    hasNpmrcEntry =
      gitignoreContent.includes('.npmrc') ||
      gitignoreContent.includes('*.npmrc') ||
      gitignoreContent.includes('.npmrc*');
  }

  if (!hasNpmrcEntry) {
    const npmrcEntry =
      gitignoreContent.endsWith('\n') || gitignoreContent === ''
        ? '# npm configuration files\n.npmrc*\n'
        : '\n# npm configuration files\n.npmrc*\n';

    writeFileSync(gitignorePath, gitignoreContent + npmrcEntry);
    console.log(chalk.gray('✓ Added .npmrc* to .gitignore'));
  }
}

/**
 * Create temporary .npmrc file with registry and authentication
 * For Verdaccio with $all access, we create a dummy auth token
 * @param {string} packagePath - Path to package
 * @param {string} registryUrl - Registry URL
 * @returns {string} Path to temporary .npmrc file
 */
function createTempNpmrc(packagePath, registryUrl) {
  const npmrcPath = join(packagePath, '.npmrc.staging');
  const url = new URL(registryUrl);

  // npm requires an auth token even for open registries
  // Create a dummy token that Verdaccio will accept with $all permissions
  const dummyToken = Buffer.from('dummy-user:dummy-pass').toString('base64');

  const npmrcContent = [
    `# libsync staging registry configuration`,
    `# Auto-generated - will be cleaned up after publishing`,
    ``,
    `registry=${registryUrl}`,
    ``,
    `# Authentication token for open-access Verdaccio`,
    `//${url.host}/:_auth="${dummyToken}"`,
    `//${url.host}/:always-auth=false`,
    ``,
  ].join('\n');

  writeFileSync(npmrcPath, npmrcContent);
  console.log(chalk.gray(`✓ Created .npmrc.staging`));
  return npmrcPath;
}

/**
 * Get package information from package.json with validation
 * @param {string} packagePath - Path to package
 * @returns {import('zod').infer<typeof packageJsonSchema>} Validated package info
 */
function getPackageInfo(packagePath) {
  const pkgPath = join(packagePath, 'package.json');
  if (!existsSync(pkgPath)) {
    throw new PackageError('package.json not found');
  }

  const rawPkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

  try {
    const pkg = packageJsonSchema.parse(rawPkg);
    return pkg;
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'errors' in error &&
      Array.isArray(error.errors)
    ) {
      const errorMessages = error.errors.map(
        (/** @type {any} */ err) => `${err.path.join('.')}: ${err.message}`,
      );
      throw new PackageError(
        `Invalid package.json:\n  ${errorMessages.join('\n  ')}`,
      );
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new PackageError(`Invalid package.json: ${errorMessage}`);
  }
}

/**
 * Check if package version exists in registry
 * @param {string} packageName - Package name
 * @param {string} version - Package version
 * @param {string} registryUrl - Registry URL
 * @returns {Promise<boolean>} True if package version exists
 */
async function checkPackageExists(packageName, version, registryUrl) {
  try {
    const response = await fetch(
      `${registryUrl}/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}`,
      createFetchWithTimeout(5000, { method: 'GET' }),
    );

    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Unpublish package version from registry
 * @param {string} packageName - Package name
 * @param {string} version - Package version
 * @param {string} registryUrl - Registry URL
 * @param {string} npmrcPath - Path to npmrc file
 * @param {string} cwd - Working directory
 * @returns {Promise<void>}
 */
async function unpublishPackage(
  packageName,
  version,
  registryUrl,
  npmrcPath,
  cwd,
) {
  console.log(chalk.gray('   Unpublishing existing version...'));

  await new Promise((resolve) => {
    const unpublish = spawn(
      'npm',
      [
        'unpublish',
        `${packageName}@${version}`,
        '--registry',
        registryUrl,
        '--userconfig',
        npmrcPath,
        '--force',
      ],
      {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    const timeout = setTimeout(() => {
      unpublish.kill();
      resolve(undefined);
    }, 10000);

    unpublish.on('close', () => {
      clearTimeout(timeout);
      resolve(undefined);
    });

    unpublish.on('error', () => {
      clearTimeout(timeout);
      resolve(undefined);
    });
  });

  console.log(chalk.gray('   ✓ Unpublished existing version'));
}

/**
 * Verify package was published successfully
 * @param {string} packageName - Package name
 * @param {string} version - Package version
 * @param {string} registryUrl - Registry URL
 * @returns {Promise<boolean>} True if package exists
 */
async function verifyPackagePublished(packageName, version, registryUrl) {
  try {
    const response = await fetch(
      `${registryUrl}/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}`,
      createFetchWithTimeout(10000, { method: 'GET' }),
    );
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Publish package to registry - always forces republishing
 * @param {string} packagePath - Path to package
 * @param {string} registryUrl - Registry URL
 * @param {import('zod').infer<typeof packageJsonSchema>} packageInfo - Package information
 * @returns {Promise<void>}
 */
async function publishToRegistry(packagePath, registryUrl, packageInfo) {
  // Validate package
  if (!packageInfo.version) {
    throw new PackageError(
      `Package "${packageInfo.name}" must have a version specified in package.json`,
    );
  }

  if (packageInfo.private) {
    throw new PackageError(
      `Package "${packageInfo.name}" is marked as private and cannot be published`,
    );
  }

  console.log(chalk.blue('\n📦 Preparing to publish package'));
  console.log(
    chalk.gray(`   Package: ${packageInfo.name}@${packageInfo.version}`),
  );
  console.log(chalk.gray(`   Registry: ${registryUrl}`));

  // Safety check - ensure it's localhost
  const url = new URL(registryUrl);
  const isLocalhost =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1';

  if (!isLocalhost) {
    throw new ConfigurationError(
      'SECURITY: Registry must be localhost for staging',
      ['Use --port to specify a local port'],
    );
  }

  // Ensure .gitignore includes .npmrc files
  ensureNpmrcInGitignore(packagePath);

  // Create temporary .npmrc with registry and auth configuration
  const tempNpmrcPath = createTempNpmrc(packagePath, registryUrl);

  try {
    // Check if package version already exists
    const packageExists = await checkPackageExists(
      packageInfo.name,
      packageInfo.version,
      registryUrl,
    );

    if (packageExists) {
      console.log(
        chalk.yellow(
          `⚠️  ${packageInfo.name}@${packageInfo.version} already exists - will republish`,
        ),
      );

      // Unpublish existing version
      await unpublishPackage(
        packageInfo.name,
        packageInfo.version,
        registryUrl,
        tempNpmrcPath,
        packagePath,
      );
    }

    // Publish package
    console.log(chalk.blue('📤 Publishing to staging registry...'));

    await new Promise((resolve, reject) => {
      const publish = spawn(
        'npm',
        [
          'publish',
          '--registry',
          registryUrl,
          '--userconfig',
          tempNpmrcPath,
          '--no-git-checks',
          '--loglevel',
          'info',
        ],
        {
          cwd: packagePath,
          stdio: 'inherit',
        },
      );

      publish.on('close', (code) => {
        if (code === 0) {
          resolve(undefined);
        } else {
          reject(new Error(`npm publish failed with exit code ${code}`));
        }
      });

      publish.on('error', (error) => {
        reject(error);
      });
    });

    // Verify publication
    console.log(chalk.blue('🔍 Verifying publication...'));
    const published = await verifyPackagePublished(
      packageInfo.name,
      packageInfo.version,
      registryUrl,
    );

    if (published) {
      console.log(chalk.green('✅ Package published successfully!'));
      console.log(
        chalk.cyan(`\n📦 ${packageInfo.name}@${packageInfo.version}`),
      );
      console.log(chalk.cyan(`   View at: ${registryUrl}/${packageInfo.name}`));
    } else {
      console.log(
        chalk.yellow(
          '⚠️  Published but verification failed (may need time to index)',
        ),
      );
    }
  } finally {
    // Clean up temporary .npmrc
    if (existsSync(tempNpmrcPath)) {
      unlinkSync(tempNpmrcPath);
      console.log(chalk.gray('✓ Cleaned up .npmrc.staging'));
    }
  }
}

/**
 * Check if package is built and ready for publishing
 * @param {string} packagePath - Path to package
 * @throws {ConfigurationError} If package is not built
 */
function checkPackageBuilt(packagePath) {
  console.log(chalk.blue('🔍 Checking build status...'));

  try {
    const builds = getPackageBuilds(packagePath);
    const buildTypes = Object.keys(builds);

    if (buildTypes.length === 0) {
      throw new ConfigurationError('Package has not been built yet', [
        'Run the build command first:',
        '  npm run build',
        '  or',
        '  npx libsync build',
      ]);
    }

    // Check if build directories exist and have files
    for (const [buildType, buildPath] of Object.entries(builds)) {
      if (!existsSync(buildPath)) {
        throw new ConfigurationError(
          `Build directory '${buildType}' not found: ${buildPath}`,
          [
            'Run the build command to generate build files:',
            '  npm run build',
            '  or',
            '  npx libsync build',
          ],
        );
      }
    }

    console.log(chalk.green('   ✓ Package is built'));
    console.log(chalk.gray(`   Build types: ${buildTypes.join(', ')}`));
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw new ConfigurationError('Unable to verify build status', [
      'Ensure the package is built before publishing:',
      '  npm run build',
      '  or',
      '  npx libsync build',
    ]);
  }
}

/**
 * Main publish staging command
 * Wraps Verdaccio to provide a local staging registry for testing packages
 * @param {import('../schemas/commands-config.js').PublishStagingOptions} options - Command options
 */
export async function publishStaging(options) {
  const isCI = process.env.CI === 'true';

  try {
    const {
      port: requestedPort = 4873,
      path: packagePath = process.cwd(),
      reuseServer = true,
    } = options;

    // Initialize config before any operations
    await initConfig(packagePath);

    console.log(
      chalk.cyan(`\n🚀 ${chalk.bold('libsync')} - Staging Publisher`),
    );
    console.log(chalk.gray('   Verdaccio-powered local package testing\n'));

    // 1. Validate package
    console.log(chalk.blue('📋 Validating package...'));
    const packageInfo = getPackageInfo(packagePath);
    console.log(
      chalk.gray(`   Package: ${packageInfo.name}@${packageInfo.version}`),
    );
    console.log(chalk.green('   ✓ Package validated'));

    // 2. Check if package is built
    checkPackageBuilt(packagePath);

    // 3. Setup Verdaccio server
    console.log(chalk.blue(`\n🔍 Checking port ${requestedPort}...`));
    let port = requestedPort;
    let shouldStartServer = true;
    let serverInstance = null;
    const registryUrl = `http://localhost:${port}`;

    const portAvailable = await checkPortAvailable(port);

    if (!portAvailable) {
      // Check if existing server is Verdaccio
      const existingServer = await checkExistingVerdaccioServer(registryUrl);

      if (existingServer.isVerdaccio) {
        console.log(chalk.green(`✅ Found Verdaccio on port ${port}`));

        if (reuseServer || isCI) {
          shouldStartServer = false;
          console.log(chalk.gray('   Reusing existing server'));
        } else {
          const shouldReuse = await promptUser(
            chalk.cyan('   Reuse existing Verdaccio server? [Y/n]: '),
          );

          if (shouldReuse) {
            shouldStartServer = false;
          } else {
            const alternativePort = await findAvailablePort(port + 1);
            if (alternativePort) {
              port = alternativePort;
              console.log(chalk.yellow(`   Using alternative port ${port}`));
            } else {
              throw new Error('No available ports found');
            }
          }
        }
      } else {
        // Port in use by non-Verdaccio service
        if (isCI) {
          throw new Error(
            `Port ${port} is in use by another service. Cannot proceed in CI.`,
          );
        }

        const alternativePort = await findAvailablePort(port + 1);
        if (alternativePort) {
          console.log(
            chalk.yellow(`⚠️  Port ${port} in use by another service`),
          );
          port = alternativePort;
          console.log(chalk.gray(`   Using port ${port} instead`));
        } else {
          throw new Error('No available ports found');
        }
      }
    } else {
      console.log(chalk.green(`✅ Port ${port} is available`));
    }

    const finalRegistryUrl = `http://127.0.0.1:${port}`;

    // Start Verdaccio if needed
    if (shouldStartServer) {
      console.log(chalk.blue('\n🚀 Starting Verdaccio registry...'));
      const verdaccioConfig = createVerdaccioConfig(port, packageInfo.name);

      try {
        serverInstance = await startVerdaccio(verdaccioConfig.config, port);
        serverInstance.cleanup = verdaccioConfig.cleanup;

        const registryAccessible = await verifyRegistryAccess(finalRegistryUrl);
        if (!registryAccessible) {
          if (serverInstance.server) serverInstance.server.close();
          throw new Error('Verdaccio registry is not responding');
        }

        console.log(chalk.green('✅ Verdaccio is ready'));
      } catch (error) {
        // If port is in use, check if it's Verdaccio we can reuse
        if (
          error instanceof Error &&
          error.message.includes('already in use')
        ) {
          console.log(
            chalk.yellow("⚠️  Port is in use, checking if it's Verdaccio..."),
          );

          const existingServer =
            await checkExistingVerdaccioServer(finalRegistryUrl);

          if (existingServer.isVerdaccio) {
            console.log(chalk.green('✅ Found existing Verdaccio server'));
            shouldStartServer = false;
            serverInstance = null;

            // Verify it's accessible
            const registryAccessible =
              await verifyRegistryAccess(finalRegistryUrl);
            if (!registryAccessible) {
              throw new Error('Existing Verdaccio registry is not responding');
            }
          } else {
            // Port in use by non-Verdaccio service
            throw new Error(
              `Port ${port} is in use by another service. Please use a different port with --port <number>`,
            );
          }
        } else {
          throw error;
        }
      }
    } else {
      const registryAccessible = await verifyRegistryAccess(finalRegistryUrl);
      if (!registryAccessible) {
        throw new Error('Existing registry is not responding');
      }
    }

    // 4. Publish package (always force republish)
    await publishToRegistry(packagePath, finalRegistryUrl, packageInfo);

    // 5. Show success message and next steps
    console.log(
      chalk.green('\n✨ Successfully published to staging registry!\n'),
    );

    console.log(chalk.cyan('📖 Test your package:'));
    console.log(chalk.gray('   1. View in browser:'));
    console.log(chalk.cyan(`      ${finalRegistryUrl}`));
    console.log(chalk.gray('\n   2. Install in another project:'));
    console.log(
      chalk.cyan(
        `      npm install ${packageInfo.name} --registry ${finalRegistryUrl}`,
      ),
    );
    console.log(chalk.gray('\n   3. Use in package.json:'));
    console.log(chalk.cyan('      Add to .npmrc in your test project:'));
    console.log(chalk.gray(`      registry=${finalRegistryUrl}`));

    if (shouldStartServer) {
      console.log(chalk.gray('\n\n💡 Press Ctrl+C to stop the registry'));

      // Keep server running
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\n\n🛑 Stopping Verdaccio...'));
        if (serverInstance?.server) {
          serverInstance.server.close(() => {
            if (serverInstance?.cleanup) {
              serverInstance.cleanup();
            }
            console.log(chalk.gray('✓ Registry stopped'));
            process.exit(0);
          });
        } else {
          if (serverInstance?.cleanup) {
            serverInstance.cleanup();
          }
          process.exit(0);
        }
      });

      // Keep process alive
      await new Promise(() => {}); // Never resolves - wait for SIGINT
    } else {
      console.log(chalk.gray('\n\n💡 Existing registry will continue running'));
      console.log(chalk.gray('   You can publish more packages to it'));
      process.exit(0);
    }
  } catch (error) {
    if (error instanceof PackageError || error instanceof ConfigurationError) {
      console.error(chalk.red(`\n❌ ${error.message}`));
      if (error instanceof ConfigurationError && error.suggestions) {
        error.suggestions.forEach((suggestion) => {
          console.error(chalk.yellow(`   💡 ${suggestion}`));
        });
      }
    } else {
      console.error(chalk.red('\n❌ Staging publish failed'));
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(chalk.gray(`   ${errorMessage}`));
    }

    console.error(chalk.gray('\n💡 Troubleshooting:'));
    console.error(chalk.gray('   • Ensure package.json is valid'));
    console.error(chalk.gray('   • Check that the port is available'));
    console.error(chalk.gray('   • Try a different port: --port <number>'));
    console.error(chalk.gray('   • Skip build if already built: --no-build'));

    process.exit(1);
  }
}
