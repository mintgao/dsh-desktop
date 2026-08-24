import { defineConfig } from 'tsdown'

/** Bundle the Electron main process while keeping Electron as a runtime builtin. */
export default defineConfig({
  entry: ['lib/types/main.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  deps: { neverBundle: ['electron'] },
  fixedExtension: false,
  dts: false,
  clean: false,
})
