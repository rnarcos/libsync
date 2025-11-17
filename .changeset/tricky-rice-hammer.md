---
'libsync': patch
---

**BREAKING CHANGE: Rename `dev` command to `package-json` with new mode system**

- The `dev` command has been **renamed** to `package-json`
- All scripts using `libsync dev` must be updated to `libsync package-json`

- Replaced boolean `prod` parameter with `--mode <production|development>` flag
- Default mode is `development`
- Mode parameter is now a string enum: `'production' | 'development'`

Update all package.json scripts across your workspace:

```diff
{
  "scripts": {
-   "dev:package-json": "libsync dev --"
+   "dev:package-json": "libsync package-json --"
  }
}
```

- Added `--check` flag to validate package.json without writing changes
- Useful in CI/CD pipelines to ensure package.json is in the correct state
- Exits with code 1 if package.json doesn't match expected configuration

```bash
libsync package-json --check

libsync package-json --mode production --check
```

- Added `--write` flag (default: true) for explicit control
- When `--check` is used, `--write` is automatically set to false
- Mutually exclusive with `--check`

```bash
libsync package-json

libsync package-json --mode production

libsync package-json --check

libsync package-json --watch

libsync package-json --mode production --watch
```

- Fixed clean command incorrectly modifying `.gitignore` files
- The clean command now only removes build artifacts without touching `.gitignore`
- `.gitignore` is only modified when running package-json/build commands with
  `writeToGitIgnore: false` config

1. **Update all scripts** that use `libsync dev` to `libsync package-json`
2. **Review CI/CD pipelines** - consider adding `--check` flag for validation
3. **Update documentation** referencing the old `dev` command
4. **Test your workflows** to ensure the new command works as expected

No changes are needed to your `libsync.config.mjs` configuration files.
