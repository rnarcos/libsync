/** @type {import('libsync').LibsyncConfig} */
export default {
  commands: {
    build: {
      tsup: {
        loader: {
          '.json': 'copy',
        },
      },
    },
  },
};
