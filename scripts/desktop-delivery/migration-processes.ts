/** Quiescence of the detached process group owned by a migration fixture. */
import { setTimeout as delay } from 'node:timers/promises'

/** Check the owned process group independently of whether its leader already exited.
 * @param pid - PID originally returned by the fixture's detached spawn.
 * @returns Whether any member still exists.
 */
export function migrationGroupExists(pid: number): boolean {
  try { process.kill(-pid, 0); return true }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
    throw error
  }
}

/** Await observed disappearance, using the deadline only as a failure bound.
 * @param pid - Owned detached process group's original leader PID.
 * @param timeout - Maximum milliseconds allowed for actual group disappearance.
 * @returns True only after the OS reports that the group no longer exists.
 */
export async function migrationGroupQuiescent(pid: number, timeout: number): Promise<boolean> {
  const deadline = performance.now() + timeout
  for (;;) {
    let unresolved: Error | undefined
    try { if (!migrationGroupExists(pid)) return true }
    catch (error) {
      // Darwin can deny a group probe briefly after SIGKILL while reaping it.
      // Only a later ESRCH establishes quiescence; persistent denial still fails.
      if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error
      unresolved = error instanceof Error ? error : new Error(String(error))
    }
    if (performance.now() >= deadline) {
      if (unresolved !== undefined) throw unresolved
      return false
    }
    await delay(Math.min(10, Math.max(1, deadline - performance.now())))
  }
}

/** Terminate all remaining members, including descendants of an exited leader.
 * @param pid - Owned detached process group's original leader PID.
 * @returns Whether cleanup found members and proof that the group disappeared.
 */
export async function terminateMigrationGroup(pid: number): Promise<{ membersPresent: boolean; quiescent: true }> {
  const membersPresent = migrationGroupExists(pid)
  if (membersPresent) {
    try { process.kill(-pid, 'SIGKILL') }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
  }
  if (!await migrationGroupQuiescent(pid, 5000)) throw new Error('Migration process group survived forced termination')
  return { membersPresent, quiescent: true }
}
