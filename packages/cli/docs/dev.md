# Dev Command

Development workflow with automatic package.json management for the current package.

## Usage

```bash
libsync dev [options]
```

## Options

- `-w, --watch` - Watch for file changes and auto-regenerate
- `-p, --path <path>` - Package path to process (default: current directory)
- `--verbose` - Enable verbose logging

## Description

The dev command is the cornerstone of the development workflow. It automatically manages your package.json files to enable seamless development with proper Node.js imports while maintaining production-ready configuration.

## Why Use Dev Mode?

### The Development Problem

When developing libraries, you face a dilemma:

**Production package.json** (for publishing):

```json
{
  "main": "cjs/index.cjs",
  "module": "esm/index.js",
  "types": "esm/index.d.ts",
  "exports": {
    ".": {
      "types": "./esm/index.d.ts",
      "import": "./esm/index.js",
      "require": "./cjs/index.cjs"
    }
  }
}
```

**Development needs** (for local development):

```json
{
  "main": "src/index.ts",
  "module": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.js",
      "import": "./src/index.js",
      "require": "./src/index.js"
    }
  }
}
```

### The Solution: Automatic Package.json Management

Dev mode automatically switches your package.json to development-friendly configuration, enabling:

- **Direct source imports** - Import from TypeScript source files
- **Proper IDE support** - IntelliSense, go-to-definition, refactoring
- **Hot reloading** - Changes reflect immediately without rebuilds
- **Monorepo linking** - Workspace packages link to source files
- **Type checking** - Full TypeScript support during development

## Benefits for Library Maintainers

### 1. Seamless Development Experience

```typescript
// In your app/test consuming the library:
import { myFunction } from 'my-library'; // Points directly to src/

// Changes in src/ are immediately available
// No build step required during development
```

### 2. Proper Node.js Import Resolution

Dev mode ensures all imports work correctly:

- Relative imports within your library
- Cross-package imports
- External dependency resolution
- Conditional exports work as expected

### 3. IDE Integration

- **Go to Definition** - Jump directly to source TypeScript files
- **Auto-completion** - Full IntelliSense from source
- **Refactoring** - Rename/move files with confidence
- **Error Detection** - Real-time TypeScript errors

### 4. Monorepo Development

```typescript
// Package A can import from Package B's source:
import { utils } from '@my-org/package-b'; // -> points to src/
```

## Development Workflow

### Essential Rule: Always Commit in Dev Mode

**Critical**: Your package.json should always be committed in development mode, never in production mode.

```bash
# ✅ Correct workflow
libsync dev              # Switch to dev mode
# ... make changes ...
git add .
git commit -m "feat: add new feature"
git push

# ✅ For publishing
libsync build            # Builds and switches to prod mode
npm publish               # Publish with prod package.json
libsync dev              # Switch back to dev mode immediately
git add package.json
git commit -m "chore: restore dev mode"
```

### Why This Matters

1. **Collaboration** - Other developers get working dev environment
2. **CI/CD** - Build processes work correctly from source
3. **Consistency** - Everyone develops with same configuration
4. **Debugging** - Source maps and debugging work properly

## Basic Usage

### Process Current Package

```bash
libsync dev
```

For any package (standalone or in a monorepo):

- Processes the current directory as a package
- Updates package.json to point to source files
- Enables direct development without build step
- Works from any package directory

## File Watching

### Watch Mode

```bash
libsync dev --watch
```

Continuously monitors for changes:

- **File additions** - New files automatically included
- **Package.json changes** - Regenerates configuration
- **Source structure changes** - Updates exports automatically

### What Triggers Regeneration

- New TypeScript/JavaScript files in src/
- Changes to package.json structure
- Changes to tsconfig.json
- Modifications to source directory structure

## Package.json Transformations

### Main/Module/Types Fields

```json
// Before (production)
{
  "main": "cjs/index.cjs",
  "module": "esm/index.js",
  "types": "esm/index.d.ts"
}

// After (development)
{
  "main": "src/index.ts",
  "module": "src/index.ts",
  "types": "src/index.ts"
}
```

### Conditional Exports

```json
// Before (production)
{
  "exports": {
    ".": {
      "types": "./esm/index.d.ts",
      "import": "./esm/index.js",
      "require": "./cjs/index.cjs"
    },
    "./utils": {
      "types": "./esm/utils/index.d.ts",
      "import": "./esm/utils/index.js",
      "require": "./cjs/utils/index.cjs"
    }
  }
}

// After (development)
{
  "exports": {
    ".": {
      "types": "./src/index.js",
      "import": "./src/index.js",
      "require": "./src/index.js"
    },
    "./utils": {
      "types": "./src/utils/index.js",
      "import": "./src/utils/index.js",
      "require": "./src/utils/index.js"
    }
  }
}
```

### Binary Executables

```json
// Before (production)
{
  "bin": {
    "my-cli": "./cjs/cli.cjs"
  }
}

// After (development)
{
  "bin": {
    "my-cli": "./src/cli.js"
  }
}
```

## Examples

### Basic Development Setup

```bash
# Start development mode
libsync dev

# With file watching
libsync dev --watch

# Watch mode
libsync dev --watch
```

### Development Workflow

```bash
# Start development mode
libsync dev --watch

# From package root
pnpm dev        # Usually configured to run libsync dev
pnpm dev:watch  # Usually configured to run libsync dev --watch
```

### Development Workflow Example

```bash
# 1. Clone repository
git clone my-library
cd my-library

# 2. Install dependencies
pnpm install

# 3. Start development mode
libsync dev --watch

# 4. Start developing
# - Edit files in src/
# - Changes are immediately available
# - IDE features work perfectly
# - No build step needed

# 5. Test your changes
pnpm test
pnpm lint

# 6. Commit (in dev mode)
git add .
git commit -m "feat: new feature"

# 7. Publish workflow
libsync build    # Switch to prod mode & build
npm publish       # Publish
libsync dev      # Switch back to dev mode
git add package.json
git commit -m "chore: restore dev mode"
```

## Integration with Build Tools

### TypeScript

Dev mode works seamlessly with TypeScript:

- Uses your tsconfig.json configuration
- Preserves type information during development
- Enables proper IDE support
- No compilation needed for development

### Testing Frameworks

```javascript
// Jest/Vitest - works with source files
import { myFunction } from 'my-library'; // Points to src/
```

## Troubleshooting

### Common Issues

**Imports not resolving**

```bash
# Ensure you're in dev mode
libsync dev

# Check package.json points to src/
cat package.json | grep '"main"'
```

**IDE not recognizing types**

```bash
# Restart TypeScript server
# VS Code: Cmd+Shift+P -> "TypeScript: Restart TS Server"

# Verify types field points to source
libsync dev --verbose
```

**Monorepo packages not linking**

```bash
# Use verbose logging for debugging
libsync dev --verbose
```

### Best Practices

1. **Always commit in dev mode** - Never commit production package.json
2. **Use watch mode** - Automatic updates save time
3. **Restart dev after major changes** - Ensures clean state
4. **Check package.json regularly** - Verify dev mode is active
5. **Use verbose logging** - Debug configuration issues

### Performance Tips

- Exclude test directories from processing when possible
- Use watch mode for active development
- Consider using turbo for coordinating multiple packages
