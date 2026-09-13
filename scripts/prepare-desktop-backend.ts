/** Prepare the exact official runtime plus separately packed Mint extensions. */
import { resolve } from 'node:path'
import { prepareDesktopAssembly } from './desktop-assembly.ts'

prepareDesktopAssembly(resolve(import.meta.dirname, '..'))
