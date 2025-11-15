---
'libsync': patch
---

Fixed package.json main, module, types, and bin fields to use actual file extensions instead of
hardcoded .js extensions. The logic now properly detects the real file extensions (.cjs, .js, etc.)
using getActualFileExtension for both the main package.json and proxy package.json files. This
ensures correct path resolution in production and development modes.
