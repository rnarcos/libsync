---
'libsync': patch
---

Fixed `production-types` mode to preserve existing `main`/`module`/`import`/`require` paths in package.json and only update the `types` field to point to production build outputs. Previously, production-types mode would reset these fields to development (source) paths. Also removed the automatic package.json reset to development mode during cleanup, ensuring package.json is only modified when explicitly needed.
