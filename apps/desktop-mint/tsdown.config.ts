import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { defineConfig } from 'tsdown'

/** Bundle the Electron main process while keeping host-managed runtimes external. */
export default defineConfig({
  define: { MINT_ASSEMBLY_DIGEST: JSON.stringify(createHash('sha256').update(readFileSync(new URL('./backend/assembly.json', import.meta.url))).digest('hex')) },
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
