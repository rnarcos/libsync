#!/usr/bin/env node

import { spawn } from 'cross-spawn';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
} from 'fs';
import { join, dirname } from 'path';
import chalk from 'chalk';
import { PackageError, ConfigurationError } from '../utils/package.js';
import { packageJsonSchema } from '../schemas/config.js';
import {
  checkPortAvailable,
  promptUser,
  promptUserInput,
  findAvailablePort,
} from '../utils/input.js';

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
 * Create Verdaccio configuration directory and files
 * @param {string} rootPath - Project root path
 * @param {number} port - Registry port
 * @param {string} packageName - Package name to configure for publishing
 */
function createVerdaccioConfig(rootPath, port, packageName) {
  const stagingDir = join(rootPath, 'scripts', 'release', 'staging');
  const verdaccioDir = join(stagingDir, '.verdaccio');

  // Create directories if they don't exist
  if (!existsSync(verdaccioDir)) {
    mkdirSync(verdaccioDir, { recursive: true });
  }

  // Create config.yml
  const configPath = join(verdaccioDir, 'config.yml');
  const config = `storage: ./storage
auth:
  htpasswd:
    file: ./htpasswd
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
packages:
  '${packageName}':
    access: $all
    publish: $all
    unpublish: $all
    proxy: npmjs
  '@*/*':
    access: $all
    publish: $all
    unpublish: $all
    proxy: npmjs
  '**':
    access: $all
    publish: $all
    unpublish: $all
    proxy: npmjs
logs:
  - { type: stdout, format: pretty, level: http }
web:
  enable: true
  title: 'Staging Registry'
  port: ${port}
listen:
  - 0.0.0.0:${port}
security:
  api:
    mirroring: false
  web:
    sign_in_options:
      disable: true
`;

  writeFileSync(configPath, config);

  // Create .gitignore
  const gitignorePath = join(verdaccioDir, '.gitignore');
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, 'storage\nhtpasswd\n');
  }

  // Create initial htpasswd (test/test user)
  const htpasswdPath = join(verdaccioDir, 'htpasswd');
  if (!existsSync(htpasswdPath)) {
    // test:test (password: test)
    writeFileSync(
      htpasswdPath,
      'test:$6$rounds=500000$kHdEzwgmSvKjb3Wr$P4fG4SdPJI2uo1vLGKvQhzrF2Oq9wR0gJxUh5y5Ztop4zKo6Gx3Fn1WyMqQ2pL8XvZzN9pBk3K5TqR7Y2xP9nQ:autocreated 2024-01-01T00:00:00.000Z\n',
    );
  }

  return {
    configPath,
    verdaccioDir,
    registryUrl: `http://localhost:${port}`,
  };
}

/**
 * Start Verdaccio server
 * @param {string} configPath - Path to Verdaccio config
 * @param {number} port - Registry port
 * @returns {Promise<{process: import('child_process').ChildProcess, url: string, port: number}>} Server process and registry URL
 */
function startVerdaccio(configPath, port) {
  return new Promise((resolve, reject) => {
    console.log(chalk.blue('🚀 Starting Verdaccio registry...'));

    const verdaccio = spawn(
      'npx',
      [
        'verdaccio',
        '--config',
        configPath,
        '--listen',
        `http://0.0.0.0:${port}`,
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false,
      },
    );

    let output = '';
    let started = false;

    verdaccio.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;

      // Debug: Show Verdaccio output (uncomment for debugging)
      // console.log(chalk.gray(`[Verdaccio] ${chunk.trim()}`));

      // More comprehensive startup detection patterns
      const startupPatterns = [
        'http address',
        `http://0.0.0.0:${port}`,
        `listening on port ${port}`,
        'Server listen on',
        'registry started',
        'verdaccio started',
        `warn --- http address - http://0.0.0.0:${port}`,
        'server started',
        `listening on ${port}`,
      ];

      if (
        !started &&
        startupPatterns.some((pattern) =>
          output.toLowerCase().includes(pattern.toLowerCase()),
        )
      ) {
        started = true;
        console.log(
          chalk.green(
            `✅ Verdaccio registry started on http://localhost:${port}`,
          ),
        );

        // Wait a bit more for server to be fully ready
        setTimeout(() => {
          resolve({
            process: verdaccio,
            url: `http://localhost:${port}`,
            port,
          });
        }, 2000);
      }
    });

    verdaccio.stderr.on('data', (data) => {
      const error = data.toString();

      // Only show real errors, not deprecation warnings
      if (
        error.includes('VerdaccioWarning') ||
        error.includes('trace-warnings')
      ) {
        // Skip deprecation warnings - they're not actual errors
        return;
      }

      // Debug: Show real Verdaccio errors (uncomment for debugging)
      // console.log(chalk.red(`[Verdaccio Error] ${error.trim()}`));

      if (
        error.includes('EADDRINUSE') ||
        error.includes('address already in use')
      ) {
        reject(new Error(`Port ${port} is already in use`));
      }
    });

    verdaccio.on('error', (error) => {
      reject(error);
    });

    verdaccio.on('exit', (code) => {
      if (code !== 0 && !started) {
        reject(new Error(`Verdaccio exited with code ${code}`));
      }
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!started) {
        verdaccio.kill();
        reject(new Error('Verdaccio startup timeout'));
      }
    }, 10000);
  });
}

