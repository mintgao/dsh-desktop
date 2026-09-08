/** Workflow ownership and recovery routing remain separate from candidate execution. */
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { load } from 'js-yaml'
import { object } from '../evidence.ts'
function workflow(name: string): Record<string, unknown> { return object(load(readFileSync(`.github/workflows/${name}.yml`, 'utf8'))) }
it('schedules only discovery and limits notification to Issues under one distribution lock', () => {
  const discovery = workflow('desktop-delivery-discover')
  expect(object(discovery.on).schedule).toEqual([{ cron: '17 * * * *' }])
  const notify = object(object(discovery.jobs).notify)
  expect(notify.permissions).toEqual({ actions: 'read', contents: 'read', issues: 'write' })
  expect(object(notify.concurrency)['cancel-in-progress']).toBe(false)
  for (const name of ['adopt', 'qualify', 'mutate']) expect(object(workflow(`desktop-delivery-${name}`).on).schedule).toBeUndefined()
})
it('preserves bootstrap cancellation isolation and requires source checks and retained recovery routing', () => {
  const ci = workflow('desktop-ci')
  expect(object(ci.concurrency)['cancel-in-progress']).toBe('${{ inputs.bootstrap != true && inputs.probe != true }}')
  expect(object(object(ci.jobs).quality).if).toBe('inputs.bootstrap != true && inputs.probe != true')
  const qualification = readFileSync('.github/workflows/desktop-delivery-qualify.yml', 'utf8')
  for (const check of ['test:desktop', 'build:desktop', 'typecheck', 'doc-sync', '--copy-install', '--publish never', 'persist-credentials: false']) expect(qualification).toContain(check)
  const mutate = workflow('desktop-delivery-mutate')
  expect(object(mutate.concurrency)['cancel-in-progress']).toBe(false)
  expect(object(object(mutate.jobs).mutate).environment).toBe('mint-publication')
  const text = readFileSync('.github/workflows/desktop-delivery-mutate.yml', 'utf8')
  expect(text).toContain("if: inputs.operation != 'promote'")
  expect(text).toContain(' release-bundle ')
  expect(text).toContain('desktop-mutation-bundle')
})
