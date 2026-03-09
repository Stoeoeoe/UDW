import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/theme/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    'react',
    'react-dom',
    '@chakra-ui/react',
    '@chakra-ui/icons',
    '@emotion/react',
    '@emotion/styled',
    'framer-motion',
    'react-icons',
    'react-resizable-panels',
  ],
  treeshake: true,
});
