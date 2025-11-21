---
'libsync': patch
---

Fixed proxy package.json files missing `types` field in `--types-only` mode. Directory exports (like `cli`, `config`) now correctly reference their type definition files at `esm/[module]/index.d.ts` instead of being omitted.
