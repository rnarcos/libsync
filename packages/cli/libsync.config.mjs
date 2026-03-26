/** @type {import('libsync').LibsyncConfig} */
export default {
  files: {
    ignoreExportPaths: ['cli/*'],
  },
  commands: {
    build: {
      formats: {
        bin: [
          {
            command: 'libsync',
            path: 'src/cli/index.js',
            format: 'esm',
          },
        ],
      },
    },
  },
};
