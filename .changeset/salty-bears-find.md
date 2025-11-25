---
'libsync': patch
---

Enhanced error reporting across all CLI commands. Fatal errors now always display full stack traces, while non-fatal errors show brief descriptions with full details available in verbose mode. TypeScript compilation errors now display the actual compilation errors instead of just exit codes. All errors are properly logged and no longer silently suppressed.
