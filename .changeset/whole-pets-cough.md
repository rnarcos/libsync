---
'libsync': patch
---

Add optional `commands.build.formats.bin` in `libsync.config.mjs`: an array of `{ command, path, format }` entries where `path` is relative to the source directory (must exist), and `format` is `cjs` or `esm`. When this array is non-empty, libsync becomes the single source of truth for `package.json` `bin`, writing dev paths to source files and production paths to the matching output (`cjs` or `esm`). Build runs use per-format tsup entry filtering so CLI files that are only published as one format are not bundled for the other. Validation runs at build time (duplicate commands, missing files, disabled formats). Packages using `formats.bin` no longer take the pure-CLI `src/index` shortcut when scanning sources. Documented in `docs/libsync.config.example.mjs`.
