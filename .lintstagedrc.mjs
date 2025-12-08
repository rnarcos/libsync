import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const buildWorkspaceCommands =
  (/** @type {('lint' | 'format' | 'package-json')[]} */ commands) =>
  (/** @type {string[]} */ filenames) => {
    // Separate files into workspace files and non-workspace files
    const workspaceFiles = new Map();
    const nonWorkspaceFiles = [];

    filenames.forEach((f) => {
      // Convert absolute path to relative path from project root
      const relativePath = path.isAbsolute(f) ? path.relative(__dirname, f) : f;
      const parts = relativePath.split(path.sep);

      // Check if file is in a valid workspace directory
      if (parts.length >= 2 && parts[0] === 'packages') {
        const workspace = `${parts[0]}/${parts[1]}`;
        if (!workspaceFiles.has(workspace)) {
          workspaceFiles.set(workspace, []);
        }
        workspaceFiles.get(workspace).push(f);
      } else {
        nonWorkspaceFiles.push(f);
      }
    });

    const commandsSet = new Set(commands);
    const result = [];

    // Add workspace commands
    workspaceFiles.forEach((files, workspace) => {
      if (commandsSet.has('package-json')) {
        result.push(`pnpm -F ${workspace} package-json --mode development`);
      }
      if (commandsSet.has('lint')) {
        result.push(`pnpm -F ${workspace} lint`);
      }
      if (commandsSet.has('format')) {
        result.push(`pnpm -F ${workspace} format`);
      }
    });

    // Add fallback commands for non-workspace files
    if (nonWorkspaceFiles.length > 0) {
      if (commandsSet.has('lint')) {
        result.push(`npx eslint ${nonWorkspaceFiles.join(' ')}`);
      }
      if (commandsSet.has('format')) {
        result.push(`npx prettier --write ${nonWorkspaceFiles.join(' ')}`);
      }
    }

    return result;
  };

export default {
  // TypeScript/JavaScript files - run lint and prettier per workspace
  '**/*.{ts,tsx,js,jsx}': buildWorkspaceCommands(['lint', 'format']),

  // src/** or package.json files - run libsync per workspace
  'packages/*/(src/**|package.json)': buildWorkspaceCommands(['package-json']),
  'configs/typescript-config/(src/**|package.json)': buildWorkspaceCommands([
    'package-json',
  ]),

  // package.json files in packages/ and configs/ - run libsync and format
  'package.json': ['npx npmPkgJsonLint'],
};
