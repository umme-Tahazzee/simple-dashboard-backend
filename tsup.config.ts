import { defineConfig } from 'tsup';

// Bundles our code (including the generated Prisma client's TS wrapper) into one ESM file.
// Dependencies in node_modules stay external and are loaded at runtime.
export default defineConfig({
	entry: ['src/server.ts'],
	format: ['esm'],
	target: 'node20',
	outDir: 'dist',
	clean: true,
	sourcemap: true,
	// tsup externalizes dependencies by default; the generated client is local source so it gets bundled
	noExternal: [/generated\/prisma/],
});
