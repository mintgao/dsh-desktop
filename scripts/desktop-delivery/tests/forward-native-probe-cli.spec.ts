/** The actual CLI retains application and data roots when launch completion is unknown. */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { object } from '../evidence.ts'

it('preserves root ownership and the first failure through the actual CLI module', async () => {
  const execute = promisify(execFile)
  const result = await execute(process.execPath, ['--experimental-vm-modules',
    fileURLToPath(new URL('./fixtures/forward-native-probe-cli.mjs', import.meta.url))], {
    env: { PATH: process.env.PATH }, timeout: 20_000,
  })
  expect(object(JSON.parse(result.stdout)).results).toHaveLength(5)
})
