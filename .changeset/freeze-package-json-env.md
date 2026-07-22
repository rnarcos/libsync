---
'libsync': minor
---

Add `LIBSYNC_FREEZE_PACKAGE_JSON` environment variable.

When set to a truthy value (`1` or `true`), the `build` and `clean` commands emit/remove build artifacts as usual but leave the root `package.json` untouched — skipping the development ↔ production swap (and, for `build`, the revert-on-failure step). This keeps `package.json` stable so Turbo remote caching is not busted on every build in development and CI.

Only the root `package.json` is frozen; compiled artifacts, proxy packages, and `.gitignore` are still generated normally. The explicit `package-json` command is exempt and always writes. To publish, run without the variable set so the production swap happens as before.
