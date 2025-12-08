---
'libsync': patch
---

Fix development mode coercion and production file validation

## What Changed

- **Development mode coercion**: Fixed issue where switching from `production-types` mode to `development` mode didn't update package.json fields. The package now always coerces to the target mode regardless of current state.

- **Production file validation**: When generating production package.json, the CLI now validates that production build files exist and throws clear errors instead of silently falling back to `.js` or `.cjs` extensions.

- **Type property handling**: Added proper handling of the `type` property in package.json based on the target mode (development/production).

## Why This Change Was Made

Previously, if a package was in `production-types` mode (after running `libsync build --types-only`), running `libsync package-json --mode development` would not update the package.json fields, leaving it in an inconsistent state. Additionally, production mode would silently use incorrect file extensions when build files were missing, masking build errors.

## How to Update

No code changes required. If you encounter errors about missing production files, run `libsync build` first to generate the production build artifacts before running `libsync package-json --mode production`.
