import { defineConfig } from 'tsup';

// export default defineConfig({
// 	entry: ['src/server.ts'],
// 	format: ['esm'],
// 	target: 'node20',
// 	outDir: 'dist',
// 	clean: true,
// 	sourcemap: true,
// 	noExternal: [/generated\/prisma/],
// });


export default defineConfig({
  entry: ['src/server.ts', 'src/app.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/generated\/prisma/],
});