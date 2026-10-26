import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/widget/iife-entry.ts'),
      name: 'VNInvestCharts',
      formats: ['umd', 'es'],
      fileName: (format) => `vninvestcharts.${format}.js`,
    },
    rollupOptions: {
      // UMD: bundle React — ESM: external
      external: (id) => {
        if (process.env.BUILD_TARGET === 'esm') {
          return ['react', 'react-dom', 'react/jsx-runtime'].includes(id);
        }
        return false; // UMD bundles everything
      },
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react/jsx-runtime': 'JSX',
        }
      }
    },
  },
});


