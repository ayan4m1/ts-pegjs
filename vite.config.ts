import viteTsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';
import typescript from '@rollup/plugin-typescript';

/**
 * The main configuration for Vite. This config includes
 * a custom plugin to pre-process `html` files when run in development mode.
 */
export default defineConfig({
  plugins: [viteTsconfigPaths()],
  base: './',
  build: {
    outDir: 'dist',
    minify: false,
    lib: { entry: ['./src/cli.ts', './src/tspegjs.ts'], formats: ['es', 'cjs'] },
    rollupOptions: {
      external: [/^node:/, 'peggy', 'ts-morph', /^prettier/],
      plugins: [
        typescript({
          rootDir: './src',
          noEmit: false,
          declaration: true,
          declarationDir: './dist'
        })
      ]
    }
  },
  test: { globals: true, testTimeout: 25000 }
});
