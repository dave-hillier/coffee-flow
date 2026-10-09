import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained page: scripts and styles are inlined so dist/index.html opens straight from disk.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  build: { outDir: 'dist', emptyOutDir: true },
  test: { environment: 'node', include: ['src/app/**/*.test.ts'] }
});
