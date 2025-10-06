# @libsync/react-core

A React component library built with libsync, featuring shadcn/ui components with TypeScript support.

## Features

- 🎨 **shadcn/ui components** - Beautiful, accessible components
- 🎯 **TypeScript support** - Full type safety
- 🎨 **Tailwind CSS** - Utility-first styling
- 📦 **Dual output** - ESM and CJS builds via libsync
- 📚 **Storybook** - Component documentation and testing
- ⚡ **Fast builds** - Powered by tsup and libsync

## Installation

```bash
pnpm add @libsync/react-core
```

## Usage

```tsx
import { Button } from '@libsync/react-core/components/button';
import { cn } from '@libsync/react-core/utils/ui/cn';

export function App() {
  return (
    <Button className={cn('custom-styles')}>
      Click me
    </Button>
  );
}
```

## Development

```bash
# Install dependencies
pnpm install

# Build the library
pnpm build

# Clean build artifacts
pnpm clean

# Development mode
pnpm dev

# Watch mode
pnpm dev:watch

# Run Storybook
pnpm storybook

# Format code
pnpm format:fix

# Lint code
pnpm lint:fix

# Type checking
pnpm typecheck

# Publish to staging registry
pnpm publish:staging
```

## Components

- **Button** - Customizable button component with variants
- **Utils** - Utility functions for styling and class management

## Built with libsync

This package uses [libsync](../../packages/cli) for:
- Dual ESM/CJS builds
- Development workflow
- Package management
- Build optimization

## License

MIT © Marcos Fernandes
