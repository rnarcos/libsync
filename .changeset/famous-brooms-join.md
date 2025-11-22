---
'libsync': patch
---

Improved `build --types-only` mode and development mode cleanup:

**Types-only mode improvements:**

- Preserves existing build artifacts (no cleaning of cjs/esm directories)
- Cleans stale `.d.ts` files before generating new ones to avoid outdated type definitions
- Updates only `types` fields in package.json while preserving `main`/`module`/`import`/`require`
  paths
- Generates proxy package.json files with correct types paths matching root package.json mode
- Properly detects `.d.ts` files in both flat structure (`esm/index.d.ts`) and nested structure
  (`esm/src/index.d.ts`) based on TypeScript configuration

**Development mode cleanup:**

- When reverting to development mode (e.g., on build errors), now automatically removes all proxy
  package.json directories
- Build output directories (cjs/esm) are preserved to allow inspection and debugging
- Package.json fields are updated to point back to source files

**Proxy generation:**

- Proxies are now only generated once during build, not cleaned and regenerated multiple times
- Export fields now use consistent ordering for better readability

This allows for efficient type-checking workflows where the CLI can remain in production mode while
generating updated types, and ensures clean transitions between development and production modes.
