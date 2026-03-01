import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'drizzle.config.ts'],
  format: ['cjs'],
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  target: 'node20',
  // tsup resolves @/* path aliases from tsconfig automatically
});
