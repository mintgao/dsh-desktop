/** An exited group leader cannot hide a still-running owned descendant. */
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { expect, it, vi } from 'vitest'
import { migrationGroupExists, migrationGroupQuiescent, terminateMigrationGroup } from '../migration-processes.ts'

it.skipIf(process.platform === 'win32')('terminates descendants after their detached parent has exited', async () => {
  const fixtureId = `dsh-migration-cleanup-${randomUUID()}`
  const program = `const {spawn}=require('node:child_process');
    const child=spawn(process.execPath,['-e','setInterval(()=>{},1000);process.send({pid:process.pid})',${JSON.stringify(fixtureId)}],{stdio:['ignore','ignore','ignore','ipc']});
    child.once('message',message=>{process.stdout.write(String(message.pid));child.disconnect();child.unref()});`
  const parent = spawn(process.execPath, ['-e', program], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const closed = once(parent, 'close')
  let descendant = ''
  parent.stdout.on('data', (bytes: Buffer) => { descendant += bytes.toString() })
  try {
    expect(await closed).toEqual([0, null])
    expect(Number(descendant)).toBeGreaterThan(0)
    if (parent.pid === undefined) throw new Error('Detached fixture has no PID')
    expect(migrationGroupExists(parent.pid)).toBe(true)
    expect(await terminateMigrationGroup(parent.pid)).toEqual({ membersPresent: true, quiescent: true })
    expect(migrationGroupExists(parent.pid)).toBe(false)
  } finally {
    if (parent.pid !== undefined) await terminateMigrationGroup(parent.pid)
    await closed
  }
})

it('does not interpret persistent probe denial as group disappearance', async () => {
  const failure = Object.assign(new Error('Synthetic denied group observation'), { code: 'EPERM' })
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => { throw failure })
  try { await expect(migrationGroupQuiescent(123456, 0)).rejects.toBe(failure) }
  finally { kill.mockRestore() }
})
