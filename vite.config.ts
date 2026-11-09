import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Cała gra trafia do jednego pliku dist/index.html (JS, CSS i font w środku),
// żeby dało się go wysłać kolegom i otworzyć bez serwera.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    target: 'es2020',
    assetsInlineLimit: () => true,
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
