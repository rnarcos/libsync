// @ts-ignore - the path exists but there's no type definition
import nativewind from 'nativewind/preset';
import baseConfig from './base.js';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [baseConfig, nativewind],
};