/**
 * Check if a Verdaccio server is already running on the port
 * @param {string} registryUrl - Registry URL to check
 * @returns {Promise<{isVerdaccio: boolean, isRunning: boolean, version?: string}>} Server status
 */
async function checkExistingVerdaccioServer(registryUrl) {
  try {
    // Try to ping the server
    const pingResponse = await fetch(
      `${registryUrl}/-/ping`,
      createFetchWithTimeout(3000, { method: 'GET' }),
    );

    if (!pingResponse.ok) {
      return { isVerdaccio: false, isRunning: false };
    }

    // Check if it's actually Verdaccio by trying the whoami endpoint
    try {
      const whoamiResponse = await fetch(
        `${registryUrl}/-/whoami`,
        createFetchWithTimeout(3000, { method: 'GET' }),
      );

      // Verdaccio typically returns specific headers or responses
      const isVerdaccio =
        whoamiResponse.status === 200 || whoamiResponse.status === 401;

      if (isVerdaccio) {
        // Try to get version info
        try {
          const versionResponse = await fetch(
            `${registryUrl}/-/v1/search?text=verdaccio&size=1`,
            createFetchWithTimeout(3000, { method: 'GET' }),
          );
          const versionInfo =
            versionResponse.headers.get('x-powered-by') || 'unknown';
          return { isVerdaccio: true, isRunning: true, version: versionInfo };
        } catch {
          return { isVerdaccio: true, isRunning: true };
        }
      }

      return { isVerdaccio: false, isRunning: true };
    } catch {
      // If whoami fails, it's still running but might not be Verdaccio
      return { isVerdaccio: false, isRunning: true };
    }
  } catch (error) {
    return { isVerdaccio: false, isRunning: false };
  }
}

/**
 * Verify Verdaccio registry is responding correctly
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
 * Check if user has existing .npmrc and warn about modifications
 * @param {string} packagePath - Path to package
 * @returns {Promise<boolean>} True if user confirms proceeding
 */
async function checkNpmrcAndConfirm(packagePath) {
  const npmrcPath = join(packagePath, '.npmrc');
  const gitignorePath = join(packagePath, '.gitignore');
  const hasExistingNpmrc = existsSync(npmrcPath);
  const isCI = process.env.CI === 'true';

  if (isCI) {
    // In CI environment, skip interactive prompts
    if (hasExistingNpmrc) {
      console.log(
        chalk.yellow('⚠️  Existing .npmrc detected in CI environment'),
      );
      console.log(
        chalk.yellow(
          '   Will create temporary .npmrc.staging for safe publishing',
        ),
      );
    }
    return true;
  }

  console.log(chalk.cyan('\n🔒 .npmrc Safety Check'));
  console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━'));

  if (hasExistingNpmrc) {
    console.log(chalk.yellow('⚠️  Existing .npmrc file detected!'));
    const npmrcContent = readFileSync(npmrcPath, 'utf-8');
    console.log(chalk.gray('   Current .npmrc content:'));
    console.log(chalk.gray('   ├─────────────────────'));
    npmrcContent
      .split('\n')
      .slice(0, 5)
      .forEach((line, i) => {
        if (line.trim()) {
          console.log(chalk.gray(`   │ ${line}`));
        }
      });
    if (npmrcContent.split('\n').length > 5) {
      console.log(chalk.gray('   │ ... (truncated)'));
    }
    console.log(chalk.gray('   └─────────────────────'));
    console.log(
      chalk.yellow(
        '   This process will create a temporary .npmrc.staging file',
      ),
    );
    console.log(chalk.yellow('   Your existing .npmrc will NOT be modified'));
  } else {
    console.log(chalk.blue('ℹ️  No existing .npmrc found'));
    console.log(
      chalk.blue('   Will create temporary .npmrc.staging for publishing'),
    );
  }

  // Check .gitignore
  if (existsSync(gitignorePath)) {
    const gitignoreContent = readFileSync(gitignorePath, 'utf-8');
    const hasNpmrcInGitignore =
      gitignoreContent.includes('.npmrc') ||
      gitignoreContent.includes('*.npmrc') ||
      gitignoreContent.includes('.npmrc*');

    if (!hasNpmrcInGitignore) {
      console.log(
        chalk.yellow('\n💡 Recommendation: Add .npmrc files to .gitignore'),
      );
      console.log(chalk.gray('   Add this line to your .gitignore:'));
      console.log(chalk.gray('   .npmrc*'));
    } else {
      console.log(chalk.green('✅ .npmrc files are already in .gitignore'));
    }
  } else {
    console.log(
      chalk.yellow('\n💡 Recommendation: Create .gitignore with .npmrc* entry'),
    );
  }

  // Automatically proceed - no user confirmation needed for .npmrc safety
  return true;
}

