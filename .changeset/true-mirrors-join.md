---
'libsync': patch
---

Add support for tsgo (TypeScript 7) as an alternative compiler:

- **New configuration option**: Added `typescript.runner` field to `libsync.config.mjs` with options `'tsc'` (default) or `'tsgo'` (experimental)
- **Backward compatible**: Default behavior remains unchanged, using the stable `tsc` compiler
- **Enhanced error handling**: Clear error messages when `tsgo` is selected but not installed, with installation instructions
- **Performance potential**: Users can opt-in to Microsoft's faster Go-based TypeScript compiler for declaration generation

Example configuration:
```javascript
export default {
  typescript: {
    runner: 'tsgo', // Use experimental tsgo instead of tsc
  },
};
```

Note: tsgo is experimental preview software. Install with `npm install -g @typescript/native-preview`. Some edge cases in declaration emit may not work yet.
