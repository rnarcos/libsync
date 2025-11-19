---
'libsync': patch
---

Fixed package.json generation to correctly handle build output file extensions:

- **Dynamic extension detection**: Package.json exports and proxy files now detect actual file
  extensions from build output (`.js`, `.cjs`, `.mjs`, etc.) instead of assuming hardcoded
  extensions. This ensures correct module resolution when tsup outputs different extensions.

- **Conditional TypeScript declarations**: Only include `types` fields in package.json when `.d.ts`
  files actually exist in the build output, preventing module resolution errors for packages without
  TypeScript declarations.

- **Support for `.json` files**: Added `.json` to supported file extensions in both config schema
  and file detection logic, enabling proper handling of JSON modules in exports.

These fixes ensure package.json files accurately reflect the actual build artifacts, improving
module resolution reliability across different bundler configurations.
