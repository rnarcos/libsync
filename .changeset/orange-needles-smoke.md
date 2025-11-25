---
'libsync': patch
---

Fixed field ordering in package.json exports when using `--types-only` flag. Export fields are now correctly ordered as `types`, `import`, `require` (instead of `import`, `require`, `types`), ensuring proper TypeScript resolution.
