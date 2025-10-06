const baseConfig = require('@libsync/tailwind-config/base');

/** @type {import('tailwindcss').Config} */
module.exports = {
  ...baseConfig,
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './storybook/**/*.{js,ts,jsx,tsx,mdx}',
  ],

  theme: {
    ...baseConfig.theme,
    extend: {
      ...baseConfig.theme?.extend,
      colors: {
        ...baseConfig.theme?.extend?.colors,
      },
    },
  },
};
