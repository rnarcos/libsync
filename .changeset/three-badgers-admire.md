---
'libsync': patch
---

Fixed type definition generation to respect `libsync.config.mjs` `formats.types` setting instead of requiring a `types` field in the root `package.json`. Type definitions are now generated automatically when `formats.types` is enabled and `tsconfig.build.json` exists, regardless of whether the original package.json had a `types` field. This ensures consistent type generation across all build modes (development, production, and production-types).
