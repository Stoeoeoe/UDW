import { config } from '@remotion/eslint-config-flat';

export default [
  ...config,
  {
    ignores: [
      'node_modules/**',
      '.npm-cache/**',
      '.scaffold/**',
      'out/**',
      'dist/**',
    ],
  },
];
