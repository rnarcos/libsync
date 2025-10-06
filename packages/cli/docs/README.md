# libsync Documentation

A comprehensive CLI tool for library maintainers using tsup for building modern JavaScript and TypeScript libraries.

## Overview

The `libsync` provides a complete toolkit for library development, including building, cleaning, development workflows, and staging deployments. It's designed to work with both monorepos and single repositories, offering intelligent package.json management and dual-format builds (CJS/ESM).

## Commands

- **[build](./build.md)** - Build library packages using tsup with intelligent configuration
- **[clean](./clean.md)** - Clean build artifacts and generated files
- **[dev](./dev.md)** - Development workflow with automatic package.json management
- **[publish:staging](./publish-staging.md)** - Staging deployment with Verdaccio integration

## Key Features

### Intelligent Package.json Management

The CLI automatically manages your `package.json` exports, main/module fields, and bin entries based on your build configuration and development/production modes.

### Conditional Exports Support

Automatically generates proper conditional exports with `import`, `require`, and `types` fields based on your package configuration:

```json
{
  "exports": {
    ".": {
      "types": "./esm/index.d.ts",
      "import": "./esm/index.js",
      "require": "./cjs/index.cjs"
    }
  }
}
```

### Dual-Format Builds

Supports building both CommonJS (.cjs) and ES Modules (.js) with proper type declarations, allowing your library to work in any environment.

### Universal Package Support

Works seamlessly with any package structure.

## Installation

```bash
npm install -g libsync
# or
pnpm add -g libsync
# or
yarn global add libsync
```

## Quick Start

```bash
# Build your library
libsync build

# Start development mode with file watching
libsync dev --watch

# Clean build artifacts
libsync clean

# Set up staging environment for testing
libsync publish:staging
```

## Global Options

- `--verbose` - Enable detailed logging for all commands
- `--help` - Show help information for any command

## Configuration

The CLI works with standard `package.json` and `tsconfig.json` files. No additional configuration files are required, though you can customize behavior through these standard files.

### Supported Package.json Fields

- `main` - CommonJS entry point
- `module` - ES Module entry point
- `types` - TypeScript declarations
- `bin` - Binary executables
- `exports` - Package exports (auto-generated)

The CLI intelligently updates these fields based on your build configuration and current mode (development vs production).
