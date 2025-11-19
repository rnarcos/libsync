module.exports = {
  extends: [
    "@libsync/eslint-config/typescript",
    "@libsync/eslint-config/react",
    "plugin:storybook/recommended",
  ],
  parserOptions: {
    project: "./tsconfig.json",
  },
};