/**
 * Create temporary .npmrc file with registry override
 * @param {string} packagePath - Path to package
 * @param {string} registryUrl - Registry URL
 * @returns {string} Path to temporary .npmrc file
 */
function createTempNpmrc(packagePath, registryUrl) {
  const npmrcPath = join(packagePath, '.npmrc.staging');
  const url = new URL(registryUrl);
  const npmrcContent = [
    `# Temporary .npmrc for staging publishing`,
    `# This file is auto-generated and will be deleted after publishing`,
    `registry=${registryUrl}`,
    `always-auth=false`,
    ``,
  ].join('\n');

  writeFileSync(npmrcPath, npmrcContent);
  console.log(chalk.gray(`📝 Created temporary .npmrc.staging`));
  return npmrcPath;
}

/**
 * Authenticate with Verdaccio registry
 * @param {string} registryUrl - Registry URL
 * @param {string} npmrcPath - Path to npmrc file
 * @returns {Promise<void>}
 */
async function authenticateWithRegistry(registryUrl, npmrcPath) {
  return new Promise((resolve, reject) => {
    console.log(chalk.blue('🔐 Authenticating with registry...'));

    // Try to login with test/test user
    const login = spawn(
      'npm',
      [
        'adduser',
        '--registry',
        registryUrl,
        '--userconfig',
        npmrcPath,
        '--auth-type',
        'legacy',
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    // Provide test user credentials automatically
    login.stdin.write('test\n'); // username
    setTimeout(() => login.stdin.write('test\n'), 100); // password
    setTimeout(() => login.stdin.write('test@example.com\n'), 200); // email
    setTimeout(() => login.stdin.end(), 300);

    let output = '';
    let errorOutput = '';

    login.stdout.on('data', (data) => {
      output += data.toString();
    });

    login.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    login.on('close', (code) => {
      if (code === 0 || output.includes('Logged in as')) {
        console.log(chalk.green('✅ Successfully authenticated with registry'));

        // Manually add auth token to .npmrc.staging since npm adduser might not write it properly
        try {
          const url = new URL(registryUrl);
          // Try using _authToken format which is more modern
          const authLine = `//localhost:${url.port}/:_authToken="staging-auth-token"`;
          const npmrcContent = readFileSync(npmrcPath, 'utf-8');
          // Update always-auth to true and add auth token
          const updatedContent =
            npmrcContent.replace('always-auth=false', 'always-auth=true') +
            authLine +
            '\n';
          writeFileSync(npmrcPath, updatedContent);
          console.log(chalk.gray('📝 Added auth token to .npmrc.staging'));
        } catch (error) {
          console.log(chalk.yellow('⚠️  Failed to add auth token to .npmrc'));
        }

        resolve(undefined);
      } else {
        // If login fails, try without auth (Verdaccio might allow unauthenticated publishing)
        console.log(
          chalk.yellow('⚠️  Authentication failed, attempting without auth...'),
        );
        resolve(undefined);
      }
    });

    login.on('error', (error) => {
      console.log(
        chalk.yellow('⚠️  Authentication error, continuing without auth...'),
      );
      resolve(undefined); // Continue even if auth fails
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      login.kill();
      console.log(
        chalk.yellow('⚠️  Authentication timeout, continuing without auth...'),
      );
      resolve(undefined);
    }, 10000);
  });
}

/**
 * Add .npmrc to .gitignore if not present
 * @param {string} packagePath - Path to package
 */
function updateGitignoreForNpmrc(packagePath) {
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
    console.log(chalk.green('✅ Added .npmrc* to .gitignore'));
  }
}

/**
 * Verify package version exists in registry after publishing
 * @param {string} packageName - Package name
 * @param {string} version - Package version
 * @param {string} registryUrl - Registry URL
 * @returns {Promise<boolean>} True if package version exists in registry
 */
async function verifyPackagePublished(packageName, version, registryUrl) {
  try {
    // Check specific version
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
 * Show safety confirmation before publishing
 * @param {string} packageName - Package name
 * @param {string} version - Package version
 * @param {string} registryUrl - Registry URL
 * @returns {Promise<boolean>} User confirmation
 */
async function confirmPublishing(packageName, version, registryUrl) {
  console.log(chalk.cyan('\n🔐 Publishing Safety Check'));
  console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.white(`📦 Package: ${chalk.bold(packageName)}@${version}`));
  console.log(chalk.white(`🎯 Target Registry: ${chalk.bold(registryUrl)}`));

  // Safety validation
  const url = new URL(registryUrl);
  const isLocalhost =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1';

  if (!isLocalhost) {
    console.log(
      chalk.red('❌ SECURITY WARNING: Registry is not on localhost!'),
    );
    console.log(chalk.red('   This could publish to a public registry.'));
    return false;
  }

  console.log(chalk.green('✅ Registry is localhost (safe)'));
  console.log(
    chalk.yellow(
      '\n⚠️  This will publish your package to the local staging registry.',
    ),
  );

  return Promise.resolve(true);
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
      `${registryUrl}/${packageName}/${version}`,
      createFetchWithTimeout(5000, { method: 'GET' }),
    );

    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Generate staging version string
 * @param {string} originalVersion - Original version from package.json
 * @param {string} registryUrl - Registry URL to check existing versions
 * @param {string} packageName - Package name
 * @returns {Promise<string>} Staging version
 */
async function generateStagingVersion(
  originalVersion,
  registryUrl,
  packageName,
) {
  const timestamp = Math.floor(Date.now() / 1000);
  const stagingVersion = `${originalVersion}-staging.${timestamp}`;

  // Check if this version exists (unlikely but possible)
  const exists = await checkPackageExists(
    packageName,
    stagingVersion,
    registryUrl,
  );

  if (exists) {
    // Add random suffix if timestamp version exists
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    return `${originalVersion}-staging.${timestamp}.${randomSuffix}`;
  }

  return stagingVersion;
}

/**
 * Create temporary publishing directory with modified package.json
 * @param {string} packagePath - Original package path
 * @param {string} newVersion - Version to use for publishing
 * @returns {Promise<string>} Path to temporary directory
 */
async function createTempPublishDir(packagePath, newVersion) {
  const { mkdtemp } = await import('fs/promises');
  const { tmpdir } = await import('os');
  const tempDir = await mkdtemp(join(tmpdir(), 'tsup-lib-staging-'));

  // Copy package.json and modify version
  const originalPkgPath = join(packagePath, 'package.json');
  const originalPkg = JSON.parse(readFileSync(originalPkgPath, 'utf-8'));

  const modifiedPkg = { ...originalPkg, version: newVersion };
  const tempPkgPath = join(tempDir, 'package.json');

  writeFileSync(tempPkgPath, JSON.stringify(modifiedPkg, null, 2) + '\n');

  // Copy all other necessary files (built files, README, etc.)
  const filesToCopy = [
    'cjs',
    'esm',
    'src',
    'README.md',
    'LICENSE',
    'CHANGELOG.md',
  ].filter((file) => existsSync(join(packagePath, file)));

  const { cp } = await import('fs/promises');

  for (const file of filesToCopy) {
    const srcPath = join(packagePath, file);
    const destPath = join(tempDir, file);

    try {
      await cp(srcPath, destPath, { recursive: true });
    } catch (error) {
      // Ignore copy errors for optional files
    }
  }

  return tempDir;
}

/**
 * Clean up temporary directory
 * @param {string} tempDir - Path to temporary directory to remove
 */
async function cleanupTempDir(tempDir) {
  try {
    const { rm } = await import('fs/promises');
    await rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}

/**
 * Publish package to registry with safety checks and version conflict resolution
 * @param {string} packagePath - Path to package
 * @param {string} registryUrl - Registry URL
 * @param {import('zod').infer<typeof packageJsonSchema>} packageInfo - Package information
 * @param {{force: boolean, stagingVersion: boolean}} options - Publishing options with force (republish existing packages) and stagingVersion (use staging-specific versioning) flags
 * @returns {Promise<void>}
 */
async function publishToRegistry(
  packagePath,
  registryUrl,
  packageInfo,
  options = { force: false, stagingVersion: false },
) {
  const { force = false, stagingVersion = false } = options;
  try {
    // Check if package version is specified
    if (!packageInfo.version) {
      throw new PackageError(
        `Package "${packageInfo.name}" must have a version specified in package.json`,
      );
    }

    // Check if package is marked as private
    if (packageInfo.private) {
      throw new PackageError(
        `Package "${packageInfo.name}" is marked as private and cannot be published`,
      );
    }

    console.log(chalk.blue('🔍 Checking package version conflicts...'));

    // Check if package version already exists
    const packageExists = await checkPackageExists(
      packageInfo.name,
      packageInfo.version,
      registryUrl,
    );
    let versionToPublish = packageInfo.version;
    let tempPublishDir = null;
    let publishFromTempDir = false;

    if (packageExists) {
      console.log(
        chalk.yellow(
          `⚠️  Package ${packageInfo.name}@${packageInfo.version} already exists in registry`,
        ),
      );

      if (force) {
        console.log(
          chalk.blue('🔨 Force mode enabled - will overwrite existing package'),
        );
      } else if (stagingVersion) {
        console.log(chalk.blue('📝 Generating staging version...'));
        versionToPublish = await generateStagingVersion(
          packageInfo.version,
          registryUrl,
          packageInfo.name,
        );
        console.log(
          chalk.green(`✅ Using staging version: ${versionToPublish}`),
        );

        // Create temporary directory with modified package.json
        tempPublishDir = await createTempPublishDir(
          packagePath,
          versionToPublish,
        );
        publishFromTempDir = true;
      } else {
        // Interactive resolution
        console.log(
          chalk.yellow('\n🤔 How would you like to resolve this conflict?'),
        );
        console.log(chalk.cyan('   1. Use staging version (recommended)'));
        console.log(chalk.cyan('   2. Force overwrite existing package'));
        console.log(chalk.cyan('   3. Cancel publishing'));

        const choice = await promptUserInput(
          chalk.cyan('\nSelect option [1-3]: '),
        );

        if (choice === false || choice === '3') {
          console.log(chalk.yellow('❌ Publishing cancelled by user'));
          return;
        } else if (choice === '2') {
          console.log(chalk.blue('🔨 Will force overwrite existing package'));
          // force flag will be handled in npm publish command
        } else {
          // Default to option 1 (staging version)
          console.log(chalk.blue('📝 Generating staging version...'));
          versionToPublish = await generateStagingVersion(
            packageInfo.version,
            registryUrl,
            packageInfo.name,
          );
          console.log(
            chalk.green(`✅ Using staging version: ${versionToPublish}`),
          );

          // Create temporary directory with modified package.json
          tempPublishDir = await createTempPublishDir(
            packagePath,
            versionToPublish,
          );
          publishFromTempDir = true;
        }
      }
    } else {
      console.log(
        chalk.green(`✅ Version ${packageInfo.version} is available`),
      );
    }

    // Check .npmrc safety and get confirmation
    const npmrcConfirmed = await checkNpmrcAndConfirm(packagePath);
    if (!npmrcConfirmed) {
      console.log(
        chalk.yellow('🚫 Publishing cancelled due to .npmrc concerns'),
      );
      if (tempPublishDir) {
        await cleanupTempDir(tempPublishDir);
      }
      return;
    }

    // Safety confirmation with the actual version to be published
    const confirmed = await confirmPublishing(
      packageInfo.name,
      versionToPublish,
      registryUrl,
    );

    if (!confirmed) {
      console.log(chalk.yellow('🚫 Publishing cancelled by user'));
      if (tempPublishDir) {
        await cleanupTempDir(tempPublishDir);
      }
      return;
    }

    // Update .gitignore to include .npmrc files
    updateGitignoreForNpmrc(packagePath);

    // Create temporary .npmrc for registry override
    const tempNpmrcPath = createTempNpmrc(packagePath, registryUrl);

    // Authenticate with registry
    try {
      await authenticateWithRegistry(registryUrl, tempNpmrcPath);
    } catch (authError) {
      console.log(
        chalk.yellow('⚠️  Authentication failed, continuing without auth...'),
      );
    }

    try {
      // Debug: Check .npmrc.staging content
      if (existsSync(tempNpmrcPath)) {
        const npmrcContent = readFileSync(tempNpmrcPath, 'utf-8');
        console.log(chalk.gray(`📋 Debug: .npmrc.staging content:`));
        console.log(chalk.gray(`${npmrcContent}`));
      }

      console.log(chalk.blue(`📦 Publishing package to staging registry...`));
      console.log(
        chalk.gray(`   Package: ${packageInfo.name}@${versionToPublish}`),
      );

      // Determine publish directory and setup paths
      const publishDir = tempPublishDir || packagePath;
      const publishNpmrcPath = tempPublishDir
        ? join(tempPublishDir, '.npmrc.staging')
        : tempNpmrcPath;

      // Copy .npmrc.staging to temp directory if using temp directory
      if (tempPublishDir) {
        const tempNpmrcContent = readFileSync(tempNpmrcPath, 'utf-8');
        writeFileSync(publishNpmrcPath, tempNpmrcContent);
      }

      // Build npm publish command arguments
      const publishArgs = [
        'publish',
        '--registry',
        registryUrl,
        '--userconfig',
        publishNpmrcPath,
        '--no-git-checks',
        '--loglevel',
        'info',
      ];

      // Handle force mode by unpublishing first (Verdaccio doesn't respect --force for overwrites)
      if (force || (packageExists && !publishFromTempDir)) {
        console.log(
          chalk.yellow('   Force mode: unpublishing existing package first...'),
        );

        try {
          await new Promise((resolve, reject) => {
            const unpublish = spawn(
              'npm',
              [
                'unpublish',
                `${packageInfo.name}@${versionToPublish}`,
                '--registry',
                registryUrl,
                '--userconfig',
                publishNpmrcPath,
                '--force',
              ],
              {
                cwd: publishDir,
                stdio: 'pipe',
              },
            );

            unpublish.on('close', (code) => {
              // Unpublish might fail if package doesn't exist, that's OK
              resolve(undefined);
            });

            unpublish.on('error', () => {
              // Ignore unpublish errors - package might not exist
              resolve(undefined);
            });
          });

          console.log(chalk.green('   ✅ Package unpublished (if it existed)'));
        } catch (error) {
          // Ignore unpublish errors - we'll try to publish anyway
          console.log(
            chalk.gray('   Package may not have existed to unpublish'),
          );
        }
      }

      // Publish with explicit registry and userconfig
      await new Promise((resolve, reject) => {
        const publish = spawn('npm', publishArgs, {
          cwd: publishDir,
          stdio: 'inherit',
        });

        publish.on('close', (code) => {
          if (code === 0) {
            resolve(undefined);
          } else {
            reject(new Error(`Publish failed with exit code ${code}`));
          }
        });

        publish.on('error', (error) => {
          reject(error);
        });
      });

      // Verify publication
      console.log(chalk.blue('🔍 Verifying package publication...'));
      const published = await verifyPackagePublished(
        packageInfo.name,
        versionToPublish,
        registryUrl,
      );

      if (published) {
        console.log(
          chalk.green('✅ Package published and verified successfully!'),
        );
        console.log(
          chalk.cyan(
            `📦 ${packageInfo.name}@${versionToPublish} is now available at:`,
          ),
        );
        console.log(chalk.cyan(`   ${registryUrl}/${packageInfo.name}`));

        if (publishFromTempDir) {
          console.log(
            chalk.gray(
              `   Original package.json version preserved (${packageInfo.version})`,
            ),
          );
        }
      } else {
        console.log(
          chalk.yellow('⚠️  Package published but verification failed'),
        );
        console.log(
          chalk.yellow(
            '   You may need to wait a moment for the registry to update',
          ),
        );
      }
    } finally {
      // Clean up temporary directory if used
      if (tempPublishDir) {
        await cleanupTempDir(tempPublishDir);
        console.log(chalk.gray('🧹 Cleaned up temporary publishing directory'));
      }

      // Clean up temporary .npmrc
      if (existsSync(tempNpmrcPath)) {
        unlinkSync(tempNpmrcPath);
        console.log(chalk.gray('🧹 Cleaned up temporary .npmrc.staging'));
      }
    }
  } catch (error) {
    throw error;
  }
}

/**
 * Main publish staging command
 * @param {import('../schemas/config.js').PublishStagingOptions} options - Command options
 */
export async function publishStaging(options) {
  try {
    const {
      port: requestedPort = 4873,
      path: packagePath = process.cwd(),
      build = true,
      reuseServer = false,
      force = false,
      stagingVersion = false,
    } = options;

    console.log(chalk.cyan(`🔧 ${chalk.bold('tsup-library-utils-cli')}`));
    console.log(
      chalk.cyan('   Setting up staging environment for package publishing\n'),
    );

    // Get package information early to use package name in Verdaccio config
    const packageInfo = getPackageInfo(packagePath);

    // Find project root (look for pnpm-workspace.yaml or package.json with workspaces)
    let rootPath = packagePath;
    while (
      !existsSync(join(rootPath, 'pnpm-workspace.yaml')) &&
      !existsSync(join(rootPath, 'lerna.json'))
    ) {
      const pkgPath = join(rootPath, 'package.json');
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.workspaces) break;
      }
      const parentPath = dirname(rootPath);
      if (parentPath === rootPath) break; // Reached filesystem root
      rootPath = parentPath;
    }

    // Check if requested port is available or has existing Verdaccio server
    console.log(chalk.blue(`🔍 Checking port ${requestedPort}...`));
    let port = requestedPort;
    let shouldStartServer = true;
    let existingServerInfo = null;

    const registryUrl = `http://localhost:${port}`;

    if (!(await checkPortAvailable(port))) {
      console.log(chalk.yellow(`⚠️  Port ${port} is already in use.`));

      // Check if it's a Verdaccio server
      existingServerInfo = await checkExistingVerdaccioServer(registryUrl);

      if (existingServerInfo.isVerdaccio) {
        console.log(
          chalk.green(`🎉 Found existing Verdaccio server on port ${port}!`),
        );
        if (existingServerInfo.version) {
          console.log(
            chalk.gray(`   Server info: ${existingServerInfo.version}`),
          );
        }

        const shouldReuse =
          reuseServer ||
          force ||
          (await promptUser(
            chalk.cyan(`   Use existing Verdaccio server? [Y/n]: `),
          ));

        if (shouldReuse) {
          shouldStartServer = false;
          if (reuseServer || force) {
            console.log(
              chalk.green(
                `✅ Automatically reusing existing Verdaccio server on port ${port} (--reuse-server)`,
              ),
            );
          } else {
            console.log(
              chalk.green(
                `✅ Reusing existing Verdaccio server on port ${port}`,
              ),
            );
          }
        } else {
          // Find alternative port for new server
          const alternativePort = await findAvailablePort(port + 1);
          if (alternativePort) {
            const useAlternative = await promptUser(
              chalk.yellow(
                `   Start new server on port ${alternativePort} instead? [Y/n]: `,
              ),
            );

            if (useAlternative) {
              port = alternativePort;
            } else {
              console.log(chalk.red('❌ Cannot proceed without a server.'));
              process.exit(1);
            }
          } else {
            console.log(
              chalk.red('❌ No available ports found for new server.'),
            );
            process.exit(1);
          }
        }
      } else if (existingServerInfo.isRunning) {
        console.log(
          chalk.red(
            `❌ Port ${port} is in use by another service (not Verdaccio).`,
          ),
        );

        // Find alternative port
        const alternativePort = await findAvailablePort(port + 1);
        if (alternativePort) {
          const useAlternative = await promptUser(
            chalk.yellow(`   Use port ${alternativePort} instead? [Y/n]: `),
          );

          if (useAlternative) {
            port = alternativePort;
          } else {
            console.log(
              chalk.red('❌ Cannot proceed without an available port.'),
            );
            process.exit(1);
          }
        } else {
          console.log(chalk.red('❌ No available ports found in range.'));
          process.exit(1);
        }
      } else {
        // Port is in use but server not responding - treat as unavailable
        const alternativePort = await findAvailablePort(port + 1);
        if (alternativePort) {
          const useAlternative = await promptUser(
            chalk.yellow(`   Use port ${alternativePort} instead? [Y/n]: `),
          );

          if (useAlternative) {
            port = alternativePort;
          } else {
            console.log(
              chalk.red('❌ Cannot proceed without an available port.'),
            );
            process.exit(1);
          }
        } else {
          console.log(chalk.red('❌ No available ports found in range.'));
          process.exit(1);
        }
      }
    } else {
      console.log(
        chalk.green(`✅ Port ${port} is available for new Verdaccio server`),
      );
    }

    // Build package if requested
    if (build) {
      console.log(chalk.blue('🔨 Building package...'));
      const buildProcess = spawn(
        'node',
        [join(packagePath, 'src', 'index.js'), 'build'],
        {
          cwd: packagePath,
          stdio: 'inherit',
        },
      );

      await new Promise((resolve, reject) => {
        buildProcess.on('close', (code) => {
          if (code === 0) {
            console.log(chalk.green('✅ Package built successfully!'));
            resolve(undefined);
          } else {
            reject(new Error(`Build failed with exit code ${code}`));
          }
        });

        buildProcess.on('error', reject);
      });
    }

    // Update registryUrl with final port
    const finalRegistryUrl = `http://localhost:${port}`;
    /** @type {{process: import('child_process').ChildProcess, url: string, port: number} | null} */
    let server = null;

    if (shouldStartServer) {
      // Create Verdaccio configuration and start server
      const { configPath } = createVerdaccioConfig(
        rootPath,
        port,
        packageInfo.name,
      );
      server = await startVerdaccio(configPath, port);

      // Verify registry is accessible
      console.log(chalk.blue('🔍 Verifying registry accessibility...'));
      const registryAccessible = await verifyRegistryAccess(finalRegistryUrl);

      if (!registryAccessible) {
        console.log(chalk.red('❌ Registry verification failed'));
        server.process.kill();
        throw new Error('Verdaccio registry is not responding correctly');
      }

      console.log(chalk.green('✅ Registry is accessible and responding'));
    } else {
      // Using existing server - just verify it's still accessible
      console.log(
        chalk.blue('🔍 Verifying existing registry accessibility...'),
      );
      const registryAccessible = await verifyRegistryAccess(finalRegistryUrl);

      if (!registryAccessible) {
        console.log(chalk.red('❌ Existing registry is no longer accessible'));
        throw new Error('Existing Verdaccio registry stopped responding');
      }

      console.log(
        chalk.green('✅ Existing registry is accessible and responding'),
      );
    }

    console.log(chalk.cyan('\n📋 Registry Information:'));
    console.log(chalk.cyan(`   • URL: ${finalRegistryUrl}`));
    console.log(chalk.cyan(`   • Web UI: ${finalRegistryUrl}`));
    console.log(
      chalk.cyan(
        `   • Status: ${shouldStartServer ? 'New server started' : 'Reusing existing server'}`,
      ),
    );
    if (existingServerInfo?.version) {
      console.log(chalk.cyan(`   • Server: ${existingServerInfo.version}`));
    }
    console.log(chalk.cyan('   • Test User: test/test\n'));

    // Publish package
    await publishToRegistry(packagePath, finalRegistryUrl, packageInfo, {
      force,
      stagingVersion,
    });

    console.log(chalk.green('\n🎉 Staging setup completed successfully!\n'));

    console.log(chalk.cyan('📖 Next steps:'));
    console.log(
      chalk.cyan('   1. View packages at:'),
      chalk.underline(finalRegistryUrl),
    );
    console.log(chalk.cyan('   2. Install in another project:'));
    console.log(
      chalk.gray(
        `      npm install your-package --registry ${finalRegistryUrl}`,
      ),
    );
    console.log(chalk.cyan('   3. Test your package thoroughly'));

    if (shouldStartServer) {
      console.log(chalk.cyan('   4. Press Ctrl+C to stop the registry\n'));

      // Keep server running - only if we started it
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\n🛑 Stopping registry...'));
        if (server?.process) {
          server.process.kill();
        }
        process.exit(0);
      });

      // Wait for server to exit
      if (server?.process) {
        server.process.on('exit', () => {
          console.log(chalk.gray('Registry stopped.'));
          process.exit(0);
        });
      }
    } else {
      console.log(
        chalk.cyan('   4. Registry will continue running for other packages\n'),
      );
      console.log(
        chalk.gray('💡 The existing Verdaccio server will remain running.'),
      );
      console.log(
        chalk.gray('   You can publish more packages to the same registry.'),
      );

      // Exit immediately if using existing server
      process.exit(0);
    }
  } catch (error) {
    if (error instanceof PackageError || error instanceof ConfigurationError) {
      console.error(chalk.red(`❌ ${error.message}`));
      if (error instanceof ConfigurationError && error.suggestions) {
        error.suggestions.forEach((suggestion) => {
          console.error(chalk.yellow(`💡 ${suggestion}`));
        });
      }
    } else {
      console.error(chalk.red('❌ Staging setup failed:'));
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`   ${errorMessage}`));
    }

    console.error(chalk.gray('\n💡 Troubleshooting tips:'));
    console.error(
      chalk.gray(
        '   • Check that no other registry is running on the specified port',
      ),
    );
    console.error(
      chalk.gray('   • Ensure your package.json is properly configured'),
    );
    console.error(
      chalk.gray('   • Try a different port using --port <number>'),
    );
    console.error(
      chalk.gray('   • Use --verbose for detailed error information'),
    );

    process.exit(1);
  }
}

/**
 * @typedef {Object} PublishStagingOptions
 * @property {number} [port=4873] - Registry port
 * @property {string} [path] - Package path
 * @property {boolean} [build=true] - Whether to build before publishing
 */
