/** Build only the separately packed Mint extensions, retaining runtime imports. */
import { resolve, join } from 'node:path'
import { capture } from './release/process.ts'

const root = resolve(import.meta.dirname, '..')
capture('npm', ['run', 'build:lib:host'], { cwd: root, env: process.env })
capture(join(root, 'node_modules/.bin/tsc'), ['-b', 'packages/bundle/desktop-mint', 'packages/client/ui-session-notifications'], { cwd: root, env: process.env })
const tsdown = join(root, 'node_modules/.bin/tsdown')
console.log(capture(tsdown, ['--config', 'tsdown.config.ts'], { cwd: join(root, 'packages/client/ui-session-notifications'), env: process.env }))
console.log(capture(tsdown, ['--no-config', 'src/index.ts', '--out-dir', 'lib', '--format', 'esm', '--no-dts', '--no-fixed-extension', '--no-clean'], { cwd: join(root, 'packages/bundle/desktop-mint'), env: process.env }))
