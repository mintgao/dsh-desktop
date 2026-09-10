import { defineConfig } from 'tsdown'

/** Bundle the Electron main process while keeping host-managed runtimes external. */
export default defineConfig({
  entry: ['lib/types/main.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  deps: { neverBundle: ['electron', 'electron-updater'] },
  fixedExtension: false,
  dts: false,
  clean: false,
})
